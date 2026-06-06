/* IMS — payments.js */
let _allPayments = [];

async function loadPayments() {
  const res = await apiGet('payments', 'list');
  _allPayments = res.data || [];
  renderPayments(_allPayments);
  updatePaymentTotals(_allPayments);
}

function renderPayments(payments) {
  const tbody = document.getElementById('paymentsTable');
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No payments recorded yet</td></tr>';
    return;
  }
  tbody.innerHTML = payments.map(p => `
    <tr>
      <td><strong>${esc(p.clientName)}</strong></td>
      <td style="font-weight:700;color:var(--green)">${fmtRWF(p.amount)}</td>
      <td>${esc(p.planName)}</td>
      <td>${p.maxDevices}</td>
      <td>${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}</td>
      <td>${esc(p.paymentMethod || 'Cash')}</td>
      <td>${esc(p.recordedBy)}</td>
      <td>${fmtDate(p.createdAt)}</td>
    </tr>`).join('');
}

function updatePaymentTotals(payments) {
  const now = new Date();
  const monthPayments = payments.filter(p => {
    const d = new Date(p.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const yearPayments = payments.filter(p => new Date(p.createdAt).getFullYear() === now.getFullYear());
  const monthTotal = monthPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const yearTotal  = yearPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const allTotal   = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('payMonthTotal', fmtRWF(monthTotal));
  set('payMonthCount', monthPayments.length + ' payments');
  set('payYearTotal',  fmtRWF(yearTotal));
  set('payYearCount',  yearPayments.length + ' payments');
  set('payAllTotal',   fmtRWF(allTotal));
  set('payAllCount',   payments.length + ' payments');
}

function filterPayments(q) {
  const filtered = _allPayments.filter(p =>
    p.clientName?.toLowerCase().includes(q.toLowerCase())
  );
  renderPayments(filtered);
}

function showRecordPayment() {
  openModal('💰 Record Payment',
    `<div class="alert alert-green"><span>✅</span><div>Recording a payment will automatically renew the client subscription and issue a new license.</div></div>
    <div class="form-group"><label class="form-label">Client *</label><select class="form-input" id="payClient"></select></div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Amount (RWF) *</label><input type="number" inputmode="numeric" class="form-input" id="payAmount" placeholder="15000"/></div>
      <div class="form-group"><label class="form-label">Payment Method</label>
        <select class="form-input" id="payMethod">
          <option value="Cash">Cash</option>
          <option value="MTN MoMo">MTN MoMo</option>
          <option value="Airtel Money">Airtel Money</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Subscription Plan *</label><select class="form-input" id="payPlan"></select></div>
      <div class="form-group"><label class="form-label">Max Devices *</label><input type="number" inputmode="numeric" class="form-input" id="payDevices" value="1" min="1"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes (optional)</label><input type="text" class="form-input" id="payNotes" placeholder="e.g. Paid via MoMo code 123456"/></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-green" onclick="savePayment()">💰 Record &amp; Activate</button>`
  );
  // Use the shared helpers from clients.js / subscriptions.js context
  _loadClientSelectOptions('payClient');
  _loadPlanSelectOptions('payPlan', null, amt => {
    const el = document.getElementById('payAmount');
    if (el) el.value = amt;
  });
}

async function savePayment() {
  const data = {
    clientId:      document.getElementById('payClient').value,
    amount:        parseFloat(document.getElementById('payAmount').value) || 0,
    paymentMethod: document.getElementById('payMethod').value,
    planId:        document.getElementById('payPlan').value,
    maxDevices:    parseInt(document.getElementById('payDevices').value) || 1,
    notes:         document.getElementById('payNotes').value.trim(),
  };
  if (!data.clientId || !data.planId || !data.amount) { toast('Fill required fields', 'error'); return; }
  const res = await api('payments', 'record', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Payment recorded! License issued automatically ✅');
  loadPayments();
}
