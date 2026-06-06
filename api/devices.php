<?php
require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? 'list';

if ($action === 'list') {
    $stmt = $db->query("
        SELECT d.*, c.business_name AS client_name
        FROM ims_devices d
        JOIN ims_clients c ON c.id = d.client_id
        ORDER BY d.first_seen DESC
    ");
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id']         = (int)$r['id'];
        $r['clientName'] = $r['client_name'];
        $r['deviceUuid'] = $r['device_uuid'];
        $r['deviceName'] = $r['device_name'];
        $r['deviceType'] = $r['device_type'];
        $r['firstSeen']  = $r['first_seen'];
        $r['lastSync']   = $r['last_sync'];
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'by_client') {
    $clientId = (int)($_GET['clientId'] ?? 0);
    $stmt = $db->prepare('SELECT * FROM ims_devices WHERE client_id = ? ORDER BY first_seen DESC');
    $stmt->execute([$clientId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'approve') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);

    // Check device limit
    $dev = $db->prepare('SELECT * FROM ims_devices WHERE id=?');
    $dev->execute([$id]);
    $device = $dev->fetch();

    $sub = $db->prepare('SELECT max_devices FROM ims_subscriptions WHERE client_id=? ORDER BY expiry_date DESC LIMIT 1');
    $sub->execute([$device['client_id']]);
    $subRow = $sub->fetch();

    $count = $db->prepare('SELECT COUNT(*) AS cnt FROM ims_devices WHERE client_id=? AND status="approved"');
    $count->execute([$device['client_id']]);
    $countRow = $count->fetch();

    if ($subRow && $countRow['cnt'] >= $subRow['max_devices']) {
        jsonOut(['ok' => false, 'error' => 'Device limit reached for this client. Upgrade their plan first.'], 400);
    }

    $db->prepare('UPDATE ims_devices SET status="approved" WHERE id=?')->execute([$id]);
    auditLog('DEVICE_APPROVED', "Device ID $id approved for client {$device['client_id']}");

    // Auto-generate license for this device
    $subFull = $db->prepare('SELECT * FROM ims_subscriptions WHERE client_id=? ORDER BY expiry_date DESC LIMIT 1');
    $subFull->execute([$device['client_id']]);
    $subData = $subFull->fetch();
    if ($subData) {
        require_once __DIR__ . '/licenses.php';
        _generateLicense($device['client_id'], $id, $subData['plan_id'], $subData['max_devices']);
    }

    jsonOut(['ok' => true]);
}

if ($action === 'block') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    $db->prepare('UPDATE ims_devices SET status="blocked" WHERE id=?')->execute([$id]);
    // Revoke any active licenses for this device
    $db->prepare('UPDATE ims_licenses SET status="revoked" WHERE device_id=? AND status="active"')->execute([$id]);
    auditLog('DEVICE_BLOCKED', "Device ID $id blocked");
    jsonOut(['ok' => true]);
}

// ── Register device (called by BarMS app) ─────────────────────
if ($action === 'register') {
    $body       = json_decode(file_get_contents('php://input'), true);
    $clientId   = (int)($body['clientId'] ?? 0);
    $deviceUuid = trim($body['deviceUuid'] ?? '');
    $deviceName = trim($body['deviceName'] ?? 'Unknown Device');
    $deviceType = trim($body['deviceType'] ?? 'Browser');
    $os         = trim($body['os'] ?? '');
    $browser    = trim($body['browser'] ?? '');
    $ip         = $_SERVER['REMOTE_ADDR'] ?? '';

    if (!$clientId || !$deviceUuid) jsonOut(['ok' => false, 'error' => 'clientId and deviceUuid required'], 400);

    // Check if already registered
    $existing = $db->prepare('SELECT * FROM ims_devices WHERE device_uuid=? AND client_id=?');
    $existing->execute([$deviceUuid, $clientId]);
    $dev = $existing->fetch();

    if ($dev) {
        if ($dev['status'] === 'blocked') jsonOut(['ok' => false, 'error' => 'device_blocked', 'message' => 'This device has been blocked. Contact IMS.'], 403);
        jsonOut(['ok' => true, 'status' => $dev['status'], 'deviceId' => $dev['id']]);
    }

    // Check device limit before registering
    $sub = $db->prepare('SELECT max_devices FROM ims_subscriptions WHERE client_id=? AND status="active" ORDER BY expiry_date DESC LIMIT 1');
    $sub->execute([$clientId]);
    $subRow = $sub->fetch();
    $count  = $db->prepare('SELECT COUNT(*) AS cnt FROM ims_devices WHERE client_id=? AND status="approved"');
    $count->execute([$clientId]);
    $cnt = $count->fetch();

    if ($subRow && $cnt['cnt'] >= $subRow['max_devices']) {
        jsonOut(['ok' => false, 'error' => 'device_limit', 'message' => 'Maximum devices reached for this subscription.'], 403);
    }

    $db->prepare('INSERT INTO ims_devices (client_id, device_uuid, device_name, device_type, os, browser, last_ip) VALUES (?,?,?,?,?,?,?)')
       ->execute([$clientId, $deviceUuid, $deviceName, $deviceType, $os, $browser, $ip]);
    $newId = (int)$db->lastInsertId();

    jsonOut(['ok' => true, 'status' => 'pending', 'deviceId' => $newId, 'message' => 'Device registered. Waiting for IMS approval.']);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
