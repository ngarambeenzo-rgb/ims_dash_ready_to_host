<?php
require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? '';

if ($action === 'admins') {
    $stmt = $db->query('SELECT id, full_name, username, active, last_login, created_at FROM ims_admins ORDER BY id ASC');
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['active'] = (bool)$r['active'];
        $r['fullName'] = $r['full_name'];
        $r['lastLogin'] = $r['last_login'];
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'add_admin') {
    $body = json_decode(file_get_contents('php://input'), true);
    $name = trim($body['fullName'] ?? '');
    $user = strtolower(trim($body['username'] ?? ''));
    $pwd  = $body['password'] ?? '';
    if (!$name || !$user || !$pwd) jsonOut(['ok' => false, 'error' => 'Fill all fields'], 400);
    if (strlen($pwd) < 6) jsonOut(['ok' => false, 'error' => 'Password min 6 characters'], 400);
    $check = $db->prepare('SELECT id FROM ims_admins WHERE username=?');
    $check->execute([$user]);
    if ($check->fetch()) jsonOut(['ok' => false, 'error' => 'Username already exists'], 400);
    $db->prepare('INSERT INTO ims_admins (full_name, username, password) VALUES (?,?,?)')
       ->execute([$name, $user, password_hash($pwd, PASSWORD_BCRYPT)]);
    auditLog('ADMIN_ADD', "Added admin: $name ($user)");
    jsonOut(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

if ($action === 'key_status') {
    $keysDir = IMS_KEYS_DIR;
    $hasKeys = file_exists($keysDir . 'private.pem') && file_exists($keysDir . 'public.pem');
    $stmt = $db->prepare('SELECT value FROM ims_settings WHERE `key`="keys_generated_at"');
    $stmt->execute();
    $row = $stmt->fetch();
    $opensslAvailable = extension_loaded('openssl');
    jsonOut(['ok' => true, 'hasKeys' => $hasKeys, 'generatedAt' => $row['value'] ?? null, 'opensslAvailable' => $opensslAvailable]);
}

if ($action === 'generate_keys') {
    // Check OpenSSL
    if (!extension_loaded('openssl')) {
        // Try to enable it
        jsonOut(['ok' => false, 'error' => 'OpenSSL extension not enabled. In XAMPP: open php.ini, find ;extension=openssl, remove the semicolon, save and restart Apache.'], 500);
    }

    $keysDir = IMS_KEYS_DIR;
    if (!is_dir($keysDir)) mkdir($keysDir, 0700, true);

    $config = [
        'digest_alg'       => 'sha256',
        'private_key_bits' => 2048,
        'private_key_type' => OPENSSL_KEYTYPE_RSA,
    ];
    $res = openssl_pkey_new($config);
    if (!$res) {
        $err = '';
        while ($msg = openssl_error_string()) $err .= $msg . ' ';
        jsonOut(['ok' => false, 'error' => 'Key generation failed: ' . $err], 500);
    }

    openssl_pkey_export($res, $privateKey);
    $pubKeyDetails = openssl_pkey_get_details($res);
    $publicKey = $pubKeyDetails['key'];

    file_put_contents($keysDir . 'private.pem', $privateKey);
    file_put_contents($keysDir . 'public.pem', $publicKey);
    chmod($keysDir . 'private.pem', 0600);

    $now = date('Y-m-d H:i:s');
    $db->prepare('INSERT INTO ims_settings (`key`, `value`) VALUES ("keys_generated_at",?) ON DUPLICATE KEY UPDATE `value`=?')
       ->execute([$now, $now]);

    auditLog('KEYS_GENERATED', 'RSA key pair generated');
    jsonOut(['ok' => true, 'generatedAt' => $now]);
}

if ($action === 'public_key') {
    $keyFile = IMS_KEYS_DIR . 'public.pem';
    if (!file_exists($keyFile)) jsonOut(['ok' => false, 'error' => 'No keys generated yet'], 404);
    jsonOut(['ok' => true, 'publicKey' => file_get_contents($keyFile)]);
}

if ($action === 'save_system') {
    $body = json_decode(file_get_contents('php://input'), true);
    $settings = [
        'company_name'     => $body['companyName'] ?? 'IMS Company',
        'system_name'      => $body['systemName'] ?? 'IMS',
        'license_duration' => $body['licenseDuration'] ?? 24,
        'grace_period'     => $body['gracePeriod'] ?? 17,
        'maps_key'         => $body['mapsKey'] ?? '',
    ];
    foreach ($settings as $key => $value) {
        $db->prepare('INSERT INTO ims_settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=?')
           ->execute([$key, $value, $value]);
    }
    auditLog('SETTINGS_SAVE', 'System settings updated');
    jsonOut(['ok' => true]);
}

if ($action === 'edit_admin') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    $db->prepare('UPDATE ims_admins SET full_name=? WHERE id=?')
       ->execute([$body['fullName'] ?? '', $id]);
    auditLog('ADMIN_EDIT', "Edited admin ID: $id");
    jsonOut(['ok' => true]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
