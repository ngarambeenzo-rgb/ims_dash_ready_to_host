<?php
require_once __DIR__ . '/../config/db.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') requireCsrf();
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? 'list';

if ($action === 'list') {
    $stmt = $db->query("SELECT p.*, COUNT(DISTINCT c.id) AS total_clients, SUM(CASE WHEN c.status='active' THEN 1 ELSE 0 END) AS active_clients FROM ims_products p LEFT JOIN ims_clients c ON c.product_id=p.id GROUP BY p.id ORDER BY p.name ASC");
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['active'] = (bool)$r['active'];
        $r['totalClients'] = (int)$r['total_clients'];
        $r['activeClients'] = (int)$r['active_clients'];
        $r['currentVersion'] = $r['current_version'];
        $r['updatedAt'] = $r['updated_at'];
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

if ($action === 'add') {
    $body = json_decode(file_get_contents('php://input'), true);
    $name = trim($body['name'] ?? '');
    if (!$name) jsonOut(['ok' => false, 'error' => 'Name required'], 400);
    $kind = in_array($body['kind'] ?? 'app', ['app','website','api','other'], true) ? $body['kind'] : 'app';
    $db->prepare('INSERT INTO ims_products (name, icon, description, current_version, kind) VALUES (?,?,?,?,?)')
       ->execute([$name, $body['icon'] ?? '📦', $body['description'] ?? '', $body['currentVersion'] ?? '1.0.0', $kind]);
    auditLog('PRODUCT_ADD', "Added product: $name");
    jsonOut(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

if ($action === 'edit') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = (int)($body['id'] ?? 0);
    $kind = in_array($body['kind'] ?? 'app', ['app','website','api','other'], true) ? $body['kind'] : 'app';
    $db->prepare('UPDATE ims_products SET name=?, icon=?, description=?, current_version=?, kind=? WHERE id=?')
       ->execute([$body['name'] ?? '', $body['icon'] ?? '📦', $body['description'] ?? '', $body['currentVersion'] ?? '1.0.0', $kind, $id]);
    auditLog('PRODUCT_EDIT', "Edited product ID: $id");
    jsonOut(['ok' => true]);
}

// Push update - records new version + handles optional file upload
if ($action === 'push_update') {
    // Handle both JSON and multipart form data
    $productId = (int)($_POST['productId'] ?? (json_decode(file_get_contents('php://input'), true)['productId'] ?? 0));
    $version   = trim($_POST['version'] ?? (json_decode(file_get_contents('php://input'), true)['version'] ?? ''));
    $notes     = trim($_POST['notes'] ?? (json_decode(file_get_contents('php://input'), true)['notes'] ?? ''));

    if (!$productId || !$version) jsonOut(['ok' => false, 'error' => 'Product and version required'], 400);

    // Handle file upload if provided
    $fileUploaded = false;
    if (!empty($_FILES['updateFile']['tmp_name'])) {
        $uploadDir = __DIR__ . '/../updates/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filename = 'product_' . $productId . '_v' . preg_replace('/[^a-zA-Z0-9\._-]/', '', $version) . '_' . date('Ymd') . '.zip';
        if (move_uploaded_file($_FILES['updateFile']['tmp_name'], $uploadDir . $filename)) {
            $fileUploaded = true;
            $notes .= " | File: $filename";
        }
    }

    $db->prepare('UPDATE ims_products SET current_version=? WHERE id=?')->execute([$version, $productId]);
    auditLog('PRODUCT_UPDATE', "Pushed update v$version for product ID $productId" . ($fileUploaded ? ' (with file)' : ' (version bump only)') . ". Notes: $notes");

    jsonOut(['ok' => true, 'fileUploaded' => $fileUploaded,
        'message' => $fileUploaded
            ? "Update v$version pushed with file. Clients will be notified on next sync."
            : "Version bumped to v$version. Clients will be notified on next sync. Note: No file uploaded — deploy files manually to client servers."
    ]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
