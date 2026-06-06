<?php
// ============================================================
//  IMS — config/db.php
//  Reads DB credentials from environment variables on Railway
//  Falls back to localhost defaults for local development
// ============================================================

error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);
ini_set('display_errors', 0);

// ── Railway provides these environment variables automatically
// ── when you add a MySQL plugin to your project
define('IMS_DB_HOST', getenv('MYSQLHOST')     ?: getenv('DB_HOST') ?: 'localhost');
define('IMS_DB_PORT', getenv('MYSQLPORT')     ?: getenv('DB_PORT') ?: '3306');
define('IMS_DB_USER', getenv('MYSQLUSER')     ?: getenv('DB_USER') ?: 'root');
define('IMS_DB_PASS', getenv('MYSQLPASSWORD') ?: getenv('DB_PASS') ?: '');
define('IMS_DB_NAME', getenv('MYSQLDATABASE') ?: getenv('DB_NAME') ?: 'ims');

// ── Keys directory — use /tmp on Railway (writable), local path in dev
define('IMS_KEYS_DIR', getenv('RAILWAY_ENVIRONMENT')
    ? '/tmp/ims_keys/'
    : __DIR__ . '/keys/'
);

// ── Session ──────────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400,
        'path'     => '/',
        'secure'   => isset($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

// ── CSRF token ───────────────────────────────────────────────
if (empty($_SESSION['ims_csrf'])) {
    $_SESSION['ims_csrf'] = bin2hex(random_bytes(32));
}

// ── Database connection ───────────────────────────────────────
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
            jsonOut(['ok' => false, 'error' => 'DB connection failed: ' . $e->getMessage()], 500);
        }
    }
    return $pdo;
}

// ── JSON response ─────────────────────────────────────────────
function jsonOut($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// ── Auth check ────────────────────────────────────────────────
function requireAuth() {
    if (empty($_SESSION['ims_admin_id'])) {
        jsonOut(['ok' => false, 'error' => 'Not authenticated'], 401);
    }
    return $_SESSION;
}

// ── CSRF check ────────────────────────────────────────────────
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

// ── Audit log ─────────────────────────────────────────────────
function auditLog($action, $details, $by = null) {
    try {
        $db  = getDB();
        $who = $by ?? ($_SESSION['ims_admin_name'] ?? 'system');
        $db->prepare('INSERT INTO ims_audit_log (action_type, details, done_by) VALUES (?,?,?)')
           ->execute([$action, $details, $who]);
    } catch (Exception $e) {}
}

// ── Sync subscription statuses ────────────────────────────────
function syncSubscriptionStatuses() {
    try {
        $db = getDB();
        $db->exec("
            UPDATE ims_subscriptions
            SET status = 'expired'
            WHERE expiry_date < CURDATE()
              AND status NOT IN ('suspended','expired')
        ");
        $db->exec("
            UPDATE ims_clients c
            JOIN (
                SELECT s1.client_id, s1.status
                FROM ims_subscriptions s1
                INNER JOIN (
                    SELECT client_id, MAX(expiry_date) AS max_expiry
                    FROM ims_subscriptions
                    GROUP BY client_id
                ) latest ON s1.client_id = latest.client_id
                         AND s1.expiry_date = latest.max_expiry
            ) sub_status ON sub_status.client_id = c.id
            SET c.status = sub_status.status
            WHERE c.status != 'suspended'
        ");
    } catch (Exception $e) {}
}

// ── CORS ──────────────────────────────────────────────────────
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = in_array($origin, [
              'http://localhost',
              'http://127.0.0.1',
              'http://localhost:80',
              'http://localhost:3000',
           ])
        || preg_match('/^https?:\/\/localhost(:\d+)?$/', $origin)
        || preg_match('/^https?:\/\/.*\.railway\.app$/', $origin)
        || preg_match('/^https?:\/\/[a-z0-9\-]+(\.[a-z0-9\-]+)*\.barms\.rw$/', $origin)
        || preg_match('/^https?:\/\/[a-z0-9\-]+(\.[a-z0-9\-]+)*\.barms\.co\.rw$/', $origin);

if ($origin && $allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }
