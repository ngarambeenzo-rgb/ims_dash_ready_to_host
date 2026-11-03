/* ═══════════════════════════════════════════════════
   IMS — navigation.js
   Page routing and navigation
═══════════════════════════════════════════════════ */

const PAGE_TITLES = {
  dashboard:     { en: 'Control center',   fr: 'Centre de contrôle',  sub: { en: 'What needs you today',                         fr: 'Ce qui demande votre attention' } },
  support:       { en: 'Support inbox',    fr: 'Messagerie support',  sub: { en: 'Messages from bar owners',                     fr: 'Messages des propriétaires de bars' } },
  clients:       { en: 'Clients',          fr: 'Clients',             sub: { en: 'Every business using your products',           fr: 'Toutes les entreprises clientes' } },
  subscriptions: { en: 'Subscriptions',    fr: 'Abonnements',         sub: { en: 'Plans, renewals and expiry dates',             fr: 'Forfaits, renouvellements et échéances' } },
  payments:      { en: 'Payments',         fr: 'Paiements',           sub: { en: 'Record a payment to restore access at once',   fr: 'Enregistrez un paiement pour rétablir l\'accès' } },
  devices:       { en: 'Devices',          fr: 'Appareils',           sub: { en: 'Approve or block each device',                 fr: 'Approuvez ou bloquez chaque appareil' } },
  licenses:      { en: 'Licenses',         fr: 'Licences',            sub: { en: 'Issued licenses, view and revoke',             fr: 'Licences émises, consulter et révoquer' } },
  products:      { en: 'Products & updates', fr: 'Produits et mises à jour', sub: { en: 'Versions and update releases',           fr: 'Versions et publications' } },
  reports:       { en: 'Reports',          fr: 'Rapports',            sub: { en: 'Revenue, clients and subscriptions',           fr: 'Revenus, clients et abonnements' } },
  map:           { en: 'Client map',       fr: 'Carte des clients',   sub: { en: 'Where your clients are',                       fr: 'Où se trouvent vos clients' } },
  auditlog:      { en: 'Audit log',        fr: 'Journal d\'audit',    sub: { en: 'Every action taken inside IMS',                fr: 'Toutes les actions effectuées dans IMS' } },
  settings:      { en: 'Settings',         fr: 'Paramètres',          sub: { en: 'Account, plans and email alerts',              fr: 'Compte, forfaits et alertes e-mail' } },
};

let _currentPage = 'dashboard';

function showPage(page) {
  _currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const el = document.getElementById('page-' + page);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const titles = PAGE_TITLES[page];
  if (titles) {
    document.getElementById('pageTitle').textContent = titles[currentLang] || titles.en;
    document.getElementById('pageSubtitle').textContent = titles.sub[currentLang] || titles.sub.en;
    document.title = (titles.en) + ' · IMS';
  }

  // Workbench: open an editor tab, refresh the explorer, close the phone drawer
  if (typeof imsOpenTab === 'function') imsOpenTab(page);
  if (typeof imsRefreshTree === 'function') imsRefreshTree(page === 'clients');
  if (typeof closeNav === 'function') closeNav();
  if (typeof closePanels === 'function') closePanels();
  const content = document.getElementById('pageContent');
  if (content) { content.scrollTop = 0; content.classList.toggle('map-mode', page === 'map'); }

  const loaders = {
    dashboard:     () => { loadDashboard(); setTimeout(() => { if (typeof _revenueChart !== 'undefined' && _revenueChart) _revenueChart.resize(); }, 300); },
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
    support:       loadSupportInbox,
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
    list.innerHTML = '<div class="empty-state">Nothing needs attention.</div>';
    return;
  }

  dot.style.display = 'block';
  const tone = { danger: 'var(--red)', warning: 'var(--orange)' };
  list.innerHTML = alerts.map(a => `
    <div class="notice-row">
      <b style="color:${tone[a.type] || 'var(--blue)'}">${esc(a.title)}</b>
      <span>${esc(a.message)}</span>
    </div>
  `).join('');
}
