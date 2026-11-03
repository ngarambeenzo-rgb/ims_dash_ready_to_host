/* ═══════════════════════════════════════════════════
   IMS — reports.js
   Full analytics and reporting
═══════════════════════════════════════════════════ */

let _rptData         = null;
let _rptRevenueChart = null;
let _rptPlanChart    = null;
let _rptStatusChart  = null;
let _rptPMChart      = null;
let _rptSyncChart    = null;
let _rptChartType    = 'bar';
let _rptAllPayments  = [];
let _rptPage         = 1;
const RPT_PAGE_SIZE  = 15;

// ── LOAD REPORTS ──────────────────────────────────
async function loadReports() {
  const period = document.getElementById('reportPeriod')?.value || 'this_month';

  // Show loading
  ['rptTotalRevenue','rptActiveSubs','rptNewClients','rptAvgRevenue'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '...';
  });

  const res = await apiGet('reports', 'summary', { period });
  if (!res.ok) { toast('Could not load reports', 'error'); return; }

  _rptData        = res;
  _rptAllPayments = res.payments || [];
  _rptPage        = 1;

  renderKPIs(res);
  renderRevenueChart(res);
  renderPlanChart(res);
  renderStatusChart(res);
  renderPaymentMethodChart(res);
  renderExpiringSoon(res.expiringSoon || []);
  renderTopClients(res.topClients || []);
  renderMonthlySummary(res.monthlySummary || []);
  renderPaymentsTable(_rptAllPayments);
  renderSyncChart(res.syncActivity || []);
}

// ── KPIs ──────────────────────────────────────────
function renderKPIs(d) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('rptTotalRevenue', fmtRWF(d.totalRevenue || 0));
  set('rptActiveSubs',   d.activeSubs || 0);
  set('rptNewClients',   d.newClients || 0);
  set('rptAvgRevenue',   fmtRWF(d.avgRevenue || 0));

  // Revenue change vs previous period
  const revChange = d.prevRevenue > 0
    ? Math.round(((d.totalRevenue - d.prevRevenue) / d.prevRevenue) * 100)
    : null;

  if (revChange !== null) {
    const revEl = document.getElementById('rptRevChange');
    if (revEl) {
      revEl.textContent = (revChange >= 0 ? '▲ +' : '▼ ') + revChange + '% vs prev period';
      revEl.style.color = revChange >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  // New clients change
  const cliChange = d.prevNewClients > 0
    ? Math.round(((d.newClients - d.prevNewClients) / d.prevNewClients) * 100)
    : null;

  if (cliChange !== null) {
    const cliEl = document.getElementById('rptClientChange');
    if (cliEl) {
      cliEl.textContent = (cliChange >= 0 ? '▲ +' : '▼ ') + cliChange + '% vs prev period';
      cliEl.style.color = cliChange >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  const subEl = document.getElementById('rptSubChange');
  if (subEl) {
    const total = d.totalClients || 0;
    const rate  = total > 0 ? Math.round((d.activeSubs / total) * 100) : 0;
    subEl.textContent = rate + '% of total clients';
    subEl.style.color = 'var(--muted)';
  }

  const churnEl = document.getElementById('rptChurnRate');
  if (churnEl) {
    const total   = d.totalClients || 1;
    const expired = d.expiredClients || 0;
    churnEl.textContent = 'Churn: ' + Math.round((expired / total) * 100) + '%';
    churnEl.style.color = 'var(--muted)';
  }
}

// ── REVENUE CHART ──────────────────────────────────
function renderRevenueChart(d) {
  const ctx = document.getElementById('rptRevenueChart');
  if (!ctx) return;
  if (_rptRevenueChart) { _rptRevenueChart.destroy(); _rptRevenueChart = null; }

  // Use monthly or daily based on period
  const period = document.getElementById('reportPeriod')?.value || 'this_month';
  const useMontly = ['last_6months','this_year','all_time'].includes(period);

  const items  = useMontly ? (d.revenueByMonth || []) : (d.revenueByDay || []);
  const labels = items.map(r => useMontly ? r.label : r.day);
  const values = items.map(r => r.amount);

  _rptRevenueChart = new Chart(ctx, {
    type: _rptChartType,
    data: {
      labels,
      datasets: [{
        label: 'Revenue (RWF)',
        data: values,
        backgroundColor: _rptChartType === 'bar'
          ? 'rgba(0,208,132,0.3)'
          : 'rgba(0,208,132,0.1)',
        borderColor: '#00D084',
        borderWidth: 2,
        borderRadius: _rptChartType === 'bar' ? 6 : 0,
        fill: _rptChartType === 'line',
        tension: 0.4,
        pointBackgroundColor: '#00D084',
        pointRadius: _rptChartType === 'line' ? 4 : 0,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => 'RWF ' + ctx.raw.toLocaleString()
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: '#9da1a6', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: '#9da1a6', font: { size: 10 }, callback: v => 'RWF ' + (v/1000).toFixed(0) + 'k' } },
      }
    }
  });
}

function toggleRevenueChart(type, btn) {
  _rptChartType = type;
  document.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (_rptData) renderRevenueChart(_rptData);
}

// ── PLAN BREAKDOWN CHART ──────────────────────────
function renderPlanChart(d) {
  const ctx = document.getElementById('rptPlanChart');
  if (!ctx) return;
  if (_rptPlanChart) { _rptPlanChart.destroy(); _rptPlanChart = null; }

  const plans  = d.planBreakdown || [];
  const labels = plans.map(p => p.planName);
  const values = plans.map(p => p.clientCount);
  const colors = ['#4D9EFF','#00D084','#A855F7','#FF8C42','#FF4D6D'];

  _rptPlanChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, plans.length),
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: { legend: { display: false } }
    }
  });

  // Legend
  const legend = document.getElementById('rptPlanLegend');
  if (legend) {
    legend.innerHTML = plans.map((p, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></div>
          <span style="color:var(--text)">${esc(p.planName)}</span>
        </div>
        <div style="color:var(--muted)">${p.clientCount} clients</div>
      </div>
    `).join('');
  }
}

// ── CLIENT STATUS CHART ───────────────────────────
function renderStatusChart(d) {
  const ctx = document.getElementById('rptStatusChart');
  if (!ctx) return;
  if (_rptStatusChart) { _rptStatusChart.destroy(); _rptStatusChart = null; }

  const statuses = [
    { label: 'Active',    count: d.activeClients  || 0, color: '#00D084' },
    { label: 'Trial',     count: d.trialClients   || 0, color: '#4D9EFF' },
    { label: 'Expired',   count: d.expiredClients || 0, color: '#FF4D6D' },
    { label: 'Suspended', count: d.suspClients    || 0, color: '#9da1a6' },
  ].filter(s => s.count > 0);

  _rptStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   statuses.map(s => s.label),
      datasets: [{ data: statuses.map(s => s.count), backgroundColor: statuses.map(s => s.color), borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2 }]
    },
    options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } }
  });

  const el = document.getElementById('rptStatusBreakdown');
  if (el) {
    el.innerHTML = statuses.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
          <span style="color:var(--text)">${s.label}</span>
        </div>
        <strong style="color:var(--text)">${s.count}</strong>
      </div>
    `).join('');
  }
}

