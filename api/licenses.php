<?php
// ============================================================
//  IMS — api/licenses.php  (FIXED)
//  BarMS-facing: activate_with_key, renew, get_for_device
//  Admin-facing: list, generate, revoke, view_token
// ============================================================
require_once __DIR__ . '/../config/db.php';

$action = $_REQUEST['action'] ?? 'list';
$db     = getDB();

// ══════════════════════════════════════════════════════════════
//  BARMS-FACING ENDPOINTS — no session required
// ══════════════════════════════════════════════════════════════

// ── ACTIVATE WITH KEY ─────────────────────────────────────────
if ($action === 'activate_with_key') {
    $body          = json_decode(file_get_contents('php://input'), true);
    $activationKey = strtoupper(trim($body['activationKey'] ?? ''));
    $deviceUuid    = trim($body['deviceUuid'] ?? '');
    $deviceName    = trim($body['deviceName'] ?? 'BarMS Device');
    $deviceType    = trim($body['deviceType'] ?? 'Desktop');

    if (!$activationKey || !$deviceUuid) {
        jsonOut(['ok' => false, 'error' => 'Activation key and device ID required'], 400);
    }

    // Look up client by activation_key column on ims_clients
    $clientStmt = $db->prepare('SELECT * FROM ims_clients WHERE activation_key = ? LIMIT 1');
    $clientStmt->execute([$activationKey]);
    $client = $clientStmt->fetch();

    if (!$client) {
        jsonOut(['ok' => false, 'error' => 'Invalid activation key. Check the key and try again.'], 404);
    }

    if ($client['status'] === 'suspended') {
        jsonOut(['ok' => false, 'error' => 'Account suspended. Contact IMS Company.'], 403);
    }

    $clientId = (int)$client['id'];

    // Get active subscription
    $subStmt = $db->prepare('
        SELECT s.*, sp.name AS plan_name, sp.max_devices
        FROM ims_subscriptions s
        JOIN ims_subscription_plans sp ON sp.id = s.plan_id
        WHERE s.client_id = ? AND s.status = "active"
        ORDER BY s.expiry_date DESC LIMIT 1
    ');
    $subStmt->execute([$clientId]);
    $sub = $subStmt->fetch();

    if (!$sub) {
        jsonOut(['ok' => false, 'error' => 'No active subscription found. Contact IMS Company to subscribe.'], 403);
    }

    if (strtotime($sub['expiry_date']) < time()) {
        jsonOut(['ok' => false, 'error' => 'Subscription expired on ' . $sub['expiry_date'] . '. Contact IMS Company to renew.'], 403);
    }

    $maxDevices = (int)($sub['max_devices'] ?? 2);

    // Register or find device
    $devStmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id=? AND device_uuid=? LIMIT 1');
    $devStmt->execute([$clientId, $deviceUuid]);
    $device = $devStmt->fetch();

    if (!$device) {
        $db->prepare('INSERT INTO ims_devices (client_id, device_uuid, device_name, status) VALUES (?,?,?,?)')
           ->execute([$clientId, $deviceUuid, $deviceName, 'approved']);
        $deviceId = (int)$db->lastInsertId();
    } else {
        $deviceId = (int)$device['id'];
        if ($device['status'] === 'blocked') {
            jsonOut(['ok' => false, 'error' => 'This device has been blocked. Contact IMS Company.'], 403);
        }
        if ($device['status'] === 'pending') {
            $db->prepare('UPDATE ims_devices SET status="approved" WHERE id=?')->execute([$deviceId]);
        }
        $db->prepare('UPDATE ims_devices SET last_sync=NOW() WHERE id=?')->execute([$deviceId]);
    }

    // Generate license
    $licenseId = _generateLicense($clientId, $deviceId, $sub['plan_id'], $maxDevices, 24);
    if (!$licenseId) jsonOut(['ok' => false, 'error' => 'License generation failed. Contact IMS Company.'], 500);

    $tokenStmt = $db->prepare('SELECT token, expires_at FROM ims_licenses WHERE id=?');
    $tokenStmt->execute([$licenseId]);
    $license = $tokenStmt->fetch();

    $daysLeft = max(0, (int)ceil((strtotime($sub['expiry_date']) - time()) / 86400));

    try { auditLog('ACTIVATION', "BarMS activated for {$client['business_name']} — key: $activationKey"); } catch(Exception $e) {}

    jsonOut([
        'ok'              => true,
        'token'           => $license['token'],
        'clientId'        => $clientId,
        'barName'         => $client['business_name'],
        'plan'            => $sub['plan_name'],
        'maxDevices'      => $maxDevices,
        'expiresAt'       => strtotime($license['expires_at']),
        'subscriptionEnd' => strtotime($sub['expiry_date']),
        'daysLeft'        => $daysLeft,
        'message'         => "Activated! Welcome to {$client['business_name']} — $daysLeft days remaining.",
    ]);
}

// ── RENEW LICENSE ─────────────────────────────────────────────
if ($action === 'renew') {
    $body       = json_decode(file_get_contents('php://input'), true);
    $clientId   = (int)($body['clientId'] ?? 0);
    $deviceUuid = trim($body['deviceUuid'] ?? '');

    if (!$clientId || !$deviceUuid) jsonOut(['ok' => false, 'error' => 'clientId and deviceUuid required'], 400);

    $clientStmt = $db->prepare('SELECT * FROM ims_clients WHERE id=? LIMIT 1');
    $clientStmt->execute([$clientId]);
    $client = $clientStmt->fetch();
    if (!$client) jsonOut(['ok' => false, 'error' => 'client_not_found'], 404);

    if ($client['status'] === 'suspended') {
        jsonOut(['ok' => false, 'lockNow' => true, 'error' => 'client_suspended', 'message' => 'Account suspended. Contact IMS Company.'], 403);
    }

    $devStmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id=? AND device_uuid=? LIMIT 1');
    $devStmt->execute([$clientId, $deviceUuid]);
    $device = $devStmt->fetch();
    if (!$device) jsonOut(['ok' => false, 'error' => 'device_not_found', 'message' => 'Device not registered. Please re-activate BarMS.'], 403);

    if ($device['status'] === 'blocked') {
        jsonOut(['ok' => false, 'lockNow' => true, 'error' => 'device_blocked', 'message' => 'Device blocked. Contact IMS Company.'], 403);
    }

    $subStmt = $db->prepare('SELECT s.*, sp.name AS plan_name, sp.max_devices FROM ims_subscriptions s JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE s.client_id=? AND s.status="active" ORDER BY s.expiry_date DESC LIMIT 1');
    $subStmt->execute([$clientId]);
    $sub = $subStmt->fetch();

    if (!$sub) jsonOut(['ok' => false, 'lockNow' => true, 'error' => 'no_active_subscription', 'message' => 'No active subscription. Contact IMS Company to renew.'], 403);

    if (strtotime($sub['expiry_date']) < time()) {
        $db->prepare('UPDATE ims_subscriptions SET status="expired" WHERE id=?')->execute([$sub['id']]);
        $db->prepare('UPDATE ims_clients SET status="expired" WHERE id=?')->execute([$clientId]);
        jsonOut(['ok' => false, 'lockNow' => true, 'error' => 'subscription_expired', 'message' => 'Subscription expired on ' . $sub['expiry_date'] . '. Please renew.'], 403);
    }

    $db->prepare('UPDATE ims_devices SET last_sync=NOW() WHERE id=?')->execute([$device['id']]);
    try { $db->prepare('INSERT INTO ims_sync_log (client_id, device_id, license_status, ip_address) VALUES (?,?,?,?)')->execute([$clientId, $device['id'], 'renewed', $_SERVER['REMOTE_ADDR'] ?? '']); } catch(Exception $e) {}

    $licenseId = _generateLicense($clientId, $device['id'], $sub['plan_id'], $sub['max_devices'] ?? 2, 24);
    if (!$licenseId) jsonOut(['ok' => false, 'error' => 'License generation failed'], 500);

    $tokenStmt = $db->prepare('SELECT token, expires_at FROM ims_licenses WHERE id=?');
    $tokenStmt->execute([$licenseId]);
    $license = $tokenStmt->fetch();

    jsonOut([
        'ok'              => true,
        'token'           => $license['token'],
        'barName'         => $client['business_name'],
        'plan'            => $sub['plan_name'],
        'maxDevices'      => (int)($sub['max_devices'] ?? 2),
        'expiresAt'       => strtotime($license['expires_at']),
        'subscriptionEnd' => strtotime($sub['expiry_date']),
        'daysLeft'        => max(0, (int)ceil((strtotime($sub['expiry_date']) - time()) / 86400)),
    ]);
}

// ── GET FOR DEVICE (kept for compatibility) ───────────────────
if ($action === 'get_for_device') {
    $body       = json_decode(file_get_contents('php://input'), true);
    $clientId   = (int)($body['clientId'] ?? 0);
    $deviceUuid = trim($body['deviceUuid'] ?? '');
    if (!$clientId || !$deviceUuid) jsonOut(['ok' => false, 'error' => 'clientId and deviceUuid required'], 400);

    $clientStmt = $db->prepare('SELECT * FROM ims_clients WHERE id=? LIMIT 1');
    $clientStmt->execute([$clientId]);
    $client = $clientStmt->fetch();
    if (!$client) jsonOut(['ok' => false, 'error' => 'client_not_found'], 404);

    $subStmt = $db->prepare('SELECT s.*, sp.name AS plan_name, sp.max_devices FROM ims_subscriptions s JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE s.client_id=? AND s.status="active" ORDER BY s.expiry_date DESC LIMIT 1');
    $subStmt->execute([$clientId]);
    $sub = $subStmt->fetch();
    if (!$sub) jsonOut(['ok' => false, 'error' => 'no_active_subscription'], 403);

    $devStmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id=? AND device_uuid=? LIMIT 1');
    $devStmt->execute([$clientId, $deviceUuid]);
    $device = $devStmt->fetch();
    if (!$device) jsonOut(['ok' => false, 'error' => 'device_not_found'], 403);

    $db->prepare('UPDATE ims_devices SET last_sync=NOW() WHERE id=?')->execute([$device['id']]);

    $licenseId = _generateLicense($clientId, $device['id'], $sub['plan_id'], $sub['max_devices'] ?? 2, 24);
    if (!$licenseId) jsonOut(['ok' => false, 'error' => 'license_generation_failed'], 500);

    $tokenStmt = $db->prepare('SELECT token, expires_at FROM ims_licenses WHERE id=?');
    $tokenStmt->execute([$licenseId]);
    $license = $tokenStmt->fetch();

    jsonOut([
        'ok'              => true,
        'token'           => $license['token'],
        'barName'         => $client['business_name'],
        'plan'            => $sub['plan_name'],
        'maxDevices'      => (int)($sub['max_devices'] ?? 2),
        'expiresAt'       => strtotime($license['expires_at']),
        'subscriptionEnd' => strtotime($sub['expiry_date']),
        'daysLeft'        => max(0, (int)ceil((strtotime($sub['expiry_date']) - time()) / 86400)),
    ]);
}

// ══════════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS — require IMS session
// ══════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();

if ($action === 'list') {
    $status = $_GET['status'] ?? '';
    $where  = ($status && $status !== 'all') ? "WHERE l.status = " . $db->quote($status) : '';
    $stmt   = $db->query("SELECT l.*, c.business_name AS client_name, d.device_uuid, sp.name AS plan_name FROM ims_licenses l JOIN ims_clients c ON c.id = l.client_id LEFT JOIN ims_devices d ON d.id = l.device_id LEFT JOIN ims_subscription_plans sp ON sp.id = l.plan_id $where ORDER BY l.issued_at DESC LIMIT 200");
    $rows   = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id']; $r['maxDevices'] = (int)$r['max_devices'];
        $r['clientName'] = $r['client_name']; $r['planName'] = $r['plan_name'];
        $r['deviceUuid'] = $r['device_uuid']; $r['issuedAt'] = $r['issued_at'];
        $r['expiresAt']  = $r['expires_at'];
        $r['token']      = substr($r['token'] ?? '', 0, 40) . '...';
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'generate') {
    $body = json_decode(file_get_contents('php://input'), true);
    $clientId = (int)($body['clientId'] ?? 0);
    $durHrs   = (int)($body['durationHrs'] ?? 24);
    if (!$clientId) jsonOut(['ok' => false, 'error' => 'Select a client'], 400);
    $sub = $db->prepare('SELECT s.*, sp.name AS plan_name FROM ims_subscriptions s JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE s.client_id=? ORDER BY s.expiry_date DESC LIMIT 1');
    $sub->execute([$clientId]);
    $subRow = $sub->fetch();
    if (!$subRow) jsonOut(['ok' => false, 'error' => 'No subscription found'], 404);
    $devStmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id=? AND status="approved"');
    $devStmt->execute([$clientId]);
    $devices = $devStmt->fetchAll();
    if (empty($devices)) {
        $result = _generateLicense($clientId, null, $subRow['plan_id'], $subRow['max_devices'] ?? 2, $durHrs);
        if (!$result) jsonOut(['ok' => false, 'error' => 'License generation failed'], 500);
        jsonOut(['ok' => true, 'count' => 1, 'message' => 'License generated (client-level)']);
    } else {
        $count = 0;
        foreach ($devices as $device) { if (_generateLicense($clientId, $device['id'], $subRow['plan_id'], $subRow['max_devices'] ?? 2, $durHrs)) $count++; }
        jsonOut(['ok' => true, 'count' => $count, 'message' => "Licenses generated for $count device(s)"]);
    }
}

if ($action === 'revoke') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    $db->prepare('UPDATE ims_licenses SET status="revoked" WHERE id=?')->execute([$id]);
    auditLog('LICENSE_REVOKED', "License ID $id revoked");
    jsonOut(['ok' => true]);
}

