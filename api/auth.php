<?php
require_once __DIR__ . '/../config/db.php';
$action = $_REQUEST['action'] ?? '';

// ── LOGIN ─────────────────────────────────────────────────────
if ($action === 'login') {
    $body = json_decode(file_get_contents('php://input'), true);
    $username = strtolower(trim($body['username'] ?? ''));
    $password = $body['password'] ?? '';
    if (!$username || !$password) jsonOut(['ok' => false, 'error' => 'Fill all fields'], 400);

    $db = getDB();
    syncSubscriptionStatuses();

    $stmt = $db->prepare('SELECT * FROM ims_admins WHERE username = ? AND active = 1 LIMIT 1');
    $stmt->execute([$username]);
    $admin = $stmt->fetch();

    if ($admin && $admin['login_attempts'] >= 5) {
        jsonOut(['ok' => false, 'error' => 'Account locked. Contact another admin.'], 429);
    }

    $valid = false;
    if ($admin) {
        if (strlen($admin['password']) === 32 && $admin['password'] === md5($password)) {
            $valid = true;
            $db->prepare('UPDATE ims_admins SET password = ? WHERE id = ?')
               ->execute([password_hash($password, PASSWORD_BCRYPT), $admin['id']]);
        } elseif (password_verify($password, $admin['password'])) {
            $valid = true;
        }
    }

    if (!$valid) {
        if ($admin) $db->prepare('UPDATE ims_admins SET login_attempts = login_attempts + 1 WHERE id = ?')->execute([$admin['id']]);
        jsonOut(['ok' => false, 'error' => 'Invalid credentials'], 401);
    }

    $db->prepare('UPDATE ims_admins SET login_attempts = 0, last_login = NOW() WHERE id = ?')->execute([$admin['id']]);

    $_SESSION['ims_admin_id']   = $admin['id'];
    $_SESSION['ims_admin_name'] = $admin['full_name'];
    $_SESSION['ims_username']   = $admin['username'];

    auditLog('LOGIN', $admin['full_name'] . ' logged in', $admin['full_name']);

    jsonOut(['ok' => true, 'admin' => [
        'id'       => $admin['id'],
        'username' => $admin['username'],
        'fullName' => $admin['full_name'],
    ]]);
}

// ── LOGOUT ────────────────────────────────────────────────────
if ($action === 'logout') {
    auditLog('LOGOUT', ($_SESSION['ims_admin_name'] ?? '') . ' logged out');
    session_destroy();
    jsonOut(['ok' => true]);
}

// ── SESSION CHECK ─────────────────────────────────────────────
if ($action === 'me') {
    if (empty($_SESSION['ims_admin_id'])) jsonOut(['ok' => false, 'error' => 'Not logged in'], 401);
    jsonOut(['ok' => true, 'admin' => [
        'id'       => $_SESSION['ims_admin_id'],
        'username' => $_SESSION['ims_username'],
        'fullName' => $_SESSION['ims_admin_name'],
    ]]);
}

// ── CHANGE PASSWORD ───────────────────────────────────────────
if ($action === 'change_password') {
    requireCsrf();
    $sess = requireAuth();
    $body = json_decode(file_get_contents('php://input'), true);
    $current = $body['current'] ?? '';
    $new     = $body['new'] ?? '';
    if (!$current || !$new) jsonOut(['ok' => false, 'error' => 'Fill all fields'], 400);
    if (strlen($new) < 6) jsonOut(['ok' => false, 'error' => 'Password must be at least 6 characters'], 400);

    $db   = getDB();
    $stmt = $db->prepare('SELECT password FROM ims_admins WHERE id = ?');
    $stmt->execute([$sess['ims_admin_id']]);
    $row  = $stmt->fetch();

    $valid = false;
    if (strlen($row['password']) === 32 && $row['password'] === md5($current)) $valid = true;
    elseif (password_verify($current, $row['password'])) $valid = true;

    if (!$valid) jsonOut(['ok' => false, 'error' => 'Current password is wrong'], 401);

    $db->prepare('UPDATE ims_admins SET password = ? WHERE id = ?')
       ->execute([password_hash($new, PASSWORD_BCRYPT), $sess['ims_admin_id']]);

    auditLog('PASSWORD_CHANGE', 'Password changed');
    jsonOut(['ok' => true]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
