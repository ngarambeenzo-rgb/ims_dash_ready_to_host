<?php
// ============================================================
//  api/support.php — IMS
//  Public (called by BarMS servers):
//    POST action=submit  {clientId, deviceUuid, category, subject, message, contact, sentBy, barName}
//         → saved as a ticket and emailed to every address in "support_emails"
//  Admin (IMS dashboard, logged in):
//    GET  action=list                 tickets
//    POST action=set_status {id,status}
//    POST action=resend {id}
//    GET  action=email_settings       POST action=save_email_settings
//    POST action=test_email {to}      POST action=run_alerts      GET action=alert_log
// ============================================================
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/notify_lib.php';

$action = $_REQUEST['action'] ?? '';
$db     = getDB();
$body   = json_decode(file_get_contents('php://input'), true) ?: [];

const IMS_SUPPORT_CATEGORIES = ['bug' => 'Something is not working', 'question' => 'Question', 'billing' => 'Licence or payment', 'feature' => 'Idea / new feature'];

function imsTicketEmail(PDO $db, array $t): array {
    $to = imsEmailList(imsSetting($db, 'support_emails'));
    $cat = IMS_SUPPORT_CATEGORIES[$t['category']] ?? $t['category'];
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $html = imsMailLayout('BarMS support — ' . $cat,
        '<table style="font-size:13px;margin-bottom:12px">'
        . '<tr><td style="color:#64748B;padding:2px 12px 2px 0">Bar</td><td><b>' . $h($t['bar_name']) . '</b> (client #' . (int)$t['client_id'] . ')</td></tr>'
        . '<tr><td style="color:#64748B;padding:2px 12px 2px 0">From</td><td>' . $h($t['sent_by']) . '</td></tr>'
        . '<tr><td style="color:#64748B;padding:2px 12px 2px 0">Contact</td><td>' . $h($t['contact'] ?: '—') . '</td></tr>'
        . '<tr><td style="color:#64748B;padding:2px 12px 2px 0">Ticket</td><td>#' . (int)$t['id'] . '</td></tr></table>'
        . '<div style="font-weight:700;margin-bottom:6px">' . $h($t['subject']) . '</div>'
        . '<div style="white-space:pre-wrap;background:#F8FAFC;border-radius:8px;padding:12px">' . $h($t['message']) . '</div>');
    $reply = filter_var($t['contact'], FILTER_VALIDATE_EMAIL) ? $t['contact'] : '';
    return imsSendMail($db, $to, "[BarMS #{$t['id']}] {$t['bar_name']}: {$t['subject']}", $html, $reply);
}

// ── PUBLIC: a bar sends a message ──────────────────
if ($action === 'submit') {
    header('Content-Type: application/json');
    $clientId = (int)($body['clientId'] ?? 0);
    $device   = trim($body['deviceUuid'] ?? '');
    $subject  = mb_substr(trim($body['subject'] ?? ''), 0, 150);
    $message  = mb_substr(trim($body['message'] ?? ''), 0, 5000);
    $category = array_key_exists($body['category'] ?? '', IMS_SUPPORT_CATEGORIES) ? $body['category'] : 'question';
    if (!$clientId || !$device) jsonOut(['ok' => false, 'error' => 'This BarMS is not activated'], 400);
    if ($subject === '' || mb_strlen($message) < 5) jsonOut(['ok' => false, 'error' => 'Subject and message are required'], 400);

    // only an approved device of that client may write in its name
    $st = $db->prepare("SELECT c.id, c.business_name FROM ims_devices d JOIN ims_clients c ON c.id = d.client_id WHERE d.client_id = ? AND d.device_uuid = ? AND d.status = 'approved' LIMIT 1");
    $st->execute([$clientId, $device]);
    $client = $st->fetch();
    if (!$client) jsonOut(['ok' => false, 'error' => 'Device not recognised by IMS'], 403);

    // simple flood guard: max 10 messages per client per hour
    $fl = $db->prepare('SELECT COUNT(*) FROM ims_support_tickets WHERE client_id = ? AND created_at > NOW() - INTERVAL 1 HOUR');
    $fl->execute([$clientId]);
    if ((int)$fl->fetchColumn() >= 10) jsonOut(['ok' => false, 'error' => 'Too many messages in one hour. Please wait a little.'], 429);

    $t = [
        'client_id' => $clientId, 'bar_name' => $client['business_name'], 'category' => $category, 'subject' => $subject, 'message' => $message,
        'contact' => mb_substr(trim($body['contact'] ?? ''), 0, 150), 'sent_by' => mb_substr(trim($body['sentBy'] ?? ''), 0, 100),
    ];
    $db->prepare('INSERT INTO ims_support_tickets (client_id, bar_name, category, subject, message, contact, sent_by) VALUES (?,?,?,?,?,?,?)')
       ->execute([$t['client_id'], $t['bar_name'], $t['category'], $t['subject'], $t['message'], $t['contact'], $t['sent_by']]);
    $t['id'] = (int)$db->lastInsertId();
    [$ok, $err] = imsTicketEmail($db, $t);
    $db->prepare('UPDATE ims_support_tickets SET email_status = ?, email_error = ? WHERE id = ?')->execute([$ok ? 'sent' : 'failed', $ok ? null : mb_substr($err, 0, 250), $t['id']]);
    // IMS has the ticket either way; the email is only the notification
    jsonOut(['ok' => true, 'ticketId' => $t['id'], 'emailed' => $ok, 'emailError' => $ok ? '' : $err]);
}