if ($action === 'view_token') {
    $id   = (int)($_GET['id'] ?? 0);
    $stmt = $db->prepare('SELECT l.token, c.business_name FROM ims_licenses l JOIN ims_clients c ON c.id=l.client_id WHERE l.id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['ok' => false, 'error' => 'Not found'], 404);
    jsonOut(['ok' => true, 'token' => $row['token'], 'clientName' => $row['business_name']]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);

// ══════════════════════════════════════════════════════════════
//  CORE LICENSE GENERATION
// ══════════════════════════════════════════════════════════════
function _generateLicense($clientId, $deviceId, $planId, $maxDevices, $durationHrs = 24) {
    $db = getDB();
    $cStmt = $db->prepare('SELECT c.*, sp.name AS plan_name FROM ims_clients c LEFT JOIN ims_subscriptions s ON s.client_id=c.id AND s.status="active" LEFT JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE c.id=? LIMIT 1');
    $cStmt->execute([$clientId]);
    $client = $cStmt->fetch();
    if (!$client) return false;

    $deviceUuid = '';
    if ($deviceId) {
        $dStmt = $db->prepare('SELECT device_uuid FROM ims_devices WHERE id=?');
        $dStmt->execute([$deviceId]);
        $dev = $dStmt->fetch();
        $deviceUuid = $dev['device_uuid'] ?? '';
    }

    $subStmt = $db->prepare('SELECT expiry_date FROM ims_subscriptions WHERE client_id=? AND status="active" ORDER BY expiry_date DESC LIMIT 1');
    $subStmt->execute([$clientId]);
    $sub = $subStmt->fetch();

    $now = time(); $expiresAt = $now + ($durationHrs * 3600); $nonce = bin2hex(random_bytes(8));

    $payloadData = [
        'clientId' => $clientId, 'barName' => $client['business_name'],
        'plan' => $client['plan_name'] ?? 'Standard', 'maxDevices' => (int)$maxDevices,
        'deviceId' => $deviceUuid, 'issuedAt' => $now, 'expiresAt' => $expiresAt,
        'subscriptionEnd' => $sub ? strtotime($sub['expiry_date']) : $expiresAt, 'nonce' => $nonce,
    ];

    if (extension_loaded('openssl') && defined('IMS_KEYS_DIR') && file_exists(IMS_KEYS_DIR . 'private.pem')) {
        $header  = rtrim(strtr(base64_encode(json_encode(['alg'=>'RS256','typ'=>'JWT'])), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode(json_encode($payloadData)), '+/', '-_'), '=');
        $data    = $header . '.' . $payload;
        $privateKey = openssl_pkey_get_private(file_get_contents(IMS_KEYS_DIR . 'private.pem'));
        if (!$privateKey) return false;
        $signature = ''; openssl_sign($data, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        $token = $data . '.' . rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    } else {
        $header  = rtrim(strtr(base64_encode(json_encode(['alg'=>'none','typ'=>'JWT'])), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode(json_encode($payloadData)), '+/', '-_'), '=');
        $token   = $header . '.' . $payload . '.unsigned';
    }

    $tokenHash = hash('sha256', $token);
    if ($deviceId) { $db->prepare('UPDATE ims_licenses SET status="expired" WHERE client_id=? AND device_id=? AND status="active"')->execute([$clientId, $deviceId]); }
    $db->prepare('INSERT INTO ims_licenses (client_id, device_id, plan_id, max_devices, token, token_hash, nonce, expires_at, status, issued_by) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([$clientId, $deviceId, $planId, $maxDevices, $token, $tokenHash, $nonce, date('Y-m-d H:i:s', $expiresAt), 'active', $_SESSION['ims_admin_name'] ?? 'system']);
    $licenseId = (int)$db->lastInsertId();
    try { auditLog('LICENSE_ISSUED', "License issued for {$client['business_name']} — expires " . date('Y-m-d H:i', $expiresAt)); } catch(Exception $e) {}
    return $licenseId;
}
