<?php
require_once __DIR__ . '/config/db.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#323233"/>
  <meta name="csrf-token" content="<?php echo htmlspecialchars($_SESSION['ims_csrf'],ENT_QUOTES); ?>"/>
  <title>IMS — Instance Management System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Barlow+Semi+Condensed:wght@700&display=swap" rel="stylesheet"/>
  <link rel="icon" href="assets/img/ims-mark.png"/>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="assets/css/main.css?v=19"/>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>

<!-- Icon set (stroke icons, one place) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="lg-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".45" stop-color="#9aa6b8"/><stop offset=".7" stop-color="#e5e9f0"/><stop offset="1" stop-color="#8b97aa"/></linearGradient>
    <symbol id="logo-full" viewBox="0 0 280 85">    <rect x="6" y="29" width="11.5" height="48.5" fill="#f1f5f9"/>
    <rect x="20.5" y="29" width="10.5" height="48.5" fill="#f1f5f9"/>
    <rect x="85" y="29" width="12.5" height="48.5" fill="#f1f5f9"/>
    <path d="M24 29.5 L33.7 29.5 L62 58.5 L108.7 6.2 L65.5 72.5 L59.5 73 Z" fill="url(#lg-silver)"/>
    <path d="M159 35 H111 V53.5 H153 V72 H105" fill="none" stroke="#f1f5f9" stroke-width="11.5" stroke-linejoin="miter"/>
    <rect x="167.5" y="29" width="1.2" height="45" fill="#64748b"/>
    <text x="177.5" y="37.6" font-family="'Barlow Semi Condensed','Segoe UI',sans-serif" font-weight="700" font-size="13" fill="#f1f5f9" textLength="77.5" lengthAdjust="spacingAndGlyphs">INTEGRATED</text>
    <text x="177.5" y="56.4" font-family="'Barlow Semi Condensed','Segoe UI',sans-serif" font-weight="700" font-size="13" fill="#9aa3b2" textLength="95" lengthAdjust="spacingAndGlyphs">MANAGEMENT</text>
    <text x="177.5" y="75" font-family="'Barlow Semi Condensed','Segoe UI',sans-serif" font-weight="700" font-size="13" fill="#f1f5f9" textLength="75" lengthAdjust="spacingAndGlyphs">SOLUTIONS</text></symbol>
    <symbol id="logo-mark" viewBox="0 0 166 85">
      
    
    <rect x="6" y="29" width="11.5" height="48.5" fill="#f1f5f9"/>
    <rect x="20.5" y="29" width="10.5" height="48.5" fill="#f1f5f9"/>
    <rect x="85" y="29" width="12.5" height="48.5" fill="#f1f5f9"/>
    <path d="M24 29.5 L33.7 29.5 L62 58.5 L108.7 6.2 L65.5 72.5 L59.5 73 Z" fill="url(#lg-silver)"/>
    <path d="M159 35 H111 V53.5 H153 V72 H105" fill="none" stroke="#f1f5f9" stroke-width="11.5" stroke-linejoin="miter"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="10.5" r="2"/><path d="M12 12.5V16"/></symbol>
    <symbol id="i-dashboard" viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></symbol>
    <symbol id="i-clients" viewBox="0 0 24 24"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/></symbol>
    <symbol id="i-subs" viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h3"/></symbol>
    <symbol id="i-devices" viewBox="0 0 24 24"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2"/></symbol>
    <symbol id="i-key" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M14 9l2 2"/></symbol>
    <symbol id="i-payments" viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><circle cx="12" cy="12" r="3"/><path d="M6.5 12h.01M17.5 12h.01"/></symbol>
    <symbol id="i-package" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12.5l8.7-5M12 22V12.5"/></symbol>
    <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/></symbol>
    <symbol id="i-map" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></symbol>
    <symbol id="i-support" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></symbol>
    <symbol id="i-audit" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/></symbol>
    <symbol id="i-settings" viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></symbol>
    <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.6-4.6"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></symbol>
    <symbol id="i-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M8 12.5l3 3 5-6"/></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></symbol>
    <symbol id="i-warn" viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></symbol>
    <symbol id="i-wifi-off" viewBox="0 0 24 24"><path d="M2 8.8a15 15 0 0 1 4-2.4M22 8.8A15 15 0 0 0 10 5M5 12.9a10 10 0 0 1 5-2.7M19 12.9a10 10 0 0 0-2-1.5M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/></symbol>
    <symbol id="i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></symbol>
    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></symbol>
    <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M5.3 5.3l13.4 13.4"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M10 8.5l5 3.5-5 3.5z"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></symbol>
    <symbol id="i-card" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 14h3"/></symbol>
    <symbol id="i-print" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></symbol>
    <symbol id="i-users" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></symbol>
    <symbol id="i-terminal" viewBox="0 0 24 24"><path d="M4 17l6-6-6-6M12 19h8"/></symbol>
    <symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
    <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14 14 0 0 1 0 19 14 14 0 0 1 0-19z"/></symbol>
    <symbol id="i-crosshair" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5"/></symbol>
    <symbol id="i-expand" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></symbol>
    <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
    <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></symbol>
  </defs>
