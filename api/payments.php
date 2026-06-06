<?php
require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? 'list';

if ($action === 'list') {
    $stmt = $db->query("
        SELECT p.*, c.business_name AS client_name, sp.name AS plan_name
        FROM ims_payments p
        JOIN ims_clients c ON c.id = p.client_id
        JOIN ims_subscription_plans sp ON sp.id = p.plan_id
        ORDER BY p.created_at DESC
    ");
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id']           = (int)$r['id'];
        $r['amount']       = (float)$r['amount'];
        $r['maxDevices']   = (int)$r['max_devices'];
        $r['clientName']   = $r['client_name'];
        $r['planName']     = $r['plan_name'];
        $r['periodStart']  = $r['period_start'];
        $r['periodEnd']    = $r['period_end'];
        $r['paymentMethod']= $r['payment_method'];
        $r['recordedBy']   = $r['recorded_by'];
        $r['createdAt']    = $r['created_at'];
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'record') {
    $body      = json_decode(file_get_contents('php://input'), true);
    $clientId  = (int)($body['clientId'] ?? 0);
    $planId    = (int)($body['planId'] ?? 0);
    $amount    = (float)($body['amount'] ?? 0);
    $maxDev    = (int)($body['maxDevices'] ?? 1);
    $method    = $body['paymentMethod'] ?? 'Cash';
    $notes     = $body['notes'] ?? '';

    if (!$clientId || !$planId || !$amount) jsonOut(['ok' => false, 'error' => 'Fill required fields'], 400);

    // Get plan duration
    $planStmt = $db->prepare('SELECT * FROM ims_subscription_plans WHERE id = ?');
    $planStmt->execute([$planId]);
    $plan = $planStmt->fetch();
    if (!$plan) jsonOut(['ok' => false, 'error' => 'Plan not found'], 404);

    $startDate  = date('Y-m-d');
    $expiryDate = date('Y-m-d', strtotime('+' . $plan['duration_days'] . ' days'));

    $db->beginTransaction();
    try {
        // Record payment
        $db->prepare('INSERT INTO ims_payments (client_id, plan_id, amount, max_devices, payment_method, period_start, period_end, notes, recorded_by) VALUES (?,?,?,?,?,?,?,?,?)')
           ->execute([$clientId, $planId, $amount, $maxDev, $method, $startDate, $expiryDate, $notes, $_SESSION['ims_admin_name']]);

        // Update or create subscription
        $subStmt = $db->prepare('SELECT id FROM ims_subscriptions WHERE client_id = ? ORDER BY expiry_date DESC LIMIT 1');
        $subStmt->execute([$clientId]);
        $existingSub = $subStmt->fetch();

        if ($existingSub) {
            $db->prepare('UPDATE ims_subscriptions SET plan_id=?, max_devices=?, start_date=?, expiry_date=?, status="active" WHERE id=?')
               ->execute([$planId, $maxDev, $startDate, $expiryDate, $existingSub['id']]);
        } else {
            $db->prepare('INSERT INTO ims_subscriptions (client_id, plan_id, max_devices, start_date, expiry_date, status) VALUES (?,?,?,?,?,"active")')
               ->execute([$clientId, $planId, $maxDev, $startDate, $expiryDate]);
        }

        // Update client status to active
        $db->prepare('UPDATE ims_clients SET status="active" WHERE id=?')->execute([$clientId]);

        // Get client name for audit
        $cStmt = $db->prepare('SELECT business_name FROM ims_clients WHERE id=?');
        $cStmt->execute([$clientId]);
        $client = $cStmt->fetch();

        $db->commit();
        auditLog('PAYMENT', "Payment of RWF $amount recorded for {$client['business_name']} — Plan: {$plan['name']}");

        // Auto-generate license for all approved devices
        $devStmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id = ? AND status = "approved"');
        $devStmt->execute([$clientId]);
        $devices = $devStmt->fetchAll();
        foreach ($devices as $device) {
            generateLicenseForDevice($clientId, $device['id'], $planId, $maxDev);
        }

        jsonOut(['ok' => true]);
    } catch (Exception $e) {
        $db->rollBack();
        jsonOut(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

function generateLicenseForDevice($clientId, $deviceId, $planId, $maxDevices) {
    // License generation is handled in licenses.php
    // Called here for auto-generation after payment
    require_once __DIR__ . '/licenses.php';
    return _generateLicense($clientId, $deviceId, $planId, $maxDevices);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
