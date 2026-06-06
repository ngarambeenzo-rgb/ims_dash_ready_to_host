<?php
require_once __DIR__ . '/../config/db.php';
requireAuth();
$db = getDB();
$action = $_REQUEST['action'] ?? '';

if ($action === 'dashboard') {
    syncSubscriptionStatuses();
    $now = date('Y-m-d');
    $in7 = date('Y-m-d', strtotime('+7 days'));

    $totalClients   = (int)$db->query("SELECT COUNT(*) FROM ims_clients")->fetchColumn();
    $activeClients  = (int)$db->query("SELECT COUNT(*) FROM ims_clients WHERE status='active'")->fetchColumn();
    $trialClients   = (int)$db->query("SELECT COUNT(*) FROM ims_clients WHERE status='trial'")->fetchColumn();
    $expiredClients = (int)$db->query("SELECT COUNT(*) FROM ims_clients WHERE status='expired'")->fetchColumn();
    $expiringSoon   = (int)$db->query("SELECT COUNT(*) FROM ims_subscriptions WHERE expiry_date BETWEEN '$now' AND '$in7' AND status='active'")->fetchColumn();
    $totalDevices   = (int)$db->query("SELECT COUNT(*) FROM ims_devices WHERE status='approved'")->fetchColumn();
    $pendingDevices = (int)$db->query("SELECT COUNT(*) FROM ims_devices WHERE status='pending'")->fetchColumn();
    $blockedDevices = (int)$db->query("SELECT COUNT(*) FROM ims_devices WHERE status='blocked'")->fetchColumn();
    $syncedToday    = (int)$db->query("SELECT COUNT(DISTINCT device_id) FROM ims_sync_log WHERE DATE(synced_at)='$now'")->fetchColumn();
    $monthRevenue   = (float)$db->query("SELECT COALESCE(SUM(amount),0) FROM ims_payments WHERE MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())")->fetchColumn();

    // Monthly clients breakdown
    $monthlyClients = (int)$db->query("SELECT COUNT(DISTINCT c.id) FROM ims_clients c JOIN ims_subscriptions s ON s.client_id=c.id JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE sp.duration_days <= 31 AND s.status='active'")->fetchColumn();
    $annualClients  = (int)$db->query("SELECT COUNT(DISTINCT c.id) FROM ims_clients c JOIN ims_subscriptions s ON s.client_id=c.id JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE sp.duration_days > 31 AND s.status='active'")->fetchColumn();

    // Recent payments
    $rpStmt = $db->query("SELECT p.*, c.business_name AS client_name, sp.name AS plan_name FROM ims_payments p JOIN ims_clients c ON c.id=p.client_id JOIN ims_subscription_plans sp ON sp.id=p.plan_id ORDER BY p.created_at DESC LIMIT 5");
    $recentPayments = $rpStmt->fetchAll();
    foreach ($recentPayments as &$r) {
        $r['amount'] = (float)$r['amount'];
        $r['clientName'] = $r['client_name'];
        $r['planName'] = $r['plan_name'];
        $r['paymentMethod'] = $r['payment_method'];
        $r['createdAt'] = $r['created_at'];
    }

    // Recent subscriptions
    $rsStmt = $db->query("SELECT s.*, c.business_name AS client_name, sp.name AS plan_name, sp.price_rwf AS plan_price FROM ims_subscriptions s JOIN ims_clients c ON c.id=s.client_id JOIN ims_subscription_plans sp ON sp.id=s.plan_id ORDER BY s.created_at DESC LIMIT 6");
    $recentSubs = $rsStmt->fetchAll();
    foreach ($recentSubs as &$r) {
        $r['id'] = (int)$r['id'];
        $r['clientId'] = (int)$r['client_id'];
        $r['maxDevices'] = (int)$r['max_devices'];
        $r['clientName'] = $r['client_name'];
        $r['planName'] = $r['plan_name'];
        $r['planPrice'] = (float)$r['plan_price'];
        $r['expiryDate'] = $r['expiry_date'];
    }

    // Expiring subscriptions
    $expStmt = $db->query("SELECT s.*, c.business_name AS client_name, p.name AS product_name, sp.name AS plan_name FROM ims_subscriptions s JOIN ims_clients c ON c.id=s.client_id LEFT JOIN ims_products p ON p.id=c.product_id LEFT JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE s.expiry_date BETWEEN '$now' AND '$in7' AND s.status='active' ORDER BY s.expiry_date ASC LIMIT 10");
    $expiringSubs = $expStmt->fetchAll();
    foreach ($expiringSubs as &$r) {
        $r['id'] = (int)$r['id'];
        $r['clientId'] = (int)$r['client_id'];
        $r['maxDevices'] = (int)$r['max_devices'];
        $r['clientName'] = $r['client_name'];
        $r['productName'] = $r['product_name'];
        $r['planName'] = $r['plan_name'];
        $r['expiryDate'] = $r['expiry_date'];
    }

    // Revenue by day
    $revStmt = $db->query("SELECT DATE(created_at) AS day, SUM(amount) AS amount FROM ims_payments WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY day ASC");
    $revenueByDay = $revStmt->fetchAll();
    foreach ($revenueByDay as &$r) { $r['amount'] = (float)$r['amount']; }

    // Products
    $prodStmt = $db->query("SELECT * FROM ims_products ORDER BY updated_at DESC LIMIT 4");
    $products = $prodStmt->fetchAll();
    foreach ($products as &$r) {
        $r['id'] = (int)$r['id'];
        $r['currentVersion'] = $r['current_version'];
        $r['updatedAt'] = $r['updated_at'];
    }

    // Recent activity
    $actStmt = $db->query("SELECT * FROM ims_audit_log ORDER BY created_at DESC LIMIT 5");
    $recentActivity = $actStmt->fetchAll();
    foreach ($recentActivity as &$r) {
        $r['id'] = (int)$r['id'];
        $r['actionType'] = $r['action_type'];
        $r['doneBy'] = $r['done_by'];
        $r['createdAt'] = $r['created_at'];
    }

    // Clients for map
    $mapStmt = $db->query("SELECT c.business_name, c.location, c.status, c.contact_phone FROM ims_clients c LIMIT 100");
    $clientsForMap = $mapStmt->fetchAll();
    foreach ($clientsForMap as &$r) { $r['businessName'] = $r['business_name']; }

    // Alerts
    $alerts = [];
    if ($pendingDevices > 0) $alerts[] = ['type' => 'warning', 'icon' => '📱', 'title' => "$pendingDevices device(s) awaiting approval", 'message' => 'Go to Devices to approve'];
    if ($expiringSoon > 0)   $alerts[] = ['type' => 'warning', 'icon' => '⏰', 'title' => "$expiringSoon subscription(s) expiring in 7 days", 'message' => 'Record payment to renew'];
    if ($expiredClients > 0) $alerts[] = ['type' => 'danger',  'icon' => '🔴', 'title' => "$expiredClients client(s) subscription expired", 'message' => 'Their app is locked'];

    jsonOut(['ok' => true, 'data' => [
        'totalClients'   => $totalClients,
        'activeClients'  => $activeClients,
        'trialClients'   => $trialClients,
        'expiredClients' => $expiredClients,
        'expiringSoon'   => $expiringSoon,
        'totalDevices'   => $totalDevices,
        'pendingDevices' => $pendingDevices,
        'blockedDevices' => $blockedDevices,
        'syncedToday'    => $syncedToday,
        'monthRevenue'   => $monthRevenue,
        'monthlyClients' => $monthlyClients,
        'annualClients'  => $annualClients,
        'recentPayments' => $recentPayments,
        'recentSubs'     => $recentSubs,
        'expiringSubs'   => $expiringSubs,
        'revenueByDay'   => $revenueByDay,
        'products'       => $products,
        'recentActivity' => $recentActivity,
        'clientsForMap'  => $clientsForMap,
        'alerts'         => $alerts,
    ]]);
}