</svg>

<!-- ── LOGIN ── -->
<div id="loginWrap" class="login">
  <div class="login-brand">
    <div class="login-logo"><svg class="logo-svg" viewBox="0 0 280 85" role="img" aria-label="IMS Integrated Management Solutions"><use href="#logo-full"/></svg></div>
    <div>
      <h2>One workspace for every BarMS client.</h2>
      <p>Approve devices, issue licenses, record payments and answer support before a bar's app locks.</p>
      <div class="login-code" aria-hidden="true">
<span class="ln">1</span><span class="c">// what this workspace does</span><br>
<span class="ln">2</span><span class="k">const</span> ims = {<br>
<span class="ln">3</span>&nbsp;&nbsp;devices:&nbsp;&nbsp;&nbsp;<span class="f">approve</span>(<span class="s">"new phones &amp; PCs"</span>),<br>
<span class="ln">4</span>&nbsp;&nbsp;licenses:&nbsp;&nbsp;<span class="f">issue</span>(<span class="s">"signed, per device"</span>),<br>
<span class="ln">5</span>&nbsp;&nbsp;payments:&nbsp;&nbsp;<span class="f">record</span>(<span class="s">"restores access"</span>),<br>
<span class="ln">6</span>&nbsp;&nbsp;support:&nbsp;&nbsp;&nbsp;<span class="f">answer</span>(<span class="s">"bar owners"</span>),<br>
<span class="ln">7</span>};
      </div>
    </div>
    <div class="login-foot">IMS Company · internal access only</div>
  </div>
  <div class="login-form-wrap">
    <div class="login-card">
      <div class="login-brand-mobile"><svg class="logo-svg" viewBox="0 0 280 85" role="img" aria-label="IMS Integrated Management Solutions"><use href="#logo-full"/></svg></div>
      <h1 data-i18n="signInTitle">Sign in</h1>
      <p class="sub">Use your IMS administrator account.</p>
      <div class="form-group">
        <label class="form-label" for="loginUser" data-i18n="username">Username</label>
        <input type="text" id="loginUser" class="form-input" autocomplete="username" autocapitalize="none" spellcheck="false" style="min-height:36px"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="loginPass" data-i18n="password">Password</label>
        <input type="password" id="loginPass" class="form-input" autocomplete="current-password" style="min-height:36px" onkeydown="if(event.key==='Enter')doLogin()"/>
      </div>
      <div id="loginErr" class="login-err" role="alert">
        <svg class="ic ic-sm"><use href="#i-warn"/></svg><span data-i18n="invalidCredentials">Wrong username or password. Try again.</span>
      </div>
      <button class="btn btn-primary" style="width:100%;min-height:36px" onclick="doLogin()">
        <span data-i18n="signIn">Sign in</span>
      </button>
      <button class="login-lang" onclick="toggleLang()" id="langBtn" type="button">Français</button>
    </div>
  </div>
</div>

