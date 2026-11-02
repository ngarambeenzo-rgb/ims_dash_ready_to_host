<?php
// ============================================================
//  IMS Dashboard — Database Configuration
//  Local XAMPP below; a live server reads config/db.hosting.php
// ============================================================

error_reporting(0);
ini_set('display_errors', 0);

// CORS - send first before anything else
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(0); }

// Local XAMPP when running on localhost, config/db.hosting.php otherwise
$imsHost    = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? 'localhost')[0]);
$imsIsLocal = in_array($imsHost, ['localhost', '127.0.0.1'], true)
           || preg_match('/^(192\.168|10)\./', $imsHost);

if ($imsIsLocal) {
    define('IMS_DB_HOST', 'localhost');
    define('IMS_DB_PORT', '3306');
    define('IMS_DB_USER', 'root');
    define('IMS_DB_PASS', '');
    define('IMS_DB_NAME', 'ims_db');
} else {
    // Live server: the real settings live in config/db.hosting.php (never committed: it holds the
    // database password; template: db.hosting.example.php)
    if (!is_file(__DIR__ . '/db.hosting.php')) {
        http_response_code(500); header('Content-Type: application/json');
        exit(json_encode(['ok' => false, 'error' => 'Server not configured: create config/db.hosting.php']));
    }
    require __DIR__ . '/db.hosting.php';
}
define('IMS_KEYS_DIR', __DIR__ . '/keys/');

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400,
        'path'     => '/',
        'secure'   => !$imsIsLocal,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

if (empty($_SESSION['ims_csrf'])) {
    $_SESSION['ims_csrf'] = bin2hex(random_bytes(32));
}

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . IMS_DB_HOST
                 . ';port=' . IMS_DB_PORT
                 . ';dbname=' . IMS_DB_NAME
                 . ';charset=utf8mb4';
            $pdo = new PDO($dsn, IMS_DB_USER, IMS_DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            header('Content-Type: application/json');
            http_response_code(500);
            die(json_encode(['ok' => false, 'error' => 'DB connection failed']));
        }
    }
    return $pdo;
}

function jsonOut($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (empty($_SESSION['ims_admin_id'])) {
        jsonOut(['ok' => false, 'error' => 'Not authenticated'], 401);
    }
    return $_SESSION;
}

function requireCsrf() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
    if (empty($_SESSION['ims_csrf'])) {
        $_SESSION['ims_csrf'] = bin2hex(random_bytes(32));
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !hash_equals($_SESSION['ims_csrf'], $token)) {
        jsonOut(['ok' => false, 'error' => 'Invalid CSRF token'], 403);
    }
}

function auditLog($action, $details, $by = null) {
    try {
        $db  = getDB();
        $who = $by ?? ($_SESSION['ims_admin_name'] ?? 'system');
        $db->prepare('INSERT INTO ims_audit_log (action_type, details, done_by) VALUES (?,?,?)')
           ->execute([$action, $details, $who]);
    } catch (Exception $e) {}
}

function syncSubscriptionStatuses() {
    try {
        $db = getDB();
        $db->exec("UPDATE ims_subscriptions SET status = 'expired' WHERE expiry_date < CURDATE() AND status NOT IN ('suspended','expired')");
    } catch (Exception $e) {}
}
