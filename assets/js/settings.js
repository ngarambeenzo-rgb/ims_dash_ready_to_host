/* IMS — settings.js */
async function loadSettings() {
  loadAdmins();
  loadSettingsPlans();
  checkKeyStatus();
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('#page-settings .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['settingsAdmins','settingsPlans','settingsKeys','settingsSystem','settingsEmail'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  const map = { admins:'settingsAdmins', plans:'settingsPlans', keys:'settingsKeys', system:'settingsSystem', email:'settingsEmail' };
  if (tab === 'email') loadEmailSettings();
  document.getElementById(map[tab]).style.display = 'block';
}

async function loadAdmins() {
  const res = await apiGet('settings', 'admins');
  const tbody = document.getElementById('adminsTable');
  const admins = res.data || [];
  tbody.innerHTML = admins.length ? admins.map(a => `
    <tr>
      <td><strong>${esc(a.fullName)}</strong></td>
      <td>${esc(a.username)}</td>
      <td>${a.lastLogin ? fmtDateTime(a.lastLogin) : 'Never'}</td>
      <td>${statusBadge(a.active ? 'active' : 'suspended')}</td>
      <td><button class="btn-icon" onclick="editAdmin(${a.id})">${ico('edit')}</button></td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No admins</td></tr>';
}

async function loadSettingsPlans() {
  const res = await apiGet('subscriptions', 'plans');
  const tbody = document.getElementById('settingsPlansTable');
  const plans = res.data || [];
  tbody.innerHTML = plans.length ? plans.map(p => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.durationDays} days</td>
      <td>${fmtRWF(p.priceRwf)}</td>
      <td>${p.clientCount || 0}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" onclick="editPlan(${p.id})">${ico('edit')}</button>
          <button class="btn-icon" onclick="deletePlan(${p.id})">${ico('trash')}</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No plans yet</td></tr>';
}

async function checkKeyStatus() {
  const res = await apiGet('settings', 'key_status');
  const el = document.getElementById('keyStatus');
  if (!el) return;
  if (!res.opensslAvailable) {
    el.innerHTML = '<div class="alert alert-red"><span>warning</span><div><strong>OpenSSL not enabled.</strong> Open php.ini in XAMPP, find extension=openssl (commented with semicolon), remove the semicolon, save and restart Apache.</div></div>';
    return;
  }
  if (res.hasKeys) {
    el.innerHTML = '<div class="alert alert-green"><span>ok</span><div>RSA key pair configured. Generated: ' + fmtDate(res.generatedAt) + '</div></div>';
  } else {
    el.innerHTML = '<div class="alert alert-red"><span>warning</span><div><strong>No RSA keys found!</strong> Click Generate to create signing keys.</div></div>';
  }
}

function showAddAdmin() {
  openModal('Add Admin Account',
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-input" id="adName" placeholder="Jean Baptiste"/></div>
      <div class="form-group"><label class="form-label">Username *</label><input type="text" class="form-input" id="adUsername" placeholder="jbaptiste"/></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Password *</label><input type="password" class="form-input" id="adPwd" placeholder="••••••••"/></div>
      <div class="form-group"><label class="form-label">Confirm Password *</label><input type="password" class="form-input" id="adConfPwd" placeholder="••••••••"/></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveNewAdmin()">Add Admin</button>`
  );
}

async function saveNewAdmin() {
  const pwd = document.getElementById('adPwd').value;
  const conf = document.getElementById('adConfPwd').value;
  if (pwd !== conf) { toast('Passwords do not match', 'error'); return; }
  const data = {
    fullName: document.getElementById('adName').value.trim(),
    username: document.getElementById('adUsername').value.trim(),
    password: pwd,
  };
  if (!data.fullName || !data.username || !data.password) { toast('Fill all fields', 'error'); return; }
  const res = await api('settings', 'add_admin', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Admin added');
  loadAdmins();
}

async function generateKeys() {
  confirm2('Generate new RSA key pair? This will invalidate ALL existing licenses. Only do this for initial setup.', async () => {
    const res = await api('settings', 'generate_keys', {});
    if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
    toast('RSA keys generated successfully');
    checkKeyStatus();
  });
}

async function viewPublicKey() {
  const res = await apiGet('settings', 'public_key');
  if (!res.ok) { toast('No keys generated yet', 'error'); return; }
  openModal('IMS Public Key',
    `<p style="font-size:12px;color:var(--muted);margin-bottom:8px">Embed this in all BarMS installations to verify licenses.</p>
    <div style="background:var(--card2);border-radius:8px;padding:12px;font-family:monospace;font-size:10px;word-break:break-all;max-height:250px;overflow-y:auto;white-space:pre-wrap">${esc(res.publicKey)}</div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" onclick="downloadPublicKey()">Download</button>`
  );
}

async function downloadPublicKey() {
  const res = await apiGet('settings', 'public_key');
  if (!res.ok) { toast('No keys yet', 'error'); return; }
  const blob = new Blob([res.publicKey], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ims_public_key.pem';
  a.click();
}

async function saveSystemSettings() {
  const data = {
    companyName:      document.getElementById('sysCompany').value.trim(),
    systemName:       document.getElementById('sysName').value.trim(),
    licenseDuration:  parseInt(document.getElementById('sysLicenseDuration').value) || 24,
    gracePeriod:      parseInt(document.getElementById('sysGracePeriod').value) || 17,
    mapsKey:          document.getElementById('sysMapsKey').value.trim(),
  };
  const res = await api('settings', 'save_system', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  toast('Settings saved');
}

async function filterLogs(q) { loadAuditLog(q); }
async function filterLogsByType(type) { loadAuditLog('', type); }

async function loadAuditLog(search = '', type = '') {
  const res = await apiGet('misc', 'audit_log', { search, type });
  const tbody = document.getElementById('auditTable');
  const logs = res.data || [];
  tbody.innerHTML = logs.length ? logs.map(l => `
    <tr>
      <td><span class="badge badge-${l.actionType?.includes('BLOCK') || l.actionType?.includes('SUSPEND') ? 'red' : l.actionType?.includes('ADD') || l.actionType?.includes('APPROV') ? 'green' : 'blue'}">${esc(l.actionType)}</span></td>
      <td>${esc(l.details)}</td>
      <td>${esc(l.doneBy)}</td>
      <td>${fmtDateTime(l.createdAt)}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:32px">No logs found</td></tr>';
}

function editAdmin(id) { toast('Edit admin — coming soon', 'info'); }
function editPlan(id) {
  const res = apiGet('subscriptions', 'plans').then(res => {
    const plan = (res.data||[]).find(p => p.id == id);
    if (!plan) return;
    openModal('Edit Plan: ' + plan.name,
      `<div class="form-group"><label class="form-label">Plan Name *</label><input type="text" class="form-input" id="epName" value="${esc(plan.name)}"/></div>
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">Duration (days)</label><input type="number" inputmode="numeric" class="form-input" id="epDays" value="${plan.durationDays}"/></div>
        <div class="form-group"><label class="form-label">Price (RWF)</label><input type="number" inputmode="numeric" class="form-input" id="epPrice" value="${plan.priceRwf}"/></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="saveEditPlan(${id})">Save</button>`
    );
  });
}

async function saveEditPlan(id) {
  const data = {
    id,
    name: document.getElementById('epName').value.trim(),
    durationDays: parseInt(document.getElementById('epDays').value),
    priceRwf: parseFloat(document.getElementById('epPrice').value),
  };
  const res = await api('subscriptions', 'edit_plan', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Plan updated');
  loadSettingsPlans();
}

async function deletePlan(id) {
  confirm2('Delete this plan? Clients using it will not be affected.', async () => {
    const res = await api('subscriptions', 'delete_plan', { id });
    if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
    toast('Plan deleted');
    loadSettingsPlans();
  });
}