<!-- ── WORKBENCH ── -->
<div id="appShell" class="ide" style="display:none">

  <!-- TITLE BAR -->
  <header class="titlebar">
    <button class="tb-menu" onclick="openNav()" aria-label="Open explorer"><svg class="ic"><use href="#i-menu"/></svg></button>
    <div class="tb-brand"><span class="brand-chip"><svg class="logo-svg" viewBox="0 0 166 85" role="img" aria-label="IMS"><use href="#logo-mark"/></svg></span></div>
    <div class="tb-title"><b>Integrated Management Solutions</b></div>
    <div class="palette-box" onclick="openPalette()" role="button" aria-label="Open command palette">
      <svg class="ic ic-sm"><use href="#i-search"/></svg>
      <span>Search clients, pages and commands</span>
      <kbd>Ctrl K</kbd>
    </div>
    <div class="tb-right">
      <button class="tb-btn" onclick="toggleAlerts()" aria-label="Alerts" title="Alerts"><svg class="ic"><use href="#i-bell"/></svg><span class="notif-dot" id="alertDot" style="display:none"></span></button>
      <button class="tb-btn" onclick="showQuickActions()" aria-label="New" title="New"><svg class="ic"><use href="#i-plus"/></svg></button>
      <div class="tb-avatar" id="avatarTxt" title="Signed in">AD</div>
    </div>

    <div id="alertPanel" class="float-panel">
      <div class="fp-head"><span>Alerts</span><span class="view-all" onclick="showPage('auditlog');closePanels()">Audit log</span></div>
      <div id="alertList" style="max-height:340px;overflow-y:auto"></div>
    </div>
    <div id="quickPanel" class="float-panel">
      <div class="quick-item" onclick="showAddClient();closePanels()"><svg class="ic"><use href="#i-clients"/></svg>Add client</div>
      <div class="quick-item" onclick="showRecordPayment();closePanels()"><svg class="ic"><use href="#i-payments"/></svg>Record payment</div>
      <div class="quick-item" onclick="showPage('devices');closePanels()"><svg class="ic"><use href="#i-devices"/></svg>Approve devices</div>
      <div class="quick-item" onclick="showGenerateLicense();closePanels()"><svg class="ic"><use href="#i-key"/></svg>Generate license</div>
    </div>
  </header>

  <div class="sb-scrim" onclick="closeNav()"></div>

  <div class="workbench">

    <!-- ACTIVITY BAR -->
    <nav class="activitybar" aria-label="Main">
      <div class="act-group">
        <div class="nav-item act-item active" data-page="dashboard" data-tip="Control center" onclick="showPage('dashboard')"><svg class="ic"><use href="#i-dashboard"/></svg></div>
        <div class="nav-item act-item" data-page="clients" data-tip="Clients" onclick="showPage('clients')"><svg class="ic"><use href="#i-clients"/></svg></div>
        <div class="nav-item act-item" data-page="subscriptions" data-tip="Subscriptions" onclick="showPage('subscriptions')"><svg class="ic"><use href="#i-subs"/></svg></div>
        <div class="nav-item act-item" data-page="devices" data-tip="Devices" onclick="showPage('devices')"><svg class="ic"><use href="#i-devices"/></svg><span class="act-badge" id="actDevicesBadge" style="display:none"></span></div>
        <div class="nav-item act-item" data-page="licenses" data-tip="Licenses" onclick="showPage('licenses')"><svg class="ic"><use href="#i-key"/></svg></div>
        <div class="nav-item act-item" data-page="payments" data-tip="Payments" onclick="showPage('payments')"><svg class="ic"><use href="#i-payments"/></svg></div>
        <div class="nav-item act-item" data-page="support" data-tip="Support inbox" onclick="showPage('support')"><svg class="ic"><use href="#i-support"/></svg><span class="act-badge" id="actSupportBadge" style="display:none"></span></div>
        <div class="nav-item act-item" data-page="map" data-tip="Client map" onclick="showPage('map')"><svg class="ic"><use href="#i-map"/></svg></div>
        <div class="nav-item act-item" data-page="reports" data-tip="Reports" onclick="showPage('reports')"><svg class="ic"><use href="#i-chart"/></svg></div>
      </div>
      <div class="act-group">
        <div class="nav-item act-item" data-page="settings" data-tip="Settings" onclick="showPage('settings')"><svg class="ic"><use href="#i-settings"/></svg></div>
        <div class="nav-item act-item" data-tip="Sign out" onclick="doLogout()"><svg class="ic"><use href="#i-logout"/></svg></div>
      </div>
    </nav>

    <!-- EXPLORER -->
    <aside class="sidebar" id="sidebar">
      <div class="sb-head"><span>Explorer</span><button class="sb-close" onclick="closeNav()" aria-label="Close explorer"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="sb-logo"><svg class="logo-svg" viewBox="0 0 280 85" role="img" aria-label="IMS Integrated Management Solutions"><use href="#logo-full"/></svg></div>
      <nav class="sidebar-nav">

        <div class="sb-section" id="secWorkspace">
          <div class="sb-sec-title" onclick="toggleSection('secWorkspace')"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg>IMS workspace</div>
          <div class="sb-sec-body">
            <div class="sb-folder" onclick="toggleFolder(this)"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg><svg class="ic ic-sm" style="color:#dcb67a"><use href="#i-folder"/></svg>operate</div>
            <div class="sb-children">
              <div class="nav-item active" data-page="dashboard" onclick="showPage('dashboard')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-dashboard"/></svg></span><span data-i18n="controlCenter">Control center</span></div>
            </div>
            <div class="sb-folder" onclick="toggleFolder(this)"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg><svg class="ic ic-sm" style="color:#dcb67a"><use href="#i-folder"/></svg>manage</div>
            <div class="sb-children">
              <div class="nav-item" data-page="clients" onclick="showPage('clients')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-clients"/></svg></span><span data-i18n="clients">Clients</span></div>
              <div class="nav-item" data-page="subscriptions" onclick="showPage('subscriptions')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-subs"/></svg></span><span data-i18n="subscriptions">Subscriptions</span></div>
              <div class="nav-item" data-page="devices" onclick="showPage('devices')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-devices"/></svg></span><span data-i18n="devices">Devices</span><span class="nav-badge" id="pendingDevicesBadge" style="display:none">0</span></div>
              <div class="nav-item" data-page="licenses" onclick="showPage('licenses')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-key"/></svg></span><span data-i18n="licenses">Licenses</span></div>
              <div class="nav-item" data-page="payments" onclick="showPage('payments')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-payments"/></svg></span><span data-i18n="payments">Payments</span></div>
            </div>
            <div class="sb-folder" onclick="toggleFolder(this)"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg><svg class="ic ic-sm" style="color:#dcb67a"><use href="#i-folder"/></svg>system</div>
            <div class="sb-children">
              <div class="nav-item" data-page="support" onclick="showPage('support')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-support"/></svg></span><span data-i18n="support">Support inbox</span><span class="nav-badge" id="supportBadge" style="display:none"></span></div>
              <div class="nav-item" data-page="map" onclick="showPage('map')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-map"/></svg></span><span data-i18n="clientMap">Client map</span></div>
              <div class="nav-item" data-page="reports" onclick="showPage('reports')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-chart"/></svg></span><span data-i18n="reports">Reports</span></div>
              <div class="nav-item" data-page="products" onclick="showPage('products')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-package"/></svg></span><span data-i18n="products">Products &amp; updates</span></div>
              <div class="nav-item" data-page="auditlog" onclick="showPage('auditlog')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-audit"/></svg></span><span data-i18n="auditLog">Audit log</span></div>
              <div class="nav-item" data-page="settings" onclick="showPage('settings')"><span class="nav-icon"><svg class="ic ic-sm"><use href="#i-settings"/></svg></span><span data-i18n="settings">Settings</span></div>
            </div>
          </div>
        </div>

        <div class="sb-section" id="secClients">
          <div class="sb-sec-title" onclick="toggleSection('secClients')"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg>Clients<span class="count" id="treeClientCount">0</span></div>
          <div class="sb-sec-body" id="clientsTree"><div class="tree-empty">Loading…</div></div>
        </div>

        <div class="sb-section" id="secTimeline">
          <div class="sb-sec-title" onclick="toggleSection('secTimeline')"><svg class="ic ic-sm chev"><use href="#i-chevron"/></svg>Timeline</div>
          <div class="sb-sec-body" id="timelineTree"><div class="tree-empty">No activity yet</div></div>
        </div>
      </nav>
      <div class="sb-bottom">
        <div class="nav-item-logout" onclick="doLogout()"><svg class="ic"><use href="#i-logout"/></svg><span data-i18n="logout">Sign out</span></div>
      </div>
    </aside>

    <!-- EDITOR -->
    <div class="editor-col">
      <div class="crumbs" id="crumbs"><b>ims</b><span class="sep">›</span><b id="crumbGroup">operate</b><span class="sep">›</span><b id="pageTitle">Control center</b><span class="crumb-sub" id="pageSubtitle"></span></div>

      <main class="content" id="pageContent">
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
      </main>
    </div>
  </div>

  <!-- STATUS BAR -->
  <footer class="statusbar" id="statusbar">
    <div class="sb-group">
      <div class="sb-cell remote" id="sysStatus" title="Connection to the IMS server"><svg class="ic"><use href="#i-shield"/></svg><span id="sysStatusText">Connected</span></div>
      <div class="sb-cell hide-xs" id="sbProblems" onclick="showPage('dashboard')" title="Problems"><svg class="ic"><use href="#i-warn"/></svg><span id="sbProblemsN">0</span></div>
      <div class="sb-cell hide-sm" id="sbDevices" onclick="showPage('devices')" title="Devices waiting for approval"><svg class="ic"><use href="#i-devices"/></svg><span id="sbDevicesN">0</span></div>
      <div class="sb-cell hide-sm" id="sbSupport" onclick="showPage('support')" title="New support messages"><svg class="ic"><use href="#i-support"/></svg><span id="sbSupportN">0</span></div>
    </div>
    <div class="sb-group">
      <div class="sb-cell hide-md" id="sysStatusSub" title="Last response from the server">Waiting</div>
      <div class="sb-cell hide-sm" id="adminName" title="Signed in as">Admin</div>
      <div class="sb-cell hide-md" id="adminRole" style="display:none">Super administrator</div>
      <div class="sb-cell hide-xs" onclick="toggleLang()" title="Language"><svg class="ic"><use href="#i-globe"/></svg><span id="langStatus">EN</span></div>
      <div class="sb-cell hide-xs" title="Local time"><span id="topTime"></span></div>
    </div>
  </footer>
