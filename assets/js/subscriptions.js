/* IMS — subscriptions.js */
let _allSubs = [];
let _currentSubTab = 'active';

async function loadSubscriptions() {
  const res = await apiGet('subscriptions', 'list');
  _allSubs = res.data || [];
  renderSubs(_currentSubTab);
}

function switchSubTab(tab, btn) {
  _currentSubTab = tab;
  document.querySelectorAll('#page-subscriptions .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderSubs(tab);
}

function renderSubs(tab) {
  const filtered = tab === 'all' ? _allSubs : _allSubs.filter(s => s.status === tab);
  const tbody = document.getElementById('subsTable');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No ${tab} subscriptions</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><strong>${esc(s.clientName)}</strong></td>
      <td>${esc(s.planName)}</td>
      <td>${s.maxDevices}</td>
      <td>${fmtDate(s.startDate)}</td>
      <td>${fmtDate(s.expiryDate)}</td>
      <td>${fmtDaysLeft(s.expiryDate)}</td>
      <td>${statusBadge(s.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-green btn-sm" onclick="showRenewSubscription(${s.clientId})">Renew</button>
          <button class="btn btn-ghost btn-sm" onclick="editSubscription(${s.id})">Edit</button>
        </div>
      </td>
    </tr>`).join('');
}

function showRenewSubscription(clientId) {
  showPage('payments');
}

async function editSubscription(id) {
  const sub = _allSubs.find(s => s.id === id);
  if (!sub) return;
  openModal(`Edit Subscription — ${sub.clientName}`,
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Plan</label><select class="form-input" id="esPlan"></select></div>
      <div class="form-group"><label class="form-label">Max Devices</label><input type="number" inputmode="numeric" class="form-input" id="esDevices" value="${sub.maxDevices}" min="1"/></div>
      <div class="form-group"><label class="form-label">Expiry Date</label><input type="date" class="form-input" id="esExpiry" value="${sub.expiryDate ? sub.expiryDate.split('T')[0] : ''}"/></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveEditSubscription(${id})">Save</button>`
  );
  // FIX: was loadPlanOptionsTo() defined locally — now uses shared helper with pre-selection
  _loadPlanSelectOptions('esPlan', sub.planId);
}

async function saveEditSubscription(id) {
  const data = {
    id,
    planId:     document.getElementById('esPlan').value,
    maxDevices: parseInt(document.getElementById('esDevices').value) || 1,
    expiryDate: document.getElementById('esExpiry').value,
  };
  const res = await api('subscriptions', 'edit', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Subscription updated');
  loadSubscriptions();
}

function showAddPlan() {
  openModal('Add Subscription Plan',
    `<div class="form-group"><label class="form-label">Plan Name *</label><input type="text" class="form-input" id="pName" placeholder="Monthly"/></div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Duration (days) *</label><input type="number" inputmode="numeric" class="form-input" id="pDays" placeholder="30"/></div>
      <div class="form-group"><label class="form-label">Price (RWF) *</label><input type="number" inputmode="numeric" class="form-input" id="pPrice" placeholder="15000"/></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveNewPlan()">Add Plan</button>`
  );
}

async function saveNewPlan() {
  const data = {
    name:         document.getElementById('pName').value.trim(),
    durationDays: parseInt(document.getElementById('pDays').value) || 0,
    priceRwf:     parseFloat(document.getElementById('pPrice').value) || 0,
  };
  if (!data.name || !data.durationDays) { toast('Fill all fields', 'error'); return; }
  const res = await api('subscriptions', 'add_plan', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Plan added');
  loadSubscriptions();
}
