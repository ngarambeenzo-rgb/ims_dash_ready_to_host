<?php
// ============================================================
//  IMS — api/updates.php
//  Handles product update distribution to all BarMS clients
// ============================================================
require_once __DIR__ . '/../config/db.php';
$db     = getDB();
$action = $_REQUEST['action'] ?? '';

define('UPDATES_DIR', __DIR__ . '/../updates/');

// ── CHECK FOR UPDATE (called by BarMS — no auth needed) ──────
if ($action === 'check') {
    $productId      = (int)($_REQUEST['productId'] ?? 1);
    $currentVersion = trim($_REQUEST['currentVersion'] ?? '1.0.0');
    $clientId       = (int)($_REQUEST['clientId'] ?? 0);

    $stmt = $db->prepare('SELECT * FROM ims_products WHERE id = ? AND active = 1 LIMIT 1');
    $stmt->execute([$productId]);
    $product = $stmt->fetch();

    if (!$product) jsonOut(['ok' => false, 'error' => 'Product not found'], 404);

    $latestVersion = $product['current_version'] ?? '1.0.0';
    $hasUpdate     = version_compare($latestVersion, $currentVersion, '>');

    $updateFile  = null;
    $updateNotes = null;
    $updateSize  = null;

    if ($hasUpdate) {
        $zipPath = UPDATES_DIR . 'barms_v' . $latestVersion . '.zip';
        if (file_exists($zipPath)) {
            $updateFile = 'api/updates.php?action=download&version=' . urlencode($latestVersion) . '&productId=' . $productId;
            $updateSize = round(filesize($zipPath) / 1024, 1) . ' KB';
        }
        $notesPath = UPDATES_DIR . 'barms_v' . $latestVersion . '_notes.txt';
        if (file_exists($notesPath)) {
            $updateNotes = file_get_contents($notesPath);
        }
        // Log update check
        if ($clientId) {
            try {
                $db->prepare('INSERT INTO ims_sync_log (client_id, license_status, ip_address) VALUES (?, ?, ?)')
                   ->execute([$clientId, 'update_check', $_SERVER['REMOTE_ADDR'] ?? '']);
            } catch(Exception $e) {}
        }
    }

    jsonOut([
        'ok'             => true,
        'hasUpdate'      => $hasUpdate,
        'currentVersion' => $currentVersion,
        'latestVersion'  => $latestVersion,
        'updateFile'     => $updateFile,
        'updateNotes'    => $updateNotes,
        'updateSize'     => $updateSize,
        'productName'    => $product['name'],
    ]);
}

// ── DOWNLOAD UPDATE FILE (called by barms_updater.php) ────────
if ($action === 'download') {
    $version   = preg_replace('/[^a-zA-Z0-9\._-]/', '', $_GET['version'] ?? '');
    $productId = (int)($_GET['productId'] ?? 1);

    if (!$version) jsonOut(['ok' => false, 'error' => 'Version required'], 400);

    $zipPath = UPDATES_DIR . 'barms_v' . $version . '.zip';
    if (!file_exists($zipPath)) jsonOut(['ok' => false, 'error' => 'Update file not found'], 404);

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="barms_v' . $version . '.zip"');
    header('Content-Length: ' . filesize($zipPath));
    header('Cache-Control: no-cache');
    readfile($zipPath);
    exit;
}