// ── PAYMENT METHODS CHART ─────────────────────────
function renderPaymentMethodChart(d) {
  const ctx = document.getElementById('rptPaymentMethodChart');
  if (!ctx) return;
  if (_rptPMChart) { _rptPMChart.destroy(); _rptPMChart = null; }

  const methods = d.paymentMethods || [];
  const colors  = ['#A855F7','#FF8C42','#4D9EFF','#00D084','#FF4D6D'];

  if (!methods.length) {
    ctx.parentElement.innerHTML += '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">No payments in this period</div>';
    return;
  }

  _rptPMChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   methods.map(m => m.method || 'Unknown'),
      datasets: [{ data: methods.map(m => m.total), backgroundColor: colors.slice(0, methods.length), borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2 }]
    },
    options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } }
  });

  const el = document.getElementById('rptPaymentMethodList');
  if (el) {
    el.innerHTML = methods.map((m, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></div>
          <span style="color:var(--text)">${esc(m.method || 'Unknown')}</span>
        </div>
        <div style="text-align:right">
          <div style="color:var(--text);font-weight:600">RWF ${m.total.toLocaleString()}</div>
          <div style="color:var(--muted);font-size:10px">${m.count} payment${m.count !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('');
  }
}

// ── EXPIRING SOON ─────────────────────────────────
function renderExpiringSoon(expiring) {
  const el = document.getElementById('rptExpiringSoon');
  if (!el) return;

  if (!expiring.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)"><div style="font-size:24px"></div><p style="margin-top:8px;font-size:12px">No expiries in next 30 days</p></div>';
    return;
  }

  el.innerHTML = expiring.slice(0, 6).map(e => {
    const color = e.daysLeft <= 5 ? '#FF4D6D' : e.daysLeft <= 14 ? '#FF8C42' : '#4D9EFF';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--card2);border-radius:8px;border-left:3px solid ${color}">
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.businessName)}</div>
        <div style="font-size:10px;color:var(--muted)">${esc(e.planName)} · ${e.phone || '—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:8px">
        <div style="font-size:13px;font-weight:800;color:${color}">${e.daysLeft}d</div>
        <div style="font-size:9px;color:var(--muted)">${e.expiry_date}</div>
      </div>
    </div>`;
  }).join('');
}

// ── TOP CLIENTS ───────────────────────────────────
function renderTopClients(clients) {
  const el = document.getElementById('rptTopClients');
  if (!el) return;

  if (!clients.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">No payment data for this period</div>';
    return;
  }

  const maxRevenue = Math.max(...clients.map(c => c.totalPaid));

  el.innerHTML = clients.map((c, i) => {
    const pct   = maxRevenue > 0 ? Math.round((c.totalPaid / maxRevenue) * 100) : 0;
    const color = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#4D9EFF';
    const medal = (i + 1) + '.';

    return `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-size:14px;width:24px;text-align:center;flex-shrink:0">${medal}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.businessName)}</span>
          <span style="font-size:12px;font-weight:700;color:${color};flex-shrink:0;margin-left:8px">RWF ${c.totalPaid.toLocaleString()}</span>
        </div>
        <div style="background:var(--border);border-radius:20px;height:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:20px;transition:width .5s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${c.paymentCount} payment${c.paymentCount !== 1 ? 's' : ''} · Last: ${c.lastPayment}</div>
      </div>
    </div>`;
  }).join('');
}

// ── MONTHLY SUMMARY ───────────────────────────────
function renderMonthlySummary(summary) {
  const el = document.getElementById('rptMonthlySummary');
  if (!el) return;

  if (!summary.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">No data available</div>';
    return;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:6px 8px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border)">
      <span>Month</span><span style="text-align:right">Revenue</span><span style="text-align:right">Payments</span><span style="text-align:right">Clients</span>
    </div>
    ${summary.map((m, i) => `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:7px 8px;font-size:12px;background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)'};border-radius:4px">
      <span style="color:var(--text);font-weight:600">${esc(m.label)}</span>
      <span style="text-align:right;color:#00D084;font-weight:700">RWF ${(m.revenue/1000).toFixed(0)}k</span>
      <span style="text-align:right;color:var(--muted)">${m.payments}</span>
      <span style="text-align:right;color:var(--muted)">${m.clients}</span>
    </div>
    `).join('')}
  `;
}

