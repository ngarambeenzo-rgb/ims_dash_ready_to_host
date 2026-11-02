<?php
// ============================================================
//  api/notify_lib.php — IMS email + payment alerts
//  All addresses and the sending key come from ims_settings
//  (IMS → System Settings → Email & alerts).
//  Sending uses Brevo over HTTPS (works on InfinityFree, where
//  PHP mail() and SMTP are blocked).
// ============================================================

function imsSetting(PDO $db, string $key, $default = '') {
    static $cache = [];
    if (!array_key_exists($key, $cache)) {
        $st = $db->prepare('SELECT `value` FROM ims_settings WHERE `key` = ?');
        $st->execute([$key]);
        $v = $st->fetchColumn();
        $cache[$key] = ($v === false || $v === null) ? $default : $v;
    }
    return $cache[$key];
}

function imsSaveSetting(PDO $db, string $key, $value): void {
    $db->prepare('INSERT INTO ims_settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)')
       ->execute([$key, $value]);
}

// "a@x.com, b@y.com\nc@z.com" → valid unique addresses
function imsEmailList(string $raw): array {
    $out = [];
    foreach (preg_split('/[\s,;]+/', $raw) as $e) {
        $e = strtolower(trim($e));
        if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) $out[$e] = true;
    }
    return array_keys($out);
}

// Send one email to many recipients. Returns [ok, error]
function imsSendMail(PDO $db, array $to, string $subject, string $html, string $replyTo = ''): array {
    if (!$to) return [false, 'No recipient email addresses are set in IMS → Settings → Email & alerts'];
    $key  = trim(imsSetting($db, 'mail_api_key'));
    $from = trim(imsSetting($db, 'mail_from'));
    $name = trim(imsSetting($db, 'mail_from_name', 'IMS — BarMS')) ?: 'IMS — BarMS';
    if ($key === '' || $from === '') return [false, 'Email sending is not set up (IMS → Settings → Email & alerts: Brevo key and sender address)'];
    if (!function_exists('curl_init')) return [false, 'cURL is not available on this server'];

    $payload = [
        'sender'      => ['name' => $name, 'email' => $from],
        'to'          => array_map(fn($e) => ['email' => $e], $to),
        'subject'     => $subject,
        'htmlContent' => $html,
    ];
    if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $payload['replyTo'] = ['email' => $replyTo];

    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return [false, 'Could not reach the email service: ' . $err];
    if ($code >= 200 && $code < 300) return [true, ''];
    $j = json_decode($resp, true);
    return [false, 'Email service error ' . $code . ': ' . mb_substr($j['message'] ?? $resp, 0, 160)];
}

function imsMailLayout(string $title, string $bodyHtml): string {
    return '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#2D1B69">'
         . '<div style="background:#1E3A8A;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700">' . htmlspecialchars($title) . '</div>'
         . '<div style="border:1px solid #E2E8F0;border-top:none;padding:18px;border-radius:0 0 10px 10px;font-size:14px;line-height:1.55">' . $bodyHtml . '</div>'
         . '<div style="font-size:11px;color:#94A3B8;margin-top:10px">Sent automatically by IMS — Integrated Management Solutions</div></div>';
}

