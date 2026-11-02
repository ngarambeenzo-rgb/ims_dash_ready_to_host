<?php
require_once __DIR__ . '/config/db.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="csrf-token" content="<?php echo htmlspecialchars($_SESSION['ims_csrf'],ENT_QUOTES); ?>"/>
  <title>IMS — Instance Management System</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="assets/css/main.css?v=7"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>

<!-- ── LOGIN ── -->
<div id="loginWrap" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px">
  <div style="width:100%;max-width:380px">
    <div style="text-align:center;margin-bottom:28px">
      <div style="width:56px;height:56px;background:linear-gradient(135deg,#4D9EFF,#7C3AED);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px">🛡️</div>
      <h1 style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px">IMS</h1>
      <p style="font-size:12px;color:var(--muted)">Instance Management System</p>
    </div>
    <div style="background:var(--card);border-radius:var(--r-lg);padding:28px;border:1px solid var(--border)">
      <div class="form-group">
        <label class="form-label" data-i18n="username">Username</label>
        <input type="text" id="loginUser" class="form-input" placeholder="admin" autocomplete="username"/>
      </div>
      <div class="form-group">
        <label class="form-label" data-i18n="password">Password</label>
        <input type="password" id="loginPass" class="form-input" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()"/>
      </div>
      <div id="loginErr" style="display:none;color:var(--red);font-size:12px;margin-bottom:12px;align-items:center;gap:6px">
        <span>❌</span><span data-i18n="invalidCredentials">Invalid credentials. Try again.</span>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:11px" onclick="doLogin()">
        <span data-i18n="signIn">Sign In →</span>
      </button>
      <div style="text-align:center;margin-top:14px">
        <button onclick="toggleLang()" style="background:none;border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:11px;cursor:pointer;color:var(--muted);font-family:inherit" id="langBtn">🇫🇷 Français</button>
      </div>
    </div>
    <p style="text-align:center;font-size:10px;color:var(--faint);margin-top:16px">IMS Company — Internal Access Only</p>
  </div>
</div>

<!-- ── APP SHELL ── -->
<div id="appShell" class="app" style="display:none">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sb-logo">
      <div class="sb-logo-icon">🛡️</div>
      <div>
        <h1>IMS</h1>
        <p>Instance Management</p>
      </div>
    </div>

    <div class="sb-user">
      <div class="sb-avatar" id="avatarTxt">AD</div>
      <div class="sb-user-info">
        <p id="adminName">Admin</p>
        <span class="sb-online" id="adminRole">Super Administrator</span>
      </div>
    </div>

    <div class="sidebar-nav">
      <div class="sb-section-label" data-i18n="main">Main Navigation</div>
      <div class="nav-item active" onclick="showPage('dashboard')">
        <span class="nav-icon">📊</span><span>Control Center</span>
      </div>

      <div class="sb-section-label" data-i18n="control">Management</div>
      <div class="nav-item" onclick="showPage('clients')">
        <span class="nav-icon">🏢</span><span data-i18n="clients">Clients & Businesses</span>
      </div>
      <div class="nav-item" onclick="showPage('subscriptions')">
        <span class="nav-icon">📋</span><span data-i18n="subscriptions">Subscriptions</span>
      </div>
      <div class="nav-item" onclick="showPage('devices')">
        <span class="nav-icon">📱</span><span data-i18n="devices">Devices Management</span>
        <span class="nav-badge" id="pendingDevicesBadge" style="display:none">0</span>
      </div>
      <div class="nav-item" onclick="showPage('licenses')">
        <span class="nav-icon">🔑</span><span data-i18n="licenses">Licenses</span>
      </div>
      <div class="nav-item" onclick="showPage('payments')">
        <span class="nav-icon">💰</span><span data-i18n="payments">Payments & Invoices</span>
      </div>

      <div class="sb-section-label" data-i18n="system">System</div>
      <div class="nav-item" onclick="showPage('products')">
        <span class="nav-icon">📦</span><span data-i18n="products">Products & Updates</span>
      </div>
      <div class="nav-item" onclick="showPage('reports')">
        <span class="nav-icon">📊</span><span>Reports</span>
      </div>
      <div class="nav-item" onclick="showPage('map')">
        <span class="nav-icon">🗺️</span><span data-i18n="clientMap">Maps & Locations</span>
      </div>
      <div class="nav-item" onclick="showPage('support')">
        <span class="nav-icon">💬</span><span>Support inbox</span><span class="nav-badge" id="supportBadge" style="display:none"></span>
      </div>
      <div class="nav-item" onclick="showPage('auditlog')">
        <span class="nav-icon">📝</span><span data-i18n="auditLog">Audit Logs</span>
      </div>
      <div class="nav-item" onclick="showPage('settings')">
        <span class="nav-icon">⚙️</span><span data-i18n="settings">System Settings</span>
      </div>
    </div>

    <!-- System Status -->
    <div class="sys-status">
      <div class="sys-status-title">System Status</div>
      <div class="sys-health">
        <div class="sys-health-ring">
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#1F2D45" stroke-width="3"/>
            <circle cx="18" cy="18" r="15" fill="none" stroke="#00D084" stroke-width="3" stroke-dasharray="87 94" stroke-linecap="round"/>
          </svg>
          <div class="sys-health-pct">98%</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text)">System Health</div>
          <div class="sys-all-ok">✅ All systems operational</div>
        </div>
      </div>
      <div style="margin-top:8px">
        <div class="sys-item"><span>API Gateway</span><span>Online</span></div>
        <div class="sys-item"><span>License Service</span><span>Online</span></div>
        <div class="sys-item"><span>Database</span><span>Online</span></div>
      </div>
    </div>

    <div class="sb-bottom">
      <div class="nav-item-logout" onclick="doLogout()">
        <span>🚪</span><span data-i18n="logout">Logout</span>
      </div>
    </div>
  </div>

  <!-- MAIN -->
  <div class="main">

    <!-- TOPBAR -->
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <h2 id="pageTitle">Control Center</h2>
          <p id="pageSubtitle" style="font-size:11px;color:var(--muted)">Overview &amp; System Insights</p>
        </div>
      </div>
      <div class="topbar-search">
        <span style="color:var(--faint);font-size:13px">🔍</span>
        <input type="text" placeholder="Search anything..." id="globalSearch" oninput="globalSearchFn(this.value)"/>
        <kbd>CTRL K</kbd>
      </div>
      <div class="topbar-right">
        <span id="topbarAdmin" style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap"></span>
        <div class="topbar-datetime">
          <p id="topDate"></p>
          <p id="topTime"></p>
        </div>
        <div class="topbar-icon" onclick="showPage('clients')" title="Clients">🏢</div>
        <div class="topbar-icon" style="position:relative" onclick="toggleAlerts()" title="Alerts">
          🔔<span class="notif-dot" id="alertDot" style="display:none"></span>
        </div>
        <div class="topbar-icon" onclick="showPage('payments')" title="Payments">💰</div>
        <div class="topbar-icon" onclick="showPage('map')" title="Map">🗺️</div>
        <button class="btn-quick" onclick="showQuickActions()">⚡ Quick Actions ▾</button>

        <!-- Alert Panel -->
        <div id="alertPanel" style="display:none;position:absolute;right:20px;top:60px;width:320px;background:var(--card);border-radius:var(--r);border:1px solid var(--border);box-shadow:0 16px 40px rgba(0,0,0,.4);z-index:500">
          <div style="padding:14px 16px;font-size:13px;font-weight:700;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <span>🔔 Recent Alerts</span>
            <span class="view-all" onclick="showPage('auditlog');document.getElementById('alertPanel').style.display='none'">View All</span>
          </div>
          <div id="alertList" style="max-height:320px;overflow-y:auto;padding:8px"></div>
        </div>

        <!-- Quick Actions Panel -->
        <div id="quickPanel" style="display:none;position:absolute;right:20px;top:60px;width:200px;background:var(--card);border-radius:var(--r);border:1px solid var(--border);box-shadow:0 16px 40px rgba(0,0,0,.4);z-index:500;padding:8px">
          <div onclick="showAddClient();closeQuickActions()" class="nav-item" style="min-height:36px;padding:8px 10px">🏢 Add Client</div>
          <div onclick="showRecordPayment();closeQuickActions()" class="nav-item" style="min-height:36px;padding:8px 10px">💰 Record Payment</div>
          <div onclick="showPage('devices');closeQuickActions()" class="nav-item" style="min-height:36px;padding:8px 10px">📱 Approve Devices</div>
          <div onclick="showGenerateLicense();closeQuickActions()" class="nav-item" style="min-height:36px;padding:8px 10px">🔑 Generate License</div>
        </div>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="content" id="pageContent">
      <?php
        $pages = [
          'dashboard', 'clients', 'subscriptions', 'payments',
          'devices',   'licenses', 'products',      'reports',
          'map',       'auditlog', 'settings', 'support'
        ];
        foreach ($pages as $page) {
          $file = "pages/{$page}.html";
          if (file_exists($file)) {
            include $file;
          } else {
            echo "<!-- pages/{$page}.html not found -->\n";
          }
        }
      ?>
    </div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modalBox">
    <div class="modal-header">
      <span class="modal-title" id="modalTitle">Modal</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div id="modalContent"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script src="assets/js/utils.js?v=7"></script>
