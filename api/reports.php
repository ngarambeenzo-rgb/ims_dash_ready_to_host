<?php
// ============================================================
//  IMS — api/reports.php
//  Full analytics and reporting
// ============================================================
require_once __DIR__ . '/../config/db.php';
requireAuth();
$db     = getDB();
$action = $_REQUEST['action'] ?? 'summary';

function getDateRange($period) {
    switch ($period) {
        case 'last_month':
            return [date('Y-m-01', strtotime('first day of last month')),
                    date('Y-m-t',  strtotime('last day of last month'))];
        case 'last_3months':
            return [date('Y-m-01', strtotime('-3 months')), date('Y-m-d')];
        case 'last_6months':
            return [date('Y-m-01', strtotime('-6 months')), date('Y-m-d')];
        case 'this_year':
            return [date('Y-01-01'), date('Y-m-d')];
        case 'all_time':
            return ['2020-01-01', date('Y-m-d')];
        default:
            return [date('Y-m-01'), date('Y-m-d')];
    }
}

function qry($db, $sql, $params = []) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

if ($action === 'summary') {
    $period = $_GET['period'] ?? 'this_month';
    [$from, $to] = getDateRange($period);

    $days     = max(1, (strtotime($to) - strtotime($from)) / 86400);
    $prevFrom = date('Y-m-d', strtotime($from) - ($days + 1) * 86400);
    $prevTo   = date('Y-m-d', strtotime($from) - 86400);

    // Revenue
    $totalRevenue = (float)qry($db,'SELECT COALESCE(SUM(amount),0) FROM ims_payments WHERE DATE(created_at) BETWEEN ? AND ?',[$from,$to])->fetchColumn();
    $prevRevenue  = (float)qry($db,'SELECT COALESCE(SUM(amount),0) FROM ims_payments WHERE DATE(created_at) BETWEEN ? AND ?',[$prevFrom,$prevTo])->fetchColumn();

    // Clients
    $totalClients   = (int)qry($db,"SELECT COUNT(*) FROM ims_clients")->fetchColumn();
    $activeClients  = (int)qry($db,"SELECT COUNT(*) FROM ims_clients WHERE status='active'")->fetchColumn();
    $trialClients   = (int)qry($db,"SELECT COUNT(*) FROM ims_clients WHERE status='trial'")->fetchColumn();
    $expiredClients = (int)qry($db,"SELECT COUNT(*) FROM ims_clients WHERE status='expired'")->fetchColumn();
    $suspClients    = (int)qry($db,"SELECT COUNT(*) FROM ims_clients WHERE status='suspended'")->fetchColumn();
    $activeSubs     = (int)qry($db,"SELECT COUNT(*) FROM ims_subscriptions WHERE status='active'")->fetchColumn();

    $newClients     = (int)qry($db,'SELECT COUNT(*) FROM ims_clients WHERE DATE(created_at) BETWEEN ? AND ?',[$from,$to])->fetchColumn();
    $prevNewClients = (int)qry($db,'SELECT COUNT(*) FROM ims_clients WHERE DATE(created_at) BETWEEN ? AND ?',[$prevFrom,$prevTo])->fetchColumn();
    $avgRevenue     = $activeClients > 0 ? round($totalRevenue / $activeClients) : 0;

    // Revenue by day
    $revenueByDay = qry($db,'SELECT DATE(created_at) AS day, SUM(amount) AS amount FROM ims_payments WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day ASC',[$from,$to])->fetchAll();
    foreach ($revenueByDay as &$r) $r['amount'] = (float)$r['amount'];
    unset($r);

    // Revenue by month
    $revenueByMonth = qry($db,'SELECT DATE_FORMAT(created_at,"%Y-%m") AS month, SUM(amount) AS amount, COUNT(*) AS payments FROM ims_payments WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE_FORMAT(created_at,"%Y-%m") ORDER BY month ASC',[$from,$to])->fetchAll();
    foreach ($revenueByMonth as &$r) {
        $r['amount']   = (float)$r['amount'];
        $r['payments'] = (int)$r['payments'];
        $r['label']    = date('M Y', strtotime($r['month'].'-01'));
    }
    unset($r);

    // Plan breakdown
    $planBreakdown = qry($db,'SELECT sp.name, sp.price_rwf, COUNT(s.id) AS client_count, COALESCE(SUM(p.amount),0) AS revenue FROM ims_subscription_plans sp LEFT JOIN ims_subscriptions s ON s.plan_id=sp.id AND s.status="active" LEFT JOIN ims_payments p ON p.plan_id=sp.id GROUP BY sp.id ORDER BY revenue DESC')->fetchAll();
    foreach ($planBreakdown as &$r) {
        $r['clientCount'] = (int)$r['client_count'];
        $r['revenue']     = (float)$r['revenue'];
        $r['planName']    = $r['name'];
        $r['priceRwf']    = (float)$r['price_rwf'];
    }
    unset($r);

    // Payment methods
    $paymentMethods = qry($db,'SELECT payment_method, COUNT(*) AS cnt, SUM(amount) AS total FROM ims_payments WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY payment_method ORDER BY total DESC',[$from,$to])->fetchAll();
    foreach ($paymentMethods as &$r) {
        $r['count']  = (int)$r['cnt'];
        $r['total']  = (float)$r['total'];
        $r['method'] = $r['payment_method'] ?: 'Cash';
    }
    unset($r);

    // Top clients
    $topClients = qry($db,'SELECT c.id, c.business_name, c.status, c.location, COALESCE(SUM(p.amount),0) AS total_paid, COUNT(p.id) AS payment_count, MAX(p.created_at) AS last_payment FROM ims_clients c LEFT JOIN ims_payments p ON p.client_id=c.id AND DATE(p.created_at) BETWEEN ? AND ? GROUP BY c.id ORDER BY total_paid DESC LIMIT 10',[$from,$to])->fetchAll();
    foreach ($topClients as &$r) {
        $r['totalPaid']    = (float)$r['total_paid'];
        $r['paymentCount'] = (int)$r['payment_count'];
        $r['businessName'] = $r['business_name'];
        $r['lastPayment']  = $r['last_payment'] ? date('d M Y', strtotime($r['last_payment'])) : 'Never';
    }
    unset($r);

    // Expiring soon
    $expiringSoon = qry($db,'SELECT s.expiry_date, c.business_name, c.contact_phone, sp.name AS plan_name, DATEDIFF(s.expiry_date, CURDATE()) AS days_left FROM ims_subscriptions s JOIN ims_clients c ON c.id=s.client_id JOIN ims_subscription_plans sp ON sp.id=s.plan_id WHERE s.status="active" AND s.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY) ORDER BY s.expiry_date ASC')->fetchAll();
    foreach ($expiringSoon as &$r) {
        $r['businessName'] = $r['business_name'];
        $r['daysLeft']     = (int)$r['days_left'];
        $r['planName']     = $r['plan_name'];
        $r['phone']        = $r['contact_phone'];
    }
    unset($r);

    // Monthly summary
    $monthlySummary = qry($db,'SELECT DATE_FORMAT(created_at,"%Y-%m") AS month, COUNT(*) AS payments, SUM(amount) AS revenue, COUNT(DISTINCT client_id) AS clients FROM ims_payments GROUP BY DATE_FORMAT(created_at,"%Y-%m") ORDER BY month DESC LIMIT 12')->fetchAll();
    foreach ($monthlySummary as &$r) {
        $r['revenue']  = (float)$r['revenue'];
        $r['payments'] = (int)$r['payments'];
        $r['clients']  = (int)$r['clients'];
        $r['label']    = date('M Y', strtotime($r['month'].'-01'));
    }
    unset($r);

    // All payments in period
    $payments = qry($db,'SELECT p.*, c.business_name AS client_name, sp.name AS plan_name FROM ims_payments p JOIN ims_clients c ON c.id=p.client_id JOIN ims_subscription_plans sp ON sp.id=p.plan_id WHERE DATE(p.created_at) BETWEEN ? AND ? ORDER BY p.created_at DESC LIMIT 500',[$from,$to])->fetchAll();
    foreach ($payments as &$r) {
        $r['amount']      = (float)$r['amount'];
        $r['clientName']  = $r['client_name'];
        $r['planName']    = $r['plan_name'];
        $r['date']        = date('d M Y', strtotime($r['created_at']));
        $r['method']      = $r['payment_method'] ?: 'Cash';
        $r['periodStart'] = $r['period_start'];
        $r['periodEnd']   = $r['period_end'];
        $r['recordedBy']  = $r['recorded_by'];
        $r['maxDevices']  = (int)$r['max_devices'];
    }
    unset($r);

    // Sync activity
    $syncActivity = qry($db,'SELECT DATE(synced_at) AS day, COUNT(*) AS syncs FROM ims_sync_log WHERE synced_at >= DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY DATE(synced_at) ORDER BY day ASC')->fetchAll();
    foreach ($syncActivity as &$r) $r['syncs'] = (int)$r['syncs'];
    unset($r);

    jsonOut([
        'ok'             => true,
        'period'         => $period,
        'from'           => $from,
        'to'             => $to,
        'totalRevenue'   => $totalRevenue,
        'prevRevenue'    => $prevRevenue,
        'activeSubs'     => $activeSubs,
        'newClients'     => $newClients,
        'prevNewClients' => $prevNewClients,
        'totalClients'   => $totalClients,
        'activeClients'  => $activeClients,
        'trialClients'   => $trialClients,
        'expiredClients' => $expiredClients,
        'suspClients'    => $suspClients,
        'avgRevenue'     => $avgRevenue,
        'revenueByDay'   => $revenueByDay,
        'revenueByMonth' => $revenueByMonth,
        'planBreakdown'  => $planBreakdown,
        'paymentMethods' => $paymentMethods,
        'topClients'     => $topClients,
        'expiringSoon'   => $expiringSoon,
        'monthlySummary' => $monthlySummary,
        'payments'       => $payments,
        'syncActivity'   => $syncActivity,
    ]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 400);