if ($action === 'alerts') {
    $now = date('Y-m-d');
    $in7 = date('Y-m-d', strtotime('+7 days'));
    $alerts = [];
    $pending  = (int)$db->query("SELECT COUNT(*) FROM ims_devices WHERE status='pending'")->fetchColumn();
    $expiring = (int)$db->query("SELECT COUNT(*) FROM ims_subscriptions WHERE expiry_date BETWEEN '$now' AND '$in7' AND status='active'")->fetchColumn();
    $expired  = (int)$db->query("SELECT COUNT(*) FROM ims_clients WHERE status='expired'")->fetchColumn();
    if ($pending > 0)  $alerts[] = ['type' => 'warning', 'title' => "$pending device(s) pending approval", 'message' => 'Go to Devices to approve'];
    if ($expiring > 0) $alerts[] = ['type' => 'warning', 'title' => "$expiring subscription(s) expiring soon", 'message' => 'Renew before they expire'];
    if ($expired > 0)  $alerts[] = ['type' => 'danger',  'title' => "$expired client(s) expired", 'message' => 'Record payment to restore'];
    jsonOut(['ok' => true, 'data' => $alerts]);
}

if ($action === 'audit_log') {
    $search = $_GET['search'] ?? '';
    $type   = $_GET['type'] ?? '';
    $where  = 'WHERE 1=1';
    $params = [];
    if ($search) { $where .= ' AND (details LIKE ? OR done_by LIKE ? OR action_type LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%"; }
    if ($type)   { $where .= ' AND action_type = ?'; $params[] = $type; }
    $stmt = $db->prepare("SELECT * FROM ims_audit_log $where ORDER BY created_at DESC LIMIT 500");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['actionType'] = $r['action_type'];
        $r['doneBy'] = $r['done_by'];
        $r['createdAt'] = $r['created_at'];
    }
    jsonOut(['ok' => true, 'data' => $rows]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