</div>

<!-- COMMAND PALETTE -->
<div class="palette-scrim" id="paletteScrim" onclick="if(event.target===this)closePalette()">
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <input id="paletteInput" type="text" placeholder="Type a page, client or command" autocomplete="off" spellcheck="false" oninput="paletteFilter(this.value)" onkeydown="paletteKey(event)"/>
    <div class="palette-list" id="paletteList"></div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modalBox" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal-header">
      <span class="modal-title" id="modalTitle">Modal</span>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">×</button>
    </div>
    <div id="modalContent"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script src="assets/js/utils.js?v=9"></script>
<script src="assets/js/shared_helpers.js?v=7"></script>
<script src="assets/js/api.js?v=9"></script>
<script src="assets/js/auth.js?v=10"></script>
<script src="assets/js/navigation.js?v=10"></script>
<script src="assets/js/dashboard.js?v=10"></script>
<script src="assets/js/clients.js?v=9"></script>
<script src="assets/js/subscriptions.js?v=7"></script>
<script src="assets/js/payments.js?v=7"></script>
<script src="assets/js/devices.js?v=8"></script>
<script src="assets/js/licenses.js?v=7"></script>
<script src="assets/js/products.js?v=8"></script>
<script src="assets/js/map-style.js?v=3"></script>
<script src="assets/js/map.js?v=15"></script>
<script src="assets/js/reports.js?v=8"></script>
<script src="assets/js/settings.js?v=8"></script>
<script src="assets/js/support.js?v=2"></script>
<script src="assets/js/ui.js?v=4"></script>

<script>
  currentLang = localStorage.getItem('ims_lang') || 'en';
  applyLanguage();
</script>
</body>
</html>
