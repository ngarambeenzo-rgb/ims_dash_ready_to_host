/* IMS — dashboard.js */
let _donutChart = null;
let _revenueChart = null;
let _deviceDonut = null;

const _ink = { grid: 'rgba(255,255,255,.07)', tick: '#9da1a6', ring: '#141821', empty: '#2b3445' };
const _daysTo = d => Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 86400000);

async function loadDashboard() {
  const res = await apiGet('misc', 'dashboard');
  if (!res.ok) {
    const s = document.getElementById('attnSummary');
    if (s) s.textContent = res.error === 'Network error' ? 'Could not reach the server. Check your connection and refresh.' : (res.error || 'Could not load the dashboard.');
    return;
  }
  const d = res.data || {};

  // KPIs, each with one useful line underneath
  document.getElementById('kpiTotalClients').textContent  = d.totalClients ?? '0';
  document.getElementById('kpiActiveClients').textContent = d.activeClients ?? '0';
  document.getElementById('kpiDevices').textContent       = d.totalDevices ?? '0';
  document.getElementById('kpiRevenue').textContent       = fmtRWF(d.monthRevenue || 0);
  _setText('kpiClientsChange', `${d.trialClients || 0} on trial · ${d.expiredClients || 0} expired`);
  _setText('kpiSubsChange',    d.expiringSoon ? `${d.expiringSoon} ending within 7 days` : 'None ending this week');
  _setText('kpiDevicesChange', `${d.syncedToday || 0} synced today`);
  _setText('kpiRevenueChange', new Date().toLocaleDateString('en-RW', { month: 'long', year: 'numeric' }));

  const badge = document.getElementById('pendingDevicesBadge');
  if (badge) { badge.textContent = d.pendingDevices || 0; badge.style.display = d.pendingDevices > 0 ? 'inline-block' : 'none'; }
  if (typeof updateSupportBadge === 'function') updateSupportBadge(d.newTickets || 0);

  renderAttention(d);
  _feedWorkbench(d);
  renderDonutChart(d);
  setTimeout(() => {
    renderDashRevenueChart(d.revenueByDay || []);
    setTimeout(() => { if (_revenueChart) _revenueChart.resize(); }, 200);
  }, 150);
  renderDeviceDonut(d);

  _setText('mapActiveCount',  d.activeClients || 0);
  _setText('mapTrialCount',   d.trialClients || 0);
  _setText('mapExpiredCount', d.expiredClients || 0);

  renderRecentSubs(d.recentSubs || []);
  renderDashPayments(d.recentPayments || []);
  renderDashProducts(d.products || []);
  renderDashActivity(d.recentActivity || []);

  setTimeout(() => initDashMap(d.clientsForMap || [], d.devicesForMap || []), 400);
}

function _setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

// ── Needs attention ───────────────────────────────
function renderAttention(d) {
  const cells = [
    ['attnDevices',  'attnDevicesN',  d.pendingDevices || 0, 'warm'],
    ['attnExpiring', 'attnExpiringN', d.expiringSoon || 0,   'warm'],
    ['attnExpired',  'attnExpiredN',  d.expiredClients || 0, 'hot'],
    ['attnMessages', 'attnMessagesN', d.newTickets || 0,     'warm'],
  ];
  cells.forEach(([cell, num, n, tone]) => {
    _setText(num, n);
    const el = document.getElementById(cell);
    el.classList.remove('hot', 'warm', 'clear');
    el.classList.add(n > 0 ? tone : 'clear');
  });

  const total = (d.pendingDevices || 0) + (d.expiringSoon || 0) + (d.expiredClients || 0) + (d.newTickets || 0);
  const silent = d.silentClients || [];
  _setText('attnSummary', total || silent.length
    ? 'Deal with these first. Each one is a bar waiting on you or about to lose access.'
    : 'Nothing is waiting on you.');
  _setText('attnUpdated', 'Updated ' + new Date().toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' }));

  // Detail rows: who is about to expire, who has gone quiet, which emails failed
  const rows = [];
  (d.expiringSubs || []).slice(0, 4).forEach(s => {
    const n = _daysTo(s.expiryDate);
    rows.push(`<div class="attn-row">
      <span class="badge badge-orange">${n <= 0 ? 'Ends today' : n === 1 ? 'Ends tomorrow' : 'Ends in ' + n + ' days'}</span>
      <span class="who">${esc(s.clientName)}</span>
      <span class="when">${esc(s.planName || '')}</span>
      <button class="btn btn-ghost btn-sm" onclick="showRecordPayment(${s.clientId})">Record payment</button>
    </div>`);
  });
  silent.slice(0, 4).forEach(c => {
    const label = c.lastSync ? 'Silent ' + Math.max(7, -_daysTo(c.lastSync)) + ' days' : 'Never connected';
    rows.push(`<div class="attn-row">
      <span class="badge badge-gray">${label}</span>
      <span class="who">${esc(c.businessName)}</span>
      <span class="when">${esc(c.location || '')}</span>
      <button class="btn btn-ghost btn-sm" onclick="showPage('clients')">Open clients</button>
    </div>`);
  });
  if (d.failedEmails > 0) {
    rows.push(`<div class="attn-row">
      <span class="badge badge-red">Email failed</span>
      <span class="who">${d.failedEmails} support message${d.failedEmails > 1 ? 's' : ''} did not reach the team inbox</span>
      <button class="btn btn-ghost btn-sm" onclick="showPage('support')">Open inbox</button>
    </div>`);
  }
  const list = document.getElementById('attnList');
  list.style.display = rows.length ? 'block' : 'none';
  list.innerHTML = rows.join('');
}

// ── Charts ────────────────────────────────────────
function renderDonutChart(d) {
  const trial   = d.trialClients || 0;
  const monthly = d.monthlyClients || 0;
  const annual  = d.annualClients || 0;
  const expired = d.expiredClients || 0;
  const total   = trial + monthly + annual + expired;

  _setText('donutTotal', d.activeClients || 0);
  _setText('dlTrial', trial); _setText('dlMonthly', monthly); _setText('dlAnnual', annual); _setText('dlExpired', expired);
  const pct = n => total ? Math.round(n / total * 100) + '%' : '0%';
  _setText('dpTrial', pct(trial)); _setText('dpMonthly', pct(monthly)); _setText('dpAnnual', pct(annual)); _setText('dpExpired', pct(expired));

  const ctx = document.getElementById('donutChart');
  if (!ctx) return;
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }

  const hasData = total > 0;
  _donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Trial', 'Monthly', 'Annual', 'Expired'],
      datasets: [{
        data: hasData ? [trial, monthly, annual, expired] : [1],
        backgroundColor: hasData ? ['#5ea2ff', '#34d399', '#fbbf24', '#fb7185'] : [_ink.empty],
        borderWidth: 2, borderColor: _ink.ring, hoverOffset: 3,
      }]
    },
    options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: hasData } }, responsive: false, animation: { duration: 600 } }
  });
}

