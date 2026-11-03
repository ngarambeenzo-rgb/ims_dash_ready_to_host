<?php
/* IMS — track.php
   Product control + locations.

   PUBLIC (called by our products, no IMS login):
     POST ?action=config   {clientId, deviceUuid}            -> should this device share its location? is it marked lost?
     POST ?action=ping     {clientId, deviceUuid, lat, lng, accuracy, source, battery, appVersion}

   ADMIN (IMS login + CSRF):
     GET  ?action=overview            clients, devices, deployments with positions
     GET  ?action=geocode&q=...       address -> coordinates
     GET  ?action=reverse&lat&lng     coordinates -> address
     GET  ?action=history&deviceId    trail of a device
     POST ?action=set_client_location {id, lat, lng}
     POST ?action=set_lost            {deviceId, lost, note}

   A device only stores a location when its client has tracking_consent = 1
   (the client agreed to it) AND the device is approved. */

require_once __DIR__ . '/../config/db.php';
$db     = getDB();
$action = $_REQUEST['action'] ?? '';

function trk_km($lat1, $lng1, $lat2, $lng2) {
    $r = 6371;
    $dLat = deg2rad($lat2 - $lat1); $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}
function trk_valid($lat, $lng) {
    return is_numeric($lat) && is_numeric($lng) && abs($lat) <= 90 && abs($lng) <= 180 && !($lat == 0 && $lng == 0);
}
function trk_device($db, $body) {
    $clientId = (int)($body['clientId'] ?? 0);
    $uuid     = trim($body['deviceUuid'] ?? '');
    if (!$clientId || $uuid === '') jsonOut(['ok' => false, 'error' => 'clientId and deviceUuid required'], 400);
    $st = $db->prepare('SELECT d.*, c.tracking_consent, c.business_name, c.contact_phone FROM ims_devices d JOIN ims_clients c ON c.id = d.client_id WHERE d.client_id = ? AND d.device_uuid = ? LIMIT 1');
    $st->execute([$clientId, $uuid]);
    $d = $st->fetch();
    if (!$d) jsonOut(['ok' => false, 'error' => 'device_not_found'], 404);
    return $d;
}
function trk_state($d) {
    return [
        'tracking'    => $d['status'] === 'approved' && (int)$d['tracking_consent'] === 1,
        'intervalSec' => 300,
        'lost'        => (int)$d['lost_mode'] === 1,
        'lostNote'    => $d['lost_note'] ?: 'This device was reported lost. Please contact ' . $d['business_name'] . ' or IMS support.',
        'contact'     => $d['contact_phone'],
    ];
}

/* ───────────── PUBLIC ───────────── */
if ($action === 'config' || $action === 'ping') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $d = trk_device($db, $body);
    $state = trk_state($d);

    if ($action === 'config') jsonOut(['ok' => true] + $state);

    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ver = substr(trim($body['appVersion'] ?? ''), 0, 20);
    $bat = isset($body['battery']) && is_numeric($body['battery']) ? max(0, min(100, (int)$body['battery'])) : null;
    $db->prepare('UPDATE ims_devices SET last_sync = NOW(), last_ip = ?, app_version = COALESCE(NULLIF(?, ""), app_version), battery = COALESCE(?, battery) WHERE id = ?')
       ->execute([$ip, $ver, $bat, $d['id']]);

    if ($state['tracking'] && trk_valid($body['lat'] ?? null, $body['lng'] ?? null)) {
        $lat = round((float)$body['lat'], 7); $lng = round((float)$body['lng'], 7);
        $acc = isset($body['accuracy']) ? max(0, min(100000, (int)$body['accuracy'])) : null;
        $src = in_array($body['source'] ?? '', ['gps', 'wifi', 'ip'], true) ? $body['source'] : 'gps';
        $db->prepare('UPDATE ims_devices SET last_lat = ?, last_lng = ?, last_accuracy = ?, last_loc_at = NOW(), last_loc_source = ? WHERE id = ?')
           ->execute([$lat, $lng, $acc, $src, $d['id']]);

        // Keep a trail point when the device moved 50 m+ or 5 minutes have passed
        $last = $db->prepare('SELECT lat, lng, created_at FROM ims_device_locations WHERE device_id = ? ORDER BY id DESC LIMIT 1');
        $last->execute([$d['id']]);
        $l = $last->fetch();
        $moved = !$l || trk_km($l['lat'], $l['lng'], $lat, $lng) * 1000 >= 50 || (time() - strtotime($l['created_at'])) >= 300;
        if ($moved) {
            $db->prepare('INSERT INTO ims_device_locations (device_id, lat, lng, accuracy, source) VALUES (?,?,?,?,?)')->execute([$d['id'], $lat, $lng, $acc, $src]);
            // Trail older than 60 days is dropped so the table stays small
            if (mt_rand(1, 50) === 1) $db->exec('DELETE FROM ims_device_locations WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)');
        }
    }
    jsonOut(['ok' => true] + $state);
}