// ── PAYMENT ALERTS ─────────────────────────────────
// Emails the IMS team about clients who must pay: ending within N days, ending today, overdue.
// Each subscription is emailed once per kind per expiry date (ims_alert_log).
// $force = run even if it already ran within the last hour.
function imsRunPaymentAlerts(PDO $db, bool $force = false): array {
    $last = imsSetting($db, 'alerts_last_run');
    if (!$force && $last && (time() - (int)$last) < 3600) return ['skipped' => true];
    imsSaveSetting($db, 'alerts_last_run', (string)time());

    $to = imsEmailList(imsSetting($db, 'alert_emails'));
    $days = max(1, min(60, (int)imsSetting($db, 'alert_days_before', '7')));

    // latest subscription per client
    $rows = $db->query("
        SELECT s.id, s.client_id, s.expiry_date, s.status, s.max_devices, c.business_name, c.contact_phone, c.contact_email, p.name AS plan, p.price_rwf AS price
        FROM ims_subscriptions s
        JOIN ims_clients c ON c.id = s.client_id
        LEFT JOIN ims_subscription_plans p ON p.id = s.plan_id
        WHERE s.id = (SELECT s2.id FROM ims_subscriptions s2 WHERE s2.client_id = s.client_id ORDER BY s2.expiry_date DESC, s2.id DESC LIMIT 1)
          AND c.status <> 'suspended'
    ")->fetchAll();

    $today = new DateTime('today');
    $due = [];
    foreach ($rows as $r) {
        $exp = new DateTime($r['expiry_date']);
        $diff = (int)$today->diff($exp)->format('%r%a');
        $kind = $diff < 0 ? 'overdue' : ($diff === 0 ? 'due_today' : ($diff <= $days ? 'due_soon' : null));
        if (!$kind) continue;
        $seen = $db->prepare('SELECT 1 FROM ims_alert_log WHERE subscription_id = ? AND kind = ? AND expiry_date = ? AND ok = 1');
        $seen->execute([$r['id'], $kind, $r['expiry_date']]);
        if ($seen->fetchColumn()) continue;
        $r['_kind'] = $kind; $r['_days'] = $diff;
        $due[] = $r;
    }
    if (!$due) return ['sent' => 0, 'due' => 0];

    $label = ['overdue' => 'OVERDUE', 'due_today' => 'Ends TODAY', 'due_soon' => 'Ends soon'];
    $rowsHtml = '';
    foreach ($due as $r) {
        $when = $r['_kind'] === 'overdue' ? abs($r['_days']) . ' day(s) ago' : ($r['_kind'] === 'due_today' ? 'today' : 'in ' . $r['_days'] . ' day(s)');
        $color = $r['_kind'] === 'due_soon' ? '#C2410C' : '#BE123C';
        $rowsHtml .= '<tr>'
            . '<td style="padding:8px;border-bottom:1px solid #EEE"><b>' . htmlspecialchars($r['business_name']) . '</b><br><span style="color:#64748B;font-size:12px">'
            . htmlspecialchars(trim(($r['contact_phone'] ?? '') . '  ' . ($r['contact_email'] ?? ''))) . '</span></td>'
            . '<td style="padding:8px;border-bottom:1px solid #EEE">' . htmlspecialchars($r['plan'] ?? '') . '<br><span style="color:#64748B;font-size:12px">RWF ' . number_format((float)($r['price'] ?? 0)) . '</span></td>'
            . '<td style="padding:8px;border-bottom:1px solid #EEE;color:' . $color . ';font-weight:700">' . $label[$r['_kind']] . '<br><span style="font-weight:400;font-size:12px">' . htmlspecialchars($r['expiry_date']) . ' (' . $when . ')</span></td>'
            . '</tr>';
    }
    $html = imsMailLayout(count($due) . ' client(s) need to pay',
        '<p>These BarMS clients must renew their subscription:</p>'
        . '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:#64748B;font-size:12px"><th style="padding:8px">Client</th><th style="padding:8px">Plan</th><th style="padding:8px">Subscription</th></tr>'
        . $rowsHtml . '</table><p style="margin-top:14px">Record their payment in IMS → Payments to renew them.</p>');
    [$ok, $err] = imsSendMail($db, $to, 'BarMS: ' . count($due) . ' client(s) need to pay', $html);

    $ins = $db->prepare('INSERT INTO ims_alert_log (subscription_id, client_id, kind, expiry_date, sent_to, ok, error) VALUES (?,?,?,?,?,?,?)
                         ON DUPLICATE KEY UPDATE sent_to = VALUES(sent_to), ok = VALUES(ok), error = VALUES(error), created_at = NOW()');
    foreach ($due as $r) $ins->execute([$r['id'], $r['client_id'], $r['_kind'], $r['expiry_date'], implode(', ', $to), $ok ? 1 : 0, $ok ? null : mb_substr($err, 0, 250)]);
    return ['sent' => $ok ? count($due) : 0, 'due' => count($due), 'ok' => $ok, 'error' => $err];
}