// ── UPLOAD UPDATE (IMS admin) ─────────────────────────────────
if ($action === 'upload') {
    requireCsrf();
    requireAuth();

    $productId = (int)($_POST['productId'] ?? 1);
    $version   = preg_replace('/[^a-zA-Z0-9\._-]/', '', $_POST['version'] ?? '');
    $notes     = trim($_POST['notes'] ?? '');

    if (!$version) jsonOut(['ok' => false, 'error' => 'Version number required'], 400);

    if (!is_dir(UPDATES_DIR)) mkdir(UPDATES_DIR, 0755, true);

    $fileUploaded = false;

    if (!empty($_FILES['updateFile']['tmp_name'])) {
        $ext = strtolower(pathinfo($_FILES['updateFile']['name'], PATHINFO_EXTENSION));
        if ($ext !== 'zip') jsonOut(['ok' => false, 'error' => 'Only ZIP files are allowed'], 400);

        $maxSize = 50 * 1024 * 1024; // 50MB max
        if ($_FILES['updateFile']['size'] > $maxSize) jsonOut(['ok' => false, 'error' => 'File too large (max 50MB)'], 400);

        $dest = UPDATES_DIR . 'barms_v' . $version . '.zip';
        if (move_uploaded_file($_FILES['updateFile']['tmp_name'], $dest)) {
            $fileUploaded = true;
        } else {
            jsonOut(['ok' => false, 'error' => 'Failed to save uploaded file. Check server permissions.'], 500);
        }
    }

    if ($notes) {
        file_put_contents(UPDATES_DIR . 'barms_v' . $version . '_notes.txt', $notes);
    }

    // Update product version in DB
    $db->prepare('UPDATE ims_products SET current_version = ?, updated_at = NOW() WHERE id = ?')
       ->execute([$version, $productId]);

    auditLog('PRODUCT_UPDATE', "Version $version pushed" . ($fileUploaded ? ' with ZIP file' : ' — version bump only') . ($notes ? ". Notes: $notes" : ''), $_SESSION['username'] ?? 'admin');

    jsonOut([
        'ok'           => true,
        'version'      => $version,
        'fileUploaded' => $fileUploaded,
        'message'      => $fileUploaded
            ? "✅ Version $version uploaded successfully. All BarMS installations will update on next sync (within 30 minutes)."
            : "Version bumped to $version. No file uploaded — clients will see update notification but auto-install needs the ZIP file.",
    ]);
}

// ── LIST AVAILABLE UPDATES (IMS admin) ───────────────────────
if ($action === 'list') {
    requireAuth();
    $updates = [];

    if (is_dir(UPDATES_DIR)) {
        foreach (glob(UPDATES_DIR . '*.zip') as $file) {
            $filename = basename($file);
            if (preg_match('/^barms_v([0-9a-zA-Z\._-]+)\.zip$/', $filename, $m)) {
                $version    = $m[1];
                $notesPath  = UPDATES_DIR . 'barms_v' . $version . '_notes.txt';
                $updates[] = [
                    'version'  => $version,
                    'filename' => $filename,
                    'size'     => round(filesize($file) / 1024, 1) . ' KB',
                    'uploaded' => date('Y-m-d H:i', filemtime($file)),
                    'notes'    => file_exists($notesPath) ? file_get_contents($notesPath) : '',
                ];
            }
        }
        usort($updates, fn($a, $b) => version_compare($b['version'], $a['version']));
    }

    jsonOut(['ok' => true, 'data' => $updates]);
}

// ── DELETE OLD UPDATE (IMS admin) ─────────────────────────────
if ($action === 'delete') {
    requireCsrf();
    requireAuth();

    $version = preg_replace('/[^a-zA-Z0-9\._-]/', '', $_POST['version'] ?? '');
    if (!$version) jsonOut(['ok' => false, 'error' => 'Version required'], 400);

    $zip   = UPDATES_DIR . 'barms_v' . $version . '.zip';
    $notes = UPDATES_DIR . 'barms_v' . $version . '_notes.txt';

    if (file_exists($zip))   unlink($zip);
    if (file_exists($notes)) unlink($notes);

    auditLog('UPDATE_DELETED', "Update v$version deleted", $_SESSION['username'] ?? 'admin');
    jsonOut(['ok' => true, 'message' => "Version $version deleted"]);
}

// ── REPORT INSTALL (called by barms_updater.php after install) ─
if ($action === 'report_install') {
    $clientId = (int)($_GET['clientId'] ?? 0);
    $version  = preg_replace('/[^a-zA-Z0-9\._-]/', '', $_GET['version'] ?? '');

    if ($clientId && $version) {
        try {
            $db->prepare('INSERT INTO ims_sync_log (client_id, license_status, ip_address) VALUES (?, ?, ?)')
               ->execute([$clientId, 'updated_to_v' . $version, $_SERVER['REMOTE_ADDR'] ?? '']);
            auditLog('CLIENT_UPDATED', "Client ID $clientId successfully updated to v$version", 'system');
        } catch(Exception $e) {}
    }
    jsonOut(['ok' => true]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
