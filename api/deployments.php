<?php
/* IMS — deployments.php (admin)
   A deployment is one place one of our products runs for a client:
   a website we built, a hosted app, an API ...
     GET  ?action=list
     POST ?action=add          {clientId, productId, name, url, version}
     POST ?action=update       {id, name, url, version}
     POST ?action=set_status   {id, status: live|paused, message}
     POST ?action=delete       {id}
     POST ?action=check        {id}     fetch the address now: status code + speed
   The client's website loads api/guard.php?t=TOKEN to report in and to obey a pause. */

require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? 'list';
$body = json_decode(file_get_contents('php://input'), true) ?: [];

function dep_check($db, $id) {
    $st = $db->prepare('SELECT url FROM ims_deployments WHERE id = ?'); $st->execute([$id]);
    $url = $st->fetchColumn();
    if (!$url || !preg_match('#^https?://#i', $url)) return ['http' => 0, 'ms' => 0];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_NOBODY => false, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4,
        CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_USERAGENT => 'IMS-Uptime-Check/1.0', CURLOPT_SSL_VERIFYPEER => true]);
    $t0 = microtime(true);
    curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $ms = (int)round((microtime(true) - $t0) * 1000);
    curl_close($ch);
    $db->prepare('UPDATE ims_deployments SET last_check = NOW(), last_http = ?, last_ms = ? WHERE id = ?')->execute([$http, $ms, $id]);
    return ['http' => $http, 'ms' => $ms];
}

if ($action === 'list') {
    $rows = $db->query("SELECT dp.*, c.business_name AS client_name, c.location AS client_location, c.lat, c.lng, p.name AS product_name, p.kind
                        FROM ims_deployments dp JOIN ims_clients c ON c.id = dp.client_id JOIN ims_products p ON p.id = dp.product_id
                        ORDER BY dp.name")->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['client_id'] = (int)$r['client_id']; $r['product_id'] = (int)$r['product_id']; }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'add') {
    $name = trim($body['name'] ?? '');
    $url  = trim($body['url'] ?? '');
    if ($name === '' || !(int)($body['clientId'] ?? 0) || !(int)($body['productId'] ?? 0)) jsonOut(['ok' => false, 'error' => 'Name, client and product are required'], 400);
    if ($url !== '' && !preg_match('#^https?://#i', $url)) jsonOut(['ok' => false, 'error' => 'The address must start with http:// or https://'], 400);
    $token = bin2hex(random_bytes(16));
    $db->prepare('INSERT INTO ims_deployments (client_id, product_id, name, url, token, version) VALUES (?,?,?,?,?,?)')
       ->execute([(int)$body['clientId'], (int)$body['productId'], $name, $url ?: null, $token, trim($body['version'] ?? '') ?: null]);
    $id = (int)$db->lastInsertId();
    auditLog('DEPLOYMENT_ADD', "Registered $name");
    if ($url) dep_check($db, $id);
    jsonOut(['ok' => true, 'id' => $id, 'token' => $token]);
}

if ($action === 'update') {
    $id = (int)($body['id'] ?? 0);
    $url = trim($body['url'] ?? '');
    if ($url !== '' && !preg_match('#^https?://#i', $url)) jsonOut(['ok' => false, 'error' => 'The address must start with http:// or https://'], 400);
    $db->prepare('UPDATE ims_deployments SET name = ?, url = ?, version = ? WHERE id = ?')->execute([trim($body['name'] ?? ''), $url ?: null, trim($body['version'] ?? '') ?: null, $id]);
    auditLog('DEPLOYMENT_EDIT', "Edited deployment ID $id");
    jsonOut(['ok' => true]);
}

if ($action === 'set_status') {
    $id = (int)($body['id'] ?? 0);
    $status = ($body['status'] ?? '') === 'paused' ? 'paused' : 'live';
    $msg = mb_substr(trim($body['message'] ?? ''), 0, 250);
    $db->prepare('UPDATE ims_deployments SET status = ?, pause_message = ? WHERE id = ?')->execute([$status, $status === 'paused' ? $msg : null, $id]);
    auditLog($status === 'paused' ? 'DEPLOYMENT_PAUSED' : 'DEPLOYMENT_RESUMED', ucfirst($status) . " deployment ID $id");
    jsonOut(['ok' => true]);
}

if ($action === 'delete') {
    $id = (int)($body['id'] ?? 0);
    $db->prepare('DELETE FROM ims_deployments WHERE id = ?')->execute([$id]);
    auditLog('DEPLOYMENT_DELETE', "Removed deployment ID $id");
    jsonOut(['ok' => true]);
}

if ($action === 'check') {
    $id = (int)($body['id'] ?? 0);
    jsonOut(['ok' => true] + dep_check($db, $id));
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 404);