/* ───────────── ADMIN ───────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();

/* Cheap "has anything changed?" check. The map asks this every few seconds and only
   downloads the full overview when the answer (v) is different. */
if ($action === 'pulse') {
    $parts = [];
    $parts[] = $db->query("SELECT CONCAT(COUNT(*),':',IFNULL(MAX(updated_at),''),':',IFNULL(SUM(tracking_consent),0),':',IFNULL(SUM(lat IS NOT NULL),0)) FROM ims_clients")->fetchColumn();
    $parts[] = $db->query("SELECT CONCAT(COUNT(*),':',IFNULL(MAX(last_loc_at),''),':',IFNULL(MAX(last_sync),''),':',IFNULL(SUM(lost_mode),0),':',IFNULL(SUM(status='approved'),0),':',IFNULL(MAX(lost_at),'')) FROM ims_devices")->fetchColumn();
    $parts[] = $db->query("SELECT IFNULL(MAX(updated_at),'') FROM ims_subscriptions")->fetchColumn();
    try { $parts[] = $db->query("SELECT CONCAT(COUNT(*),':',IFNULL(MAX(last_seen),''),':',IFNULL(MAX(last_check),''),':',IFNULL(SUM(status='paused'),0)) FROM ims_deployments")->fetchColumn(); } catch (Throwable $e) {}
    header('Cache-Control: no-store');
    jsonOut(['ok' => true, 'v' => md5(implode('|', $parts)), 't' => time()]);
}

/* Outline of a country (for the glowing border + "focus" shading on the map).
   Fetched once from OpenStreetMap and kept for 30 days. */
if ($action === 'country') {
    $name = preg_replace('/[^A-Za-z .\'-]/', '', $_GET['name'] ?? 'Rwanda');
    $cache = sys_get_temp_dir() . '/ims_country_' . md5(strtolower($name)) . '.json';
    if (is_file($cache) && filemtime($cache) > time() - 30 * 86400) { header('Content-Type: application/json'); readfile($cache); exit; }
    $url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&polygon_geojson=1&polygon_threshold=0.004&featuretype=country&q=' . rawurlencode($name);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => 'IMS-Instance-Management/1.0']);
    $raw = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = $raw ? json_decode($raw, true) : null;
    if ($http !== 200 || empty($j[0]['geojson'])) jsonOut(['ok' => false, 'error' => 'No outline available'], 502);
    $out = json_encode(['ok' => true, 'name' => $name, 'geometry' => $j[0]['geojson']]);
    @file_put_contents($cache, $out);
    header('Content-Type: application/json'); echo $out; exit;
}