// ── PAYMENTS TABLE ────────────────────────────────
function renderPaymentsTable(payments) {
  const tbody = document.getElementById('rptPaymentsBody');
  if (!tbody) return;

  const start = (_rptPage - 1) * RPT_PAGE_SIZE;
  const page  = payments.slice(start, start + RPT_PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">No payments in this period</td></tr>';
    renderPagination(payments.length);
    return;
  }

  tbody.innerHTML = page.map(p => `
    <tr>
      <td>${esc(p.date)}</td>
      <td><strong>${esc(p.clientName)}</strong></td>
      <td><span class="badge badge-blue">${esc(p.planName)}</span></td>
      <td style="font-size:11px;color:var(--muted)">${esc(p.periodStart)} → ${esc(p.periodEnd)}</td>
      <td style="text-align:center">${p.maxDevices}</td>
      <td>${esc(p.method || '—')}</td>
      <td><strong style="color:#00D084">RWF ${p.amount.toLocaleString()}</strong></td>
      <td style="font-size:11px;color:var(--muted)">${esc(p.recordedBy)}</td>
    </tr>
  `).join('');

  renderPagination(payments.length);
}

function renderPagination(total) {
  const el    = document.getElementById('rptPaymentsPagination');
  if (!el) return;
  const pages = Math.ceil(total / RPT_PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ''; return; }

  el.innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(p => `
    <button onclick="rptGoPage(${p})" style="
      background:${p === _rptPage ? 'var(--blue)' : 'var(--card2)'};
      color:${p === _rptPage ? '#fff' : 'var(--muted)'};
      border:1px solid ${p === _rptPage ? 'var(--blue)' : 'var(--border)'};
      border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit
    ">${p}</button>
  `).join('');
}

function rptGoPage(p) {
  _rptPage = p;
  renderPaymentsTable(_rptAllPayments);
}

function filterRptPayments(q) {
  if (!q) { renderPaymentsTable(_rptAllPayments); return; }
  const lq = q.toLowerCase();
  const filtered = _rptAllPayments.filter(p =>
    p.clientName?.toLowerCase().includes(lq) ||
    p.planName?.toLowerCase().includes(lq) ||
    p.method?.toLowerCase().includes(lq) ||
    p.recordedBy?.toLowerCase().includes(lq)
  );
  _rptPage = 1;
  renderPaymentsTable(filtered);
}

// ── SYNC ACTIVITY CHART ────────────────────────────
function renderSyncChart(activity) {
  const ctx = document.getElementById('rptSyncChart');
  if (!ctx) return;
  if (_rptSyncChart) { _rptSyncChart.destroy(); _rptSyncChart = null; }

  const labels = activity.map(r => r.day);
  const values = activity.map(r => r.syncs);

  _rptSyncChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Syncs',
        data: values,
        backgroundColor: 'rgba(77,158,255,0.3)',
        borderColor: '#4D9EFF',
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9da1a6', font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9da1a6', font: { size: 10 } }, beginAtZero: true },
      }
    }
  });
}

// ── EXPORT ────────────────────────────────────────
function exportReports() {
  if (!_rptAllPayments.length) { toast('No data to export', 'error'); return; }

  const rows = [
    ['Date','Client','Plan','Period Start','Period End','Devices','Method','Amount (RWF)','Recorded By'],
    ..._rptAllPayments.map(p => [
      p.date, p.clientName, p.planName, p.periodStart, p.periodEnd,
      p.maxDevices, p.method, p.amount, p.recordedBy
    ])
  ];

  const csv     = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = 'IMS_Reports_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('Report exported');
}
