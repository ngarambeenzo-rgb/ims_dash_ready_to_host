<?php
require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? 'list';

if ($action === 'list') {
    $stmt = $db->query("
        SELECT c.*, p.name AS product_name,
               sp.name AS plan_name,
               s.max_devices, s.expiry_date, s.start_date,
               (SELECT COUNT(*) FROM ims_devices d WHERE d.client_id = c.id AND d.status = 'approved') AS active_devices,
               (SELECT MAX(sl.synced_at) FROM ims_sync_log sl WHERE sl.client_id = c.id) AS last_sync
        FROM ims_clients c
        LEFT JOIN ims_products p ON p.id = c.product_id
        LEFT JOIN ims_subscriptions s ON s.client_id = c.id AND s.id = (
            SELECT id FROM ims_subscriptions WHERE client_id = c.id ORDER BY expiry_date DESC LIMIT 1
        )
        LEFT JOIN ims_subscription_plans sp ON sp.id = s.plan_id
        ORDER BY c.business_name ASC
    ");
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id']            = (int)$r['id'];
        $r['businessName']  = $r['business_name'];
        $r['contactPhone']  = $r['contact_phone'];
        $r['contactEmail']  = $r['contact_email'];
        $r['productName']   = $r['product_name'];
        $r['planName']      = $r['plan_name'];
        $r['maxDevices']    = (int)($r['max_devices'] ?? 0);
        $r['activeDevices'] = (int)($r['active_devices'] ?? 0);
        $r['expiryDate']    = $r['expiry_date'];
        $r['startDate']     = $r['start_date'];
        $r['lastSync']      = $r['last_sync'];
        $r['activationKey'] = $r['activation_key'] ?? '';
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'add') {
    $body      = json_decode(file_get_contents('php://input'), true);
    $name      = trim($body['businessName'] ?? '');
    $productId = (int)($body['productId'] ?? 1);
    $planId    = (int)($body['planId'] ?? 1);
    $maxDev    = (int)($body['maxDevices'] ?? 1);
    $startDate = $body['startDate'] ?? date('Y-m-d');

    if (!$name) jsonOut(['ok' => false, 'error' => 'Business name required'], 400);

    $plan = $db->prepare('SELECT * FROM ims_subscription_plans WHERE id = ?');
    $plan->execute([$planId]);
    $planRow = $plan->fetch();
    if (!$planRow) jsonOut(['ok' => false, 'error' => 'Plan not found'], 404);

    $expiryDate = date('Y-m-d', strtotime($startDate . ' +' . $planRow['duration_days'] . ' days'));
    // FIX: use single quotes for string values in SQL, not escaped double quotes
    $status = $planRow['price_rwf'] == 0 ? 'trial' : 'active';

    $db->beginTransaction();
    try {
        $activationKey = 'BARMS-'
            . strtoupper(substr(md5(uniqid($name, true)), 0, 4)) . '-'
            . strtoupper(substr(md5(uniqid(rand(), true)), 0, 4)) . '-'
            . strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));

        $db->prepare('INSERT INTO ims_clients (business_name, location, contact_phone, contact_email, product_id, status, activation_key) VALUES (?,?,?,?,?,?,?)')
           ->execute([$name, $body['location'] ?? '', $body['contactPhone'] ?? '', $body['contactEmail'] ?? '', $productId, $status, $activationKey]);
        $clientId = (int)$db->lastInsertId();

        $db->prepare('INSERT INTO ims_subscriptions (client_id, plan_id, max_devices, start_date, expiry_date, status) VALUES (?,?,?,?,?,?)')
           ->execute([$clientId, $planId, $maxDev, $startDate, $expiryDate, $status]);

        $db->commit();
        auditLog('CLIENT_ADD', "Added client: $name");
        jsonOut(['ok' => true, 'id' => $clientId]);
    } catch (Exception $e) {
        $db->rollBack();
        jsonOut(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

if ($action === 'edit') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    if (!$id) jsonOut(['ok' => false, 'error' => 'Invalid id'], 400);

    $db->prepare('UPDATE ims_clients SET business_name=?, location=?, contact_phone=?, contact_email=? WHERE id=?')
       ->execute([$body['businessName'] ?? '', $body['location'] ?? '', $body['contactPhone'] ?? '', $body['contactEmail'] ?? '', $id]);

    if (!empty($body['maxDevices'])) {
        // FIX: MySQL does not support ORDER BY + LIMIT in UPDATE with subquery —
        // get the subscription id first, then update by id
        $subStmt = $db->prepare('SELECT id FROM ims_subscriptions WHERE client_id=? ORDER BY expiry_date DESC LIMIT 1');
        $subStmt->execute([$id]);
        $sub = $subStmt->fetch();
        if ($sub) {
            $db->prepare('UPDATE ims_subscriptions SET max_devices=? WHERE id=?')
               ->execute([(int)$body['maxDevices'], $sub['id']]);
        }
    }

    auditLog('CLIENT_EDIT', "Edited client ID: $id");
    jsonOut(['ok' => true]);
}

if ($action === 'suspend') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    if (!$id) jsonOut(['ok' => false, 'error' => 'Client ID required'], 400);

    // FIX: was using escaped double quotes \"suspended\" inside single-quoted PHP strings
    // MySQL was interpreting them as column names, not string values — silent fail.
    // Always use single quotes for SQL string literals inside PHP strings.
    $db->prepare("UPDATE ims_clients SET status = 'suspended' WHERE id = ?")->execute([$id]);
    $db->prepare("UPDATE ims_subscriptions SET status = 'suspended' WHERE client_id = ?")->execute([$id]);
    $db->prepare("UPDATE ims_licenses SET status = 'revoked' WHERE client_id = ? AND status = 'active'")->execute([$id]);

    // Get client name for audit
    $cStmt = $db->prepare('SELECT business_name FROM ims_clients WHERE id = ?');
    $cStmt->execute([$id]);
    $client = $cStmt->fetch();

    auditLog('CLIENT_SUSPENDED', "Suspended client: " . ($client['business_name'] ?? "ID $id") . " — all licenses revoked");
    jsonOut(['ok' => true, 'message' => 'Client suspended and all licenses revoked']);
}

if ($action === 'activate') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    if (!$id) jsonOut(['ok' => false, 'error' => 'Client ID required'], 400);

    // FIX: same double-quote issue as suspend
    $db->prepare("UPDATE ims_clients SET status = 'active' WHERE id = ?")->execute([$id]);
    $db->prepare("UPDATE ims_subscriptions SET status = 'active' WHERE client_id = ? AND expiry_date >= CURDATE()")->execute([$id]);

    $cStmt = $db->prepare('SELECT business_name FROM ims_clients WHERE id = ?');
    $cStmt->execute([$id]);
    $client = $cStmt->fetch();

    auditLog('CLIENT_ACTIVATED', "Activated client: " . ($client['business_name'] ?? "ID $id"));
    jsonOut(['ok' => true, 'message' => 'Client activated']);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