function renderDeviceDonut(d) {
  const active  = d.totalDevices || 0;
  const pending = d.pendingDevices || 0;
  const blocked = d.blockedDevices || 0;
  const total   = active + pending + blocked;

  _setText('deviceDonutTotal', total);
  _setText('devActive', active); _setText('devPending', pending); _setText('devBlocked', blocked);

  const ctx = document.getElementById('deviceDonut');
  if (!ctx) return;
  if (_deviceDonut) { _deviceDonut.destroy(); _deviceDonut = null; }

  const hasData = total > 0;
  _deviceDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Approved', 'Waiting', 'Blocked'],
      datasets: [{
        data: hasData ? [active, pending, blocked] : [1],
        backgroundColor: hasData ? ['#34d399', '#fbbf24', '#fb7185'] : [_ink.empty],
        borderWidth: 2, borderColor: _ink.ring,
      }]
    },
    options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: hasData } }, responsive: false, animation: { duration: 600 } }
  });
}

function renderDashRevenueChart(days) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (_revenueChart) { _revenueChart.destroy(); _revenueChart = null; }

  const today = new Date();
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });
  const dayMap = {};
  (days || []).forEach(d => { dayMap[d.day] = d.amount; });

  _revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: last30.map(d => d.substring(5)),
      datasets: [{
        label: 'Revenue (RWF)',
        data: last30.map(d => dayMap[d] || 0),
        backgroundColor: '#22d3ee',
        hoverBackgroundColor: '#67e8f9',
        borderRadius: 3,
        maxBarThickness: 14,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'RWF ' + c.parsed.y.toLocaleString() } } },
      scales: {
        x: { ticks: { color: _ink.tick, font: { size: 11 }, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: _ink.tick, font: { size: 11 }, maxTicksLimit: 5, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v }, grid: { color: _ink.grid } }
      }
    }
  });
}

// ── Lists ─────────────────────────────────────────
function renderRecentSubs(subs) {
  const tbody = document.getElementById('dashRecentSubs');
  if (!subs.length) { tbody.innerHTML = '<tr><td colspan="5" class="td-muted" style="text-align:center;padding:24px">No subscriptions yet</td></tr>'; return; }
  tbody.innerHTML = subs.slice(0, 6).map(s => `
    <tr onclick="showPage('subscriptions')" style="cursor:pointer">
      <td><div class="flex gap-10">
        <div class="client-avatar">${esc((s.clientName || '??').substring(0, 2).toUpperCase())}</div>
        <span class="td-primary">${esc(s.clientName)}</span>
      </div></td>
      <td>${esc(s.planName || '—')}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="td-muted">${fmtDate(s.expiryDate)}</td>
      <td class="num fw-700">${fmtRWF(s.planPrice || 0)}</td>
    </tr>`).join('');
}