<script src="assets/js/shared_helpers.js?v=7"></script>
<script src="assets/js/api.js?v=7"></script>
<script src="assets/js/auth.js?v=7"></script>
<script src="assets/js/navigation.js?v=7"></script>
<script src="assets/js/dashboard.js?v=7"></script>
<script src="assets/js/clients.js?v=7"></script>
<script src="assets/js/subscriptions.js?v=7"></script>
<script src="assets/js/payments.js?v=7"></script>
<script src="assets/js/devices.js?v=7"></script>
<script src="assets/js/licenses.js?v=7"></script>
<script src="assets/js/products.js?v=7"></script>
<script src="assets/js/map.js?v=7"></script>
<script src="assets/js/reports.js?v=7"></script>
<script src="assets/js/settings.js?v=8"></script>
<script src="assets/js/support.js?v=1"></script>

<script>
  // ── Clock ──────────────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('topDate');
    const timeEl = document.getElementById('topTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-RW', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-RW', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ── Close panels on outside click ─────────────────────────
  document.addEventListener('click', e => {
    const alertPanel = document.getElementById('alertPanel');
    const quickPanel = document.getElementById('quickPanel');
    if (!e.target.closest('#alertPanel') && !e.target.closest('[onclick*="toggleAlerts"]')) {
      if (alertPanel) alertPanel.style.display = 'none';
    }
    if (!e.target.closest('#quickPanel') && !e.target.closest('[onclick*="showQuickActions"]')) {
      if (quickPanel) quickPanel.style.display = 'none';
    }
  });

  // ── Close modal on overlay click ──────────────────────────
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // ── Quick actions ─────────────────────────────────────────
  function showQuickActions() {
    const p = document.getElementById('quickPanel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  }
  function closeQuickActions() {
    const p = document.getElementById('quickPanel');
    if (p) p.style.display = 'none';
  }

  // ── Global search ─────────────────────────────────────────
  function globalSearchFn(q) {
    if (q.length > 1) showPage('clients');
  }

  // ── Language init ─────────────────────────────────────────
  currentLang = localStorage.getItem('ims_lang') || 'en';
  applyLanguage();
</script>
</body>
</html>