// ── ADMIN ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();

if ($action === 'list') {
    $rows = $db->query('SELECT * FROM ims_support_tickets ORDER BY (status = "resolved"), id DESC LIMIT 300')->fetchAll();
    $counts = $db->query("SELECT status, COUNT(*) c FROM ims_support_tickets GROUP BY status")->fetchAll(PDO::FETCH_KEY_PAIR);
    jsonOut(['ok' => true, 'data' => $rows, 'counts' => $counts, 'categories' => IMS_SUPPORT_CATEGORIES]);
}

if ($action === 'set_status') {
    $id = (int)($body['id'] ?? 0); $status = $body['status'] ?? '';
    if (!in_array($status, ['new', 'in_progress', 'resolved'], true)) jsonOut(['ok' => false, 'error' => 'Unknown status'], 400);
    $db->prepare('UPDATE ims_support_tickets SET status = ? WHERE id = ?')->execute([$status, $id]);
    auditLog('SUPPORT_STATUS', "Ticket #$id → $status");
    jsonOut(['ok' => true]);
}

if ($action === 'resend') {
    $id = (int)($body['id'] ?? 0);
    $st = $db->prepare('SELECT * FROM ims_support_tickets WHERE id = ?'); $st->execute([$id]);
    $t = $st->fetch();
    if (!$t) jsonOut(['ok' => false, 'error' => 'Ticket not found'], 404);
    [$ok, $err] = imsTicketEmail($db, $t);
    $db->prepare('UPDATE ims_support_tickets SET email_status = ?, email_error = ? WHERE id = ?')->execute([$ok ? 'sent' : 'failed', $ok ? null : mb_substr($err, 0, 250), $id]);
    jsonOut($ok ? ['ok' => true] : ['ok' => false, 'error' => $err]);
}

if ($action === 'email_settings') {
    $key = imsSetting($db, 'mail_api_key');
    jsonOut(['ok' => true, 'data' => [
        'supportEmails'   => imsSetting($db, 'support_emails'),
        'alertEmails'     => imsSetting($db, 'alert_emails'),
        'alertDaysBefore' => (int)imsSetting($db, 'alert_days_before', '7'),
        'mailFrom'        => imsSetting($db, 'mail_from'),
        'mailFromName'    => imsSetting($db, 'mail_from_name', 'IMS — BarMS'),
        'hasApiKey'       => $key !== '',
        'apiKeyHint'      => $key !== '' ? '…' . substr($key, -4) : '',
    ]]);
}

if ($action === 'save_email_settings') {
    $support = imsEmailList($body['supportEmails'] ?? '');
    $alerts  = imsEmailList($body['alertEmails'] ?? '');
    $from    = trim($body['mailFrom'] ?? '');
    if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) jsonOut(['ok' => false, 'error' => 'The sender address is not a valid email'], 400);
    imsSaveSetting($db, 'support_emails', implode("\n", $support));
    imsSaveSetting($db, 'alert_emails', implode("\n", $alerts));
    imsSaveSetting($db, 'alert_days_before', (string)max(1, min(60, (int)($body['alertDaysBefore'] ?? 7))));
    imsSaveSetting($db, 'mail_from', $from);
    imsSaveSetting($db, 'mail_from_name', mb_substr(trim($body['mailFromName'] ?? ''), 0, 80) ?: 'IMS — BarMS');
    if (isset($body['apiKey']) && trim($body['apiKey']) !== '') imsSaveSetting($db, 'mail_api_key', trim($body['apiKey']));
    auditLog('EMAIL_SETTINGS', count($support) . ' support address(es), ' . count($alerts) . ' alert address(es)');
    jsonOut(['ok' => true, 'supportCount' => count($support), 'alertCount' => count($alerts)]);
}

if ($action === 'test_email') {
    $to = imsEmailList($body['to'] ?? '');
    if (!$to) $to = imsEmailList(imsSetting($db, 'support_emails') . "\n" . imsSetting($db, 'alert_emails'));
    [$ok, $err] = imsSendMail($db, $to, 'IMS test email', imsMailLayout('Test email', '<p>Email from IMS is working. Support messages from BarMS and payment alerts will arrive like this.</p>'));
    jsonOut($ok ? ['ok' => true, 'sentTo' => $to] : ['ok' => false, 'error' => $err]);
}

if ($action === 'run_alerts') {
    jsonOut(['ok' => true, 'result' => imsRunPaymentAlerts($db, true)]);
}

if ($action === 'alert_log') {
    $rows = $db->query('SELECT a.*, c.business_name FROM ims_alert_log a LEFT JOIN ims_clients c ON c.id = a.client_id ORDER BY a.id DESC LIMIT 50')->fetchAll();
    jsonOut(['ok' => true, 'data' => $rows]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
