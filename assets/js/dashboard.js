/* IMS — dashboard.js */
let _donutChart = null;
let _revenueChart = null;
let _deviceDonut = null;

async function loadDashboard() {
  const res = await apiGet('misc', 'dashboard');
  if (!res.ok) return;
  const d = res.data || {};

  // KPIs
  document.getElementById('kpiTotalClients').textContent  = d.totalClients ?? '0';
  document.getElementById('kpiActiveClients').textContent = d.activeClients ?? '0';
  document.getElementById('kpiDevices').textContent       = d.totalDevices ?? '0';
  document.getElementById('kpiRevenue').textContent       = fmtRWF(d.monthRevenue || 0);

  const badge = document.getElementById('pendingDevicesBadge');
  if (badge && d.pendingDevices > 0) { badge.textContent = d.pendingDevices; badge.style.display = 'inline-block'; }

  renderDonutChart(d);
  // Render chart and force resize to ensure it appears
  setTimeout(() => {
    renderRevenueChart(d.revenueByDay || []);
    setTimeout(() => {
      if (_revenueChart) _revenueChart.resize();
    }, 200);
  }, 150);
  renderDeviceDonut(d);

  document.getElementById('mapActiveCount').textContent  = d.activeClients || 0;
  document.getElementById('mapTrialCount').textContent   = d.trialClients || 0;
  document.getElementById('mapExpiredCount').textContent = d.expiredClients || 0;

  renderRecentSubs(d.recentSubs || []);
  renderDashPayments(d.recentPayments || []);
  renderDashAlerts(d.alerts || []);
  renderDashProducts(d.products || []);
  renderDashActivity(d.recentActivity || []);

  setTimeout(() => initDashMap(d.clientsForMap || []), 400);
}

function renderDonutChart(d) {
  const trial   = d.trialClients || 0;
  const monthly = d.monthlyClients || 0;
  const annual  = d.annualClients || 0;
  const expired = d.expiredClients || 0;
  const total   = trial + monthly + annual + expired;

  document.getElementById('donutTotal').textContent   = d.activeClients || 0;
  document.getElementById('dlTrial').textContent      = trial;
  document.getElementById('dlMonthly').textContent    = monthly;
  document.getElementById('dlAnnual').textContent     = annual;
  document.getElementById('dlExpired').textContent    = expired;
  const pct = n => total ? Math.round(n/total*100) + '%' : '0%';
  document.getElementById('dpTrial').textContent      = '(' + pct(trial) + ')';
  document.getElementById('dpMonthly').textContent    = '(' + pct(monthly) + ')';
  document.getElementById('dpAnnual').textContent     = '(' + pct(annual) + ')';
  document.getElementById('dpExpired').textContent    = '(' + pct(expired) + ')';

  const ctx = document.getElementById('donutChart');
  if (!ctx) return;
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }

  const hasData = (trial + monthly + annual + expired) > 0;
  _donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Trial', 'Monthly', 'Annual', 'Expired'],
      datasets: [{
        data: hasData ? [trial||0, monthly||0, annual||0, expired||0] : [1,1,1,1],
        backgroundColor: hasData ? ['#4D9EFF','#00D084','#F59E0B','#FF4D6D'] : ['#1F2D45','#1F2D45','#1F2D45','#1F2D45'],
        borderWidth: 2,
        borderColor: '#111827',
        hoverOffset: 4,
      }]
    },
    options: {
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: hasData } },
      responsive: false,
      animation: { duration: 800 }
    }
  });
}

function renderDeviceDonut(d) {
  const active  = d.totalDevices || 0;
  const pending = d.pendingDevices || 0;
  const blocked = d.blockedDevices || 0;
  const total   = active + pending + blocked;

  document.getElementById('deviceDonutTotal').textContent = total;
  document.getElementById('devActive').textContent  = active;
  document.getElementById('devPending').textContent = pending;
  document.getElementById('devBlocked').textContent = blocked;

  const ctx = document.getElementById('deviceDonut');
  if (!ctx) return;
  if (_deviceDonut) { _deviceDonut.destroy(); _deviceDonut = null; }

  const hasData = total > 0;
  _deviceDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active','Pending','Blocked'],
      datasets: [{
        data: hasData ? [active||0, pending||0, blocked||0] : [1,1,1],
        backgroundColor: hasData ? ['#00D084','#FF8C42','#FF4D6D'] : ['#1F2D45','#1F2D45','#1F2D45'],
        borderWidth: 2, borderColor: '#111827',
      }]
    },
    options: {
      cutout: '70%',
      plugins: { legend: { display: false } },
      responsive: false,
      animation: { duration: 800 }
    }
  });
}

