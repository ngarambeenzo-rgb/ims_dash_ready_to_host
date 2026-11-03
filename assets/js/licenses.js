/* IMS — licenses.js */
let _allLicenses = [];

async function loadLicenses() {
  const res = await apiGet('licenses', 'list');
  _allLicenses = res.data || [];
  renderLicenses('active');
}

function switchLicenseTab(tab, btn) {
  document.querySelectorAll('#page-licenses .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderLicenses(tab);
}

function renderLicenses(tab) {
  const filtered = tab === 'all' ? _allLicenses : _allLicenses.filter(l => l.status === tab);
  const tbody = document.getElementById('licensesTable');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No ${tab} licenses</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><strong>${esc(l.clientName)}</strong></td>
      <td><code style="font-size:10px;background:var(--card2);padding:2px 6px;border-radius:4px;color:var(--muted)">${esc((l.deviceUuid || 'All Devices').substring(0,14))}...</code></td>
      <td>${esc(l.planName)}</td>
      <td>${l.maxDevices}</td>
      <td style="color:var(--muted);font-size:11px">${fmtDateTime(l.issuedAt)}</td>
      <td style="color:var(--muted);font-size:11px">${fmtDateTime(l.expiresAt)}</td>
      <td>${statusBadge(l.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          ${l.status === 'active' ? `<button class="btn-icon" title="Revoke" onclick="revokeLicense(${l.id})">${ico('ban')}</button>` : ''}
          <button class="btn-icon" title="View token" onclick="viewLicenseToken(${l.id})">${ico('eye')}</button>
        </div>
      </td>
    </tr>`).join('');
}

function showGenerateLicense() {
  openModal('Generate License',
    `<div class="alert alert-blue"><div>
      Licenses are <strong>automatically generated</strong> when you record a payment or approve a device.<br><br>
      Use this only for manual issuance to a specific client.
    </div></div>
    <div class="form-group">
      <label class="form-label">Client *</label>
      <select class="form-input" id="lgClient"></select>
    </div>
    <div class="form-group">
      <label class="form-label">Duration (hours)</label>
      <input type="number" inputmode="numeric" class="form-input" id="lgDuration" value="24" min="1"/>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">License will be issued for all approved devices of this client</div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="generateLicenseManual()">Generate</button>`
  );
  // FIX: was loadClientOptions() defined locally here AND in payments.js — duplicate conflict.
  // Now uses shared helper from shared_helpers.js
  _loadClientSelectOptions('lgClient');
}

async function generateLicenseManual() {
  const data = {
    clientId:    document.getElementById('lgClient').value,
    durationHrs: parseInt(document.getElementById('lgDuration').value) || 24,
  };
  if (!data.clientId) { toast('Select a client', 'error'); return; }
  const res = await api('licenses', 'generate', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast(res.message || 'License generated');
  loadLicenses();
}

async function revokeLicense(id) {
  confirm2('Revoke this license? The device will lock on next check.', async () => {
    const res = await api('licenses', 'revoke', { id });
    if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
    toast('License revoked');
    loadLicenses();
  });
}

async function viewLicenseToken(id) {
  const res = await apiGet('licenses', 'view_token', { id });
  if (!res.ok) { toast('Could not load token', 'error'); return; }

  // FIX: was building copy button with onclick="...writeText('${token}')"
  // which breaks if token contains single quotes. Now uses data attribute.
  openModal('License Token — ' + esc(res.clientName),
    `<div style="background:var(--card2);border-radius:8px;padding:12px;font-family:monospace;font-size:10px;word-break:break-all;max-height:200px;overflow-y:auto;color:var(--green)">${esc(res.token)}</div>
    <p style="font-size:11px;color:var(--muted);margin-top:8px">This JWT token is signed with the IMS RSA private key. BarMS verifies it using the public key. It cannot be forged or modified.</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" id="copyTokenBtn" data-token="${esc(res.token)}" onclick="copyLicenseToken(this)">Copy</button>`
  );
}

function copyLicenseToken(btn) {
  const token = btn.getAttribute('data-token');
  navigator.clipboard.writeText(token).then(() => toast('Copied!')).catch(() => prompt('Copy token:', token));
}