if ($action === 'overview') {
    $clients = $db->query("
        SELECT c.id, c.business_name, c.location, c.contact_phone, c.contact_email, c.status, c.lat, c.lng, c.geo_source,
               c.tracking_consent, c.away_km, p.name AS product_name, sp.name AS plan_name, s.expiry_date,
               (SELECT COUNT(*) FROM ims_devices d WHERE d.client_id = c.id AND d.status = 'approved') AS devices
        FROM ims_clients c
        LEFT JOIN ims_products p ON p.id = c.product_id
        LEFT JOIN ims_subscriptions s ON s.client_id = c.id AND s.id = (SELECT id FROM ims_subscriptions WHERE client_id = c.id ORDER BY expiry_date DESC LIMIT 1)
        LEFT JOIN ims_subscription_plans sp ON sp.id = s.plan_id
        ORDER BY c.business_name")->fetchAll();
    $byId = [];
    foreach ($clients as &$c) {
        $c['id'] = (int)$c['id']; $c['devices'] = (int)$c['devices'];
        $c['lat'] = $c['lat'] !== null ? (float)$c['lat'] : null;
        $c['lng'] = $c['lng'] !== null ? (float)$c['lng'] : null;
        $c['trackingConsent'] = (int)$c['tracking_consent'] === 1;
        $c['awayKm'] = (int)$c['away_km'];
        $byId[$c['id']] = &$c;
    }
    unset($c);

    $devs = $db->query("
        SELECT d.id, d.client_id, d.device_uuid, d.device_name, d.device_type, d.os, d.browser, d.status, d.last_sync, d.last_ip,
               d.last_lat, d.last_lng, d.last_accuracy, d.last_loc_at, d.last_loc_source, d.battery, d.app_version,
               d.lost_mode, d.lost_note, d.lost_at, d.first_seen
        FROM ims_devices d ORDER BY d.last_loc_at IS NULL, d.last_loc_at DESC")->fetchAll();
    $awayCount = 0; $liveCount = 0; $lostCount = 0;
    foreach ($devs as &$d) {
        $d['id'] = (int)$d['id']; $d['clientId'] = (int)$d['client_id'];
        $d['lat'] = $d['last_lat'] !== null ? (float)$d['last_lat'] : null;
        $d['lng'] = $d['last_lng'] !== null ? (float)$d['last_lng'] : null;
        $d['accuracy'] = $d['last_accuracy'] !== null ? (int)$d['last_accuracy'] : null;
        $d['locAt'] = $d['last_loc_at']; $d['source'] = $d['last_loc_source'];
        $d['lost'] = (int)$d['lost_mode'] === 1;
        $d['battery'] = $d['battery'] !== null ? (int)$d['battery'] : null;
        $ageMin = $d['locAt'] ? (time() - strtotime($d['locAt'])) / 60 : null;
        $d['ageMin'] = $ageMin !== null ? (int)round($ageMin) : null;
        $d['freshness'] = $d['lost'] ? 'lost' : ($ageMin === null ? 'none' : ($ageMin <= 15 ? 'live' : ($ageMin <= 1440 ? 'recent' : 'stale')));
        $d['distanceKm'] = null; $d['away'] = false;
        $c = $byId[$d['clientId']] ?? null;
        if ($c && $c['lat'] !== null && $d['lat'] !== null) {
            $d['distanceKm'] = round(trk_km($c['lat'], $c['lng'], $d['lat'], $d['lng']), 2);
            $d['away'] = $d['distanceKm'] > $c['awayKm'];
        }
        if ($d['away']) $awayCount++;
        if ($d['freshness'] === 'live') $liveCount++;
        if ($d['lost']) $lostCount++;
    }
    unset($d);

    $deps = [];
    try {
        $deps = $db->query("SELECT dp.*, c.business_name AS client_name, p.name AS product_name FROM ims_deployments dp JOIN ims_clients c ON c.id = dp.client_id JOIN ims_products p ON p.id = dp.product_id ORDER BY dp.name")->fetchAll();
    } catch (Throwable $e) {}

    jsonOut(['ok' => true, 'data' => [
        'clients' => $clients, 'devices' => $devs, 'deployments' => $deps,
        'stats' => ['clients' => count($clients), 'placed' => count(array_filter($clients, fn($c) => $c['lat'] !== null)),
                    'devices' => count($devs), 'live' => $liveCount, 'away' => $awayCount, 'lost' => $lostCount],
    ]]);
}

if ($action === 'geocode' || $action === 'reverse') {
    if ($action === 'geocode') {
        $q = trim($_GET['q'] ?? '');
        if (strlen($q) < 3) jsonOut(['ok' => true, 'data' => []]);
        $url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=' . rawurlencode($q)
             . (!empty($_GET['cc']) ? '&countrycodes=' . preg_replace('/[^a-z,]/', '', strtolower($_GET['cc'])) : '');
    } else {
        $lat = (float)($_GET['lat'] ?? 0); $lng = (float)($_GET['lng'] ?? 0);
        $url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=' . $lat . '&lon=' . $lng;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_USERAGENT => 'IMS-Instance-Management/1.0', CURLOPT_HTTPHEADER => ['Accept-Language: en']]);
    $raw = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($raw === false || $http !== 200) jsonOut(['ok' => false, 'error' => 'The address search service did not answer. Place the pin by clicking the map.'], 502);
    $j = json_decode($raw, true);
    jsonOut(['ok' => true, 'data' => $action === 'geocode' ? $j : [$j]]);
}

if ($action === 'history') {
    $id = (int)($_GET['deviceId'] ?? 0);
    $hours = max(1, min(24 * 60, (int)($_GET['hours'] ?? 72)));
    $st = $db->prepare('SELECT lat, lng, accuracy, source, created_at FROM ims_device_locations WHERE device_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY id ASC LIMIT 2000');
    $st->execute([$id, $hours]);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) { $r['lat'] = (float)$r['lat']; $r['lng'] = (float)$r['lng']; }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'set_client_location') {
    $b = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (int)($b['id'] ?? 0);
    if (!trk_valid($b['lat'] ?? null, $b['lng'] ?? null)) jsonOut(['ok' => false, 'error' => 'That position is not valid'], 400);
    $db->prepare('UPDATE ims_clients SET lat = ?, lng = ?, geo_source = ? WHERE id = ?')->execute([round((float)$b['lat'], 7), round((float)$b['lng'], 7), 'manual', $id]);
    auditLog('CLIENT_LOCATION', "Placed client ID $id on the map");
    jsonOut(['ok' => true]);
}

if ($action === 'set_lost') {
    $b = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (int)($b['deviceId'] ?? 0);
    $lost = !empty($b['lost']);
    $note = mb_substr(trim($b['note'] ?? ''), 0, 250);
    $db->prepare('UPDATE ims_devices SET lost_mode = ?, lost_note = ?, lost_at = ? WHERE id = ?')->execute([$lost ? 1 : 0, $lost ? $note : null, $lost ? date('Y-m-d H:i:s') : null, $id]);
    auditLog($lost ? 'DEVICE_LOST' : 'DEVICE_FOUND', ($lost ? 'Marked lost' : 'Marked found') . " device ID $id");
    jsonOut(['ok' => true]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 404);
