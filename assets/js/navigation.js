/* ═══════════════════════════════════════════════════
   IMS — navigation.js
   Page routing and navigation
═══════════════════════════════════════════════════ */

const PAGE_TITLES = {
  dashboard:     { en: 'Dashboard', fr: 'Tableau de bord' },
  clients:       { en: 'Clients', fr: 'Clients' },
  subscriptions: { en: 'Subscriptions', fr: 'Abonnements' },
  payments:      { en: 'Payments', fr: 'Paiements' },
  devices:       { en: 'Devices', fr: 'Appareils' },
  licenses:      { en: 'Licenses', fr: 'Licences' },
  products:      { en: 'Products', fr: 'Produits' },
  map:           { en: 'Client Map', fr: 'Carte Clients' },
  auditlog:      { en: 'Audit Log', fr: 'Journal d\'audit' },
  settings:      { en: 'Settings', fr: 'Paramètres' },
};

function showPage(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  // Show target page
  const el = document.getElementById('page-' + page);
  if (el) el.style.display = 'block';

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${page}'`)) {
      n.classList.add('active');
    }
  });

  // Update title
  const titles = PAGE_TITLES[page];
  if (titles) document.getElementById('pageTitle').textContent = titles[currentLang] || titles.en;

  // Load page data
  const loaders = {
    dashboard:     () => { loadDashboard(); setTimeout(() => { if(typeof _revenueChart !== 'undefined' && _revenueChart) _revenueChart.resize(); }, 300); },
    clients:       loadClients,
    subscriptions: loadSubscriptions,
    payments:      loadPayments,
    devices:       loadDevices,
    licenses:      loadLicenses,
    products:      loadProducts,
    map:           loadMap,
    reports:       loadReports,
    auditlog:      loadAuditLog,
    settings:      loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

async function loadAlerts() {
  const res = await apiGet('misc', 'alerts');
  if (!res.ok) return;
  const alerts = res.data || [];
  const dot = document.getElementById('alertDot');
  const list = document.getElementById('alertList');

  if (alerts.length === 0) {
    dot.style.display = 'none';
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">No alerts</div>';
    return;
  }

  dot.style.display = 'block';
  list.innerHTML = alerts.map(a => `
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
      <div style="font-weight:600;color:${a.type === 'danger' ? 'var(--red)' : a.type === 'warning' ? 'var(--orange)' : 'var(--blue)'}">${esc(a.title)}</div>
      <div style="color:var(--muted);font-size:12px;margin-top:2px">${esc(a.message)}</div>
    </div>
  `).join('');
}