function renderRevenueChart(days) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (_revenueChart) { _revenueChart.destroy(); _revenueChart = null; }

  const today = new Date();
  const last30 = Array.from({length:30}, (_,i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });

  const dayMap = {};
  (days || []).forEach(d => { dayMap[d.day] = d.amount; });
  const labels = last30.map(d => d.substring(5));
  const data   = last30.map(d => dayMap[d] || 0);

  _revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (RWF)',
        data,
        backgroundColor: 'rgba(77,158,255,0.5)',
        borderColor: '#4D9EFF',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => 'RWF ' + ctx.parsed.y.toLocaleString()
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#7B8CAA', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#7B8CAA', font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

function renderRecentSubs(subs) {
  const tbody = document.getElementById('dashRecentSubs');
  if (!subs.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No subscriptions yet</td></tr>'; return; }
  tbody.innerHTML = subs.slice(0,6).map(s => `
    <tr onclick="showPage('subscriptions')" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="client-avatar">${esc((s.clientName||'??').substring(0,2).toUpperCase())}</div>
        <span class="td-primary">${esc(s.clientName)}</span>
      </div></td>
      <td>${esc(s.planName || '—')}</td>
      <td>${s.maxDevices || 0}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="td-muted">${fmtDate(s.expiryDate)}</td>
      <td class="text-green fw-700">${fmtRWF(s.planPrice || 0)}</td>
      <td><button class="btn-icon" style="width:24px;height:24px;font-size:12px" onclick="event.stopPropagation()">⋮</button></td>
    </tr>`).join('');
}

function renderDashPayments(payments) {
  const tbody = document.getElementById('dashRecentPayments');
  if (!payments.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No payments yet</td></tr>'; return; }
  tbody.innerHTML = payments.slice(0,5).map(p => `
    <tr onclick="showPage('payments')" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="client-avatar" style="width:24px;height:24px;font-size:9px">${esc((p.clientName||'??').substring(0,2).toUpperCase())}</div>
        <span class="td-primary">${esc(p.clientName)}</span>
      </div></td>
      <td class="td-muted">${esc(p.paymentMethod || 'Cash')}</td>
      <td class="text-green fw-700">${fmtRWF(p.amount)}</td>
      <td class="td-muted">${fmtDate(p.createdAt)}</td>
      <td><span class="badge badge-green">✓ Confirmed</span></td>
    </tr>`).join('');
}

function renderDashAlerts(alerts) {
  const el = document.getElementById('dashAlerts');
  if (!alerts.length) { el.innerHTML = '<div class="empty-state" style="padding:16px"><div class="icon" style="font-size:24px">✅</div><p>No alerts</p></div>'; return; }
  const colors = { danger:'red', warning:'orange', info:'blue' };
  el.innerHTML = alerts.slice(0,4).map(a => `
    <div class="alert-item">
      <div class="alert-icon ${colors[a.type]||'blue'}">${a.icon||'ℹ️'}</div>
      <div style="flex:1">
        <div class="alert-title">${esc(a.title)}</div>
        <div class="alert-time">${esc(a.message)}</div>
      </div>
    </div>`).join('');
}

function renderDashProducts(products) {
  const el = document.getElementById('dashProducts');
  if (!products.length) { el.innerHTML = '<div class="empty-state" style="padding:16px"><div class="icon" style="font-size:24px">📦</div><p>No products</p></div>'; return; }
  el.innerHTML = products.slice(0,4).map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">${esc(p.icon||'📦')}</span>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(p.name)}</div>
          <div style="font-size:10px;color:var(--muted)">v${esc(p.currentVersion||'1.0.0')} · ${fmtDate(p.updatedAt)}</div>
        </div>
      </div>
      <span class="badge badge-green" style="font-size:9px">● Published</span>
    </div>`).join('');
}

function renderDashActivity(activity) {
  const el = document.getElementById('dashActivity');
  if (!activity.length) { el.innerHTML = '<div class="empty-state" style="padding:16px"><div class="icon" style="font-size:24px">📝</div><p>No activity yet</p></div>'; return; }
  el.innerHTML = activity.slice(0,5).map(a => `
    <div class="activity-item">
      <div class="activity-avatar">${esc((a.doneBy||'SY').substring(0,2).toUpperCase())}</div>
      <div style="flex:1">
        <div class="activity-text"><strong>${esc(a.doneBy)}</strong> — ${esc(a.details)}</div>
        <div class="activity-time">${fmtDateTime(a.createdAt)}</div>
      </div>
    </div>`).join('');
}