function renderDashPayments(payments) {
  const tbody = document.getElementById('dashRecentPayments');
  if (!payments.length) { tbody.innerHTML = '<tr><td colspan="5" class="td-muted" style="text-align:center;padding:20px">No payments yet</td></tr>'; return; }
  tbody.innerHTML = payments.slice(0, 5).map(p => `
    <tr onclick="showPage('payments')" style="cursor:pointer">
      <td><div class="flex gap-10">
        <div class="client-avatar">${esc((p.clientName || '??').substring(0, 2).toUpperCase())}</div>
        <span class="td-primary">${esc(p.clientName)}</span>
      </div></td>
      <td class="td-muted">${esc(p.paymentMethod || 'Cash')}</td>
      <td class="num fw-700">${fmtRWF(p.amount)}</td>
      <td class="td-muted">${fmtDate(p.createdAt)}</td>
      <td><span class="badge badge-green">Recorded</span></td>
    </tr>`).join('');
}

// Kept for older callers; alerts now live in the "Needs attention" panel.
function renderDashAlerts() {}

function renderDashProducts(products) {
  const el = document.getElementById('dashProducts');
  if (!products.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">No products yet</div>'; return; }
  el.innerHTML = products.slice(0, 4).map(p => `
    <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
      <div style="min-width:0">
        <div class="td-primary" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
        <div class="td-muted">Version ${esc(p.currentVersion || '1.0.0')} · ${fmtDate(p.updatedAt)}</div>
      </div>
      <span class="badge badge-green">Published</span>
    </div>`).join('');
}

function renderDashActivity(activity) {
  const el = document.getElementById('dashActivity');
  if (!activity.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">No activity yet</div>'; return; }
  el.innerHTML = activity.slice(0, 5).map(a => `
    <div class="activity-item">
      <div class="activity-avatar">${esc((a.doneBy || 'SY').substring(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="activity-text"><strong>${esc(a.doneBy)}</strong> · ${esc(a.details)}</div>
        <div class="activity-time">${fmtDateTime(a.createdAt)}</div>
      </div>
    </div>`).join('');
}

// ── Workbench feeds: Problems panel, Timeline, JSON snapshot ──
let _lastSnapshot = null;
function _feedWorkbench(d) {
  const p = [];
  if (d.expiredClients > 0) p.push({ sev: 'error', text: `${d.expiredClients} client(s) locked: subscription expired`, page: 'subscriptions' });
  if (d.pendingDevices > 0) p.push({ sev: 'warn',  text: `${d.pendingDevices} device(s) waiting for approval`, page: 'devices' });
  if (d.expiringSoon > 0)   p.push({ sev: 'warn',  text: `${d.expiringSoon} subscription(s) end within 7 days`, page: 'subscriptions' });
  if (d.newTickets > 0)     p.push({ sev: 'warn',  text: `${d.newTickets} new support message(s)`, page: 'support' });
  if (d.failedEmails > 0)   p.push({ sev: 'error', text: `${d.failedEmails} support email(s) failed to send`, page: 'support' });
  (d.silentClients || []).forEach(c => p.push({ sev: 'warn', text: `${c.businessName} has not connected in 7+ days`, page: 'clients' }));
  if (typeof imsProblems === 'function') imsProblems(p);
  if (typeof imsTimeline === 'function') imsTimeline(d.recentActivity || []);

  _lastSnapshot = {
    clients: { total: d.totalClients, active: d.activeClients, trial: d.trialClients, expired: d.expiredClients },
    devices: { approved: d.totalDevices, pending: d.pendingDevices, blocked: d.blockedDevices, syncedToday: d.syncedToday },
    subscriptions: { endingIn7Days: d.expiringSoon, monthly: d.monthlyClients, annual: d.annualClients },
    revenue: { thisMonthRWF: d.monthRevenue },
    support: { newMessages: d.newTickets },
    generatedAt: new Date().toISOString(),
  };
  const el = document.getElementById('dashSnapshot');
  if (el) el.innerHTML = _jsonHtml(_lastSnapshot, 0);
}
function _jsonHtml(v, depth) {
  const pad = '  '.repeat(depth + 1), end = '  '.repeat(depth);
  if (v === null || v === undefined) return '<span class="jb">null</span>';
  if (typeof v === 'number') return '<span class="jn">' + v + '</span>';
  if (typeof v === 'boolean') return '<span class="jb">' + v + '</span>';
  if (typeof v === 'string') return '<span class="js">"' + esc(v) + '"</span>';
  const keys = Object.keys(v);
  return '<span class="jp">{</span>\n' + keys.map(k => pad + '<span class="jk">"' + esc(k) + '"</span><span class="jp">:</span> ' + _jsonHtml(v[k], depth + 1)).join('<span class="jp">,</span>\n') + '\n' + end + '<span class="jp">}</span>';
}
function copySnapshot() {
  if (!_lastSnapshot) return;
  navigator.clipboard.writeText(JSON.stringify(_lastSnapshot, null, 2)).then(() => toast('Snapshot copied')).catch(() => toast('Could not copy', 'error'));
}