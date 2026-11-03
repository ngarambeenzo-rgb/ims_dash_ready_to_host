/* IMS — clients.js */
let _allClients = [];

async function loadClients() {
  const res = await apiGet('clients', 'list');
  _allClients = res.data || [];
  renderClients(_allClients);
}

function renderClients(clients) {
  const tbody = document.getElementById('clientsTable');
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">No clients yet. Select Add client to create the first one.</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => `
    <tr>
      <td><strong>${esc(c.businessName)}</strong><br><span class="td-muted">${esc(c.location || '')}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:5px">
          <span class="key-chip">${c.activation_key || c.activationKey || '—'}</span>
          <button class="copy-btn" title="Copy key" onclick="copyActivationKey(this,'${c.activation_key || c.activationKey || ''}')">${ico('copy')}</button>
        </div>
      </td>
      <td>${esc(c.contactPhone || '')}<br><span class="td-muted">${esc(c.contactEmail || '')}</span></td>
      <td>${esc(c.planName || '—')}</td>
      <td>${c.activeDevices || 0}/${c.maxDevices || 0}</td>
      <td>${fmtDate(c.expiryDate)}</td>
      <td>${c.lastSync ? fmtDateTime(c.lastSync) : '<span style="color:var(--muted)">Never</span>'}</td>
      <td>${statusBadge(c.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" title="Edit" onclick="showEditClient(${c.id})">${ico('edit')}</button>
          <button class="btn-icon" title="Renew" onclick="showRenewClient(${c.id})">${ico('refresh')}</button>
          <button class="btn-icon" title="Onboarding Card" onclick="showClientCard(${c.id})">${ico('card')}</button>
          <button class="btn-icon" title="${c.status === 'suspended' ? 'Activate' : 'Suspend'}" onclick="${c.status === 'suspended' ? 'activateClient' : 'suspendClient'}(${c.id})">${c.status === 'suspended' ? ico('play') : ico('ban')}</button>
        </div>
      </td>
    </tr>`).join('');
  // FIX: was setTimeout(fillKeyCells,50) at file load — now called after render
  fillKeyCells();
}

// After rendering, fill key cells safely
function fillKeyCells() {
  document.querySelectorAll('.td-key-cell').forEach(td => {
    const key = td.getAttribute('data-key') || '';
    td.innerHTML = '';
    if (key && key !== 'undefined') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px';
      const span = document.createElement('span');
      span.className = 'key-chip';
      span.textContent = key;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = ico('copy');
      btn.onclick = () => {
        navigator.clipboard.writeText(key).then(() => {
          btn.innerHTML = ico('check');
          setTimeout(() => btn.innerHTML = ico('copy'), 2000);
          if (typeof toast === 'function') toast('Copied: ' + key);
        }).catch(() => prompt('Copy this key:', key));
      };
      wrap.appendChild(span);
      wrap.appendChild(btn);
      td.appendChild(wrap);
    } else {
      td.textContent = '—';
      td.style.color = '#7B8CAA';
    }
  });
}

function filterClients(q) {
  const filtered = _allClients.filter(c =>
    c.businessName?.toLowerCase().includes(q.toLowerCase()) ||
    c.contactPhone?.toLowerCase().includes(q.toLowerCase()) ||
    c.contactEmail?.toLowerCase().includes(q.toLowerCase())
  );
  renderClients(filtered);
}

function filterClientsByStatus(status) {
  const filtered = status ? _allClients.filter(c => c.status === status) : _allClients;
  renderClients(filtered);
}

function showAddClient() {
  openModal('Add New Client',
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Business Name *</label><input type="text" class="form-input" id="cName" placeholder="Chez Patrick"/></div>
      <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-input" id="cLocation" placeholder="Kigali, Rwanda"/></div>
      <div class="form-group"><label class="form-label">Contact Phone</label><input type="tel" class="form-input" id="cPhone" placeholder="+250 7XX XXX XXX"/></div>
      <div class="form-group"><label class="form-label">Contact Email</label><input type="email" class="form-input" id="cEmail" placeholder="owner@bar.rw"/></div>
      <div class="form-group"><label class="form-label">Product *</label><select class="form-input" id="cProduct"></select></div>
      <div class="form-group"><label class="form-label">Subscription Plan *</label><select class="form-input" id="cPlan"></select></div>
      <div class="form-group"><label class="form-label">Max Devices *</label><input type="number" inputmode="numeric" class="form-input" id="cDevices" value="1" min="1"/></div>
      <div class="form-group"><label class="form-label">Subscription Start</label><input type="date" class="form-input" id="cStart" value="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    ${imsGeoFields('c', null)}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveNewClient()">Add Client</button>`
  );
  // FIX: was loadProductOptions/loadPlanOptions (duplicates) — now uses shared helpers
  _loadProductSelectOptions('cProduct');
  _loadPlanSelectOptions('cPlan');
  imsGeoInit('c', null, 'cLocation');
}

async function saveNewClient() {
  const data = {
    businessName: document.getElementById('cName').value.trim(),
    location:     document.getElementById('cLocation').value.trim(),
    contactPhone: document.getElementById('cPhone').value.trim(),
    contactEmail: document.getElementById('cEmail').value.trim(),
    productId:    document.getElementById('cProduct').value,
    planId:       document.getElementById('cPlan').value,
    maxDevices:   parseInt(document.getElementById('cDevices').value) || 1,
    startDate:    document.getElementById('cStart').value,
    ...imsGeoValues('c'),
  };
  if (!data.businessName || !data.productId || !data.planId) { toast('Fill required fields', 'error'); return; }
  const res = await api('clients', 'add', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Client added successfully!');
  loadClients();
}

async function showEditClient(id) {
  const client = _allClients.find(c => c.id === id);
  if (!client) return;
  openModal('Edit Client: ' + client.businessName,
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Business Name *</label><input type="text" class="form-input" id="ecName" value="${esc(client.businessName)}"/></div>
      <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-input" id="ecLocation" value="${esc(client.location || '')}"/></div>
      <div class="form-group"><label class="form-label">Contact Phone</label><input type="tel" class="form-input" id="ecPhone" value="${esc(client.contactPhone || '')}"/></div>
      <div class="form-group"><label class="form-label">Contact Email</label><input type="email" class="form-input" id="ecEmail" value="${esc(client.contactEmail || '')}"/></div>
      <div class="form-group"><label class="form-label">Max Devices</label><input type="number" inputmode="numeric" class="form-input" id="ecDevices" value="${client.maxDevices || 1}" min="1"/></div>
    </div>
    ${imsGeoFields('ec', client)}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveEditClient(${id})">Save Changes</button>`
  );
  imsGeoInit('ec', client, 'ecLocation');
}

async function saveEditClient(id) {
  const data = {
    id,
    businessName: document.getElementById('ecName').value.trim(),
    location:     document.getElementById('ecLocation').value.trim(),
    contactPhone: document.getElementById('ecPhone').value.trim(),
    contactEmail: document.getElementById('ecEmail').value.trim(),
    maxDevices:   parseInt(document.getElementById('ecDevices').value) || 1,
    ...imsGeoValues('ec'),
  };
  const res = await api('clients', 'edit', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Client updated');
  loadClients();
}
async function suspendClient(id) {
  const client = _allClients.find(c => c.id === id);
  const name = client?.businessName || '';
  openModal('Suspend Client',
    `<p style="font-size:14px;line-height:1.6">Suspend <strong>${esc(name)}</strong>?<br>Their BarMS app will lock immediately on next sync.</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-red" onclick="closeModal();doSuspendClient(${id})">Suspend</button>`
  );
}

async function doSuspendClient(id) {
  const res = await api('clients', 'suspend', { id });
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  toast('Client suspended — BarMS will lock immediately');
  loadClients();
}
async function activateClient(id) {
  const res = await api('clients', 'activate', { id });
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  toast('Client activated');
  loadClients();
}

async function showRenewClient(id) {
  showPage('payments');
}

function copyActivationKey(btn, key) {
  if (!key) return;
  navigator.clipboard.writeText(key).then(() => {
    btn.innerHTML = ico('check');
    setTimeout(() => btn.innerHTML = ico('copy'), 2000);
    toast('Key copied: ' + key);
  }).catch(() => prompt('Copy this key:', key));
}

function copyKey(key) {
  navigator.clipboard.writeText(key)
    .then(() => toast('Activation key copied!'))
    .catch(() => {
      const el = document.createElement('textarea');
      el.value = key;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      toast('Key copied');
    });
}

// ── CLIENT ONBOARDING CARD ────────────────────────────────────
function showOnboardingCard(client) {
  const cardHtml = `
    <div id="onboardingCard" style="
      background:#fff;color:#1a1a2e;
      border-radius:16px;padding:28px;
      max-width:480px;margin:0 auto;
      font-family:'DM Sans',Arial,sans-serif;
    ">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #eee">
        <div style="font-size:32px">🍺</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#1E3A8A">BarMS Pro</div>
          <div style="font-size:11px;color:#666">Client Activation Card</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:10px;color:#999">Date</div>
          <div style="font-size:12px;font-weight:600">${new Date().toLocaleDateString('en-RW',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Client Information</div>
        <div style="font-size:20px;font-weight:800;color:#1E3A8A;margin-bottom:4px">${esc(client.businessName)}</div>
        <div style="font-size:13px;color:#444">📍 ${esc(client.location || 'Rwanda')}</div>
        ${client.contactPhone ? `<div style="font-size:13px;color:#444">📞 ${esc(client.contactPhone)}</div>` : ''}
        ${client.contactEmail ? `<div style="font-size:13px;color:#444">📧 ${esc(client.contactEmail)}</div>` : ''}
      </div>
      <div style="background:#EFF6FF;border:2px dashed #2563EB;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center">
        <div style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">🔑 Activation Key</div>
        <div style="font-size:22px;font-weight:800;color:#1E3A8A;letter-spacing:.1em;font-family:monospace">${esc(client.activationKey || client.activation_key || '—')}</div>
        <div style="font-size:11px;color:#666;margin-top:6px">Enter this key on first launch to activate BarMS Pro</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:#F8F9FA;border-radius:10px;padding:12px">
          <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:4px">Username</div>
          <div style="font-size:16px;font-weight:700;color:#1a1a2e;font-family:monospace">owner</div>
        </div>
        <div style="background:#F8F9FA;border-radius:10px;padding:12px">
          <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:4px">Password</div>
          <div style="font-size:16px;font-weight:700;color:#1a1a2e;font-family:monospace">system123</div>
        </div>
      </div>
      <div style="background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:6px">📋 Subscription</div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>Plan: <strong>${esc(client.planName || '—')}</strong></span>
          <span>Devices: <strong>${client.maxDevices || 1}</strong></span>
        </div>
        ${client.expiryDate ? `<div style="font-size:12px;color:#444;margin-top:4px">Valid until: <strong>${new Date(client.expiryDate).toLocaleDateString('en-RW',{day:'2-digit',month:'long',year:'numeric'})}</strong></div>` : ''}
      </div>
      <div style="background:#FFFBEB;border-radius:10px;padding:12px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#D97706;text-transform:uppercase;margin-bottom:8px">🚀 How to Get Started</div>
        <ol style="margin:0;padding-left:16px;font-size:12px;color:#444;line-height:1.8">
          <li>Open your browser and go to your BarMS link</li>
          <li>Enter the <strong>Activation Key</strong> above</li>
          <li>Click <strong>Activate BarMS Pro</strong></li>
          <li>Login with username and password above</li>
          <li>Change your password in Settings</li>
        </ol>
      </div>
      <div style="text-align:center;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999">
        Need help? Contact IMS Company Support<br>
        <strong style="color:#1E3A8A">Powered by IMS — Instance Management System</strong>
      </div>
    </div>
  `;

  openModal('🎉 Client Activated — Onboarding Card', cardHtml,
    `<button class="btn btn-ghost" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" onclick="printOnboardingCard()">🖨️ Print Card</button>`
  );
}

function printOnboardingCard() {
  const card = document.getElementById('onboardingCard');
  if (!card) return;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>BarMS Onboarding Card</title>
    <style>body{margin:20px;font-family:'DM Sans',Arial,sans-serif}@media print{body{margin:0}button{display:none}}</style>
    </head><body>${card.outerHTML}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
  win.document.close();
}

// FIX: was fetching full client list again just to find one client.
// Now uses _allClients which is already loaded, with a fallback fetch only if needed.
async function showClientCard(id) {
  let client = _allClients.find(c => c.id === id);
  if (!client) {
    const res = await apiGet('clients', 'list');
    client = (res.data || []).find(c => c.id === id);
  }
  if (!client) { toast('Client not found', 'error'); return; }

  // Get active subscription info
  const subRes = await apiGet('subscriptions', 'list');
  const sub = (subRes.data || []).find(s => s.clientId === id && s.status === 'active');
  if (sub) {
    client.planName   = sub.planName;
    client.maxDevices = sub.maxDevices;
    client.expiryDate = sub.expiryDate;
  }

  showOnboardingCard(client);
}
