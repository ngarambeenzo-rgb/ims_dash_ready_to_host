/* IMS — devices.js */
let _allDevices = [];
let _deviceTab = 'pending';

async function loadDevices() {
  const res = await apiGet('devices', 'list');
  _allDevices = res.data || [];
  renderDevices(_deviceTab);
  const pending = _allDevices.filter(d => d.status === 'pending').length;
  document.getElementById('pendingCount').textContent = pending;
  const badge = document.getElementById('pendingDevicesBadge');
  if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-block' : 'none'; }
}

function switchDeviceTab(tab, btn) {
  _deviceTab = tab;
  document.querySelectorAll('#page-devices .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderDevices(tab);
}

function renderDevices(tab) {
  const filtered = tab === 'all' ? _allDevices : _allDevices.filter(d => d.status === tab);
  const tbody = document.getElementById('devicesTable');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">${({pending:'No devices are waiting. A new phone or PC appears here when a client signs in on it.',approved:'No approved devices yet.',blocked:'No blocked devices.',all:'No devices yet.'})[tab] || 'No devices.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(d => `
    <tr>
      <td><code class="key-chip">${esc((d.deviceUuid || '').substring(0,12))}...</code></td>
      <td><strong>${esc(d.clientName)}</strong></td>
      <td>${esc(imsDeviceLabel(d))}<br><span style="font-size:11px;color:var(--muted)">${esc(d.os || '')} ${esc(d.browser || '')}</span></td>
      <td>${fmtDate(d.firstSeen)}</td>
      <td>${d.lastSync ? fmtDateTime(d.lastSync) : '<span style="color:var(--muted)">Never</span>'}</td>
      <td>${statusBadge(d.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          ${d.status === 'pending' ? `<button class="btn btn-green btn-sm" onclick="approveDevice(${d.id})">Approve</button>` : ''}
          ${d.status === 'approved' ? `<button class="btn btn-ghost btn-sm" onclick="blockDevice(${d.id})">Block</button>` : ''}
          ${d.status === 'blocked' ? `<button class="btn btn-green btn-sm" onclick="approveDevice(${d.id})">Unblock</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

function filterDevices(q) {
  const filtered = _allDevices.filter(d =>
    d.clientName?.toLowerCase().includes(q.toLowerCase()) ||
    d.deviceUuid?.toLowerCase().includes(q.toLowerCase()) ||
    d.deviceName?.toLowerCase().includes(q.toLowerCase())
  );
  renderDevices('all');
  const tbody = document.getElementById('devicesTable');
  tbody.innerHTML = filtered.length ? filtered.map(d => `
    <tr>
      <td><code class="key-chip">${esc((d.deviceUuid||'').substring(0,12))}...</code></td>
      <td><strong>${esc(d.clientName)}</strong></td>
      <td>${esc(d.deviceName || 'Unknown')}</td>
      <td>${fmtDate(d.firstSeen)}</td>
      <td>${d.lastSync ? fmtDateTime(d.lastSync) : 'Never'}</td>
      <td>${statusBadge(d.status)}</td>
      <td></td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No results</td></tr>';
}

async function approveDevice(id) {
  const res = await api('devices', 'approve', { id });
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  toast('Device approved');
  loadDevices();
}

async function blockDevice(id) {
  confirm2('Block this device? It will be locked immediately on next sync.', async () => {
    const res = await api('devices', 'block', { id });
    if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
    toast('Device blocked');
    loadDevices();
  });
}
