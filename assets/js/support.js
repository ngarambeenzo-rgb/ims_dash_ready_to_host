/* IMS — support.js
   Support inbox (messages from BarMS owners) and Email & alerts settings. */

const SUP_CAT = { bug: 'Not working', question: 'Question', billing: 'Licence / payment', feature: 'Idea' };
const SUP_ST  = { new: ['#2563EB', 'New'], in_progress: ['#C2410C', 'In progress'], resolved: ['#047857', 'Resolved'] };
const supEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadSupportInbox() {
  const list = document.getElementById('supInbox');
  if (!list) return;
  const res = await apiGet('support', 'list');
  if (!res.ok) { list.innerHTML = `<div style="padding:24px;color:var(--muted)">${supEsc(res.error || 'Could not load')}</div>`; return; }
  const c = res.counts || {};
  document.getElementById('supCounts').textContent = `${c.new || 0} new · ${c.in_progress || 0} in progress · ${c.resolved || 0} resolved`;
  updateSupportBadge(c.new || 0);
  const rows = res.data || [];
  list.innerHTML = rows.length ? rows.map(t => {
    const [col, lbl] = SUP_ST[t.status] || SUP_ST.new;
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div><div style="font-weight:700;font-size:15px">#${t.id} · ${supEsc(t.subject)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${supEsc(t.bar_name)} · ${supEsc(t.sent_by || '')} · ${supEsc(SUP_CAT[t.category] || t.category)} · ${supEsc(t.created_at)}</div>
          ${t.contact ? `<div style="font-size:12px;margin-top:2px">Contact: <b>${supEsc(t.contact)}</b></div>` : ''}</div>
        <span style="font-size:12px;font-weight:700;color:${col}">● ${lbl}</span>
      </div>
      <div style="white-space:pre-wrap;font-size:13px;margin:10px 0;background:rgba(0,0,0,.03);padding:10px;border-radius:8px">${supEsc(t.message)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${t.status !== 'in_progress' ? `<button class="btn btn-ghost btn-sm" onclick="setSupportStatus(${t.id},'in_progress')">Mark in progress</button>` : ''}
        ${t.status !== 'resolved' ? `<button class="btn btn-primary btn-sm" onclick="setSupportStatus(${t.id},'resolved')">Mark resolved</button>` : `<button class="btn btn-ghost btn-sm" onclick="setSupportStatus(${t.id},'new')">Reopen</button>`}
        <span style="font-size:12px;color:${t.email_status === 'sent' ? '#047857' : '#BE123C'}">${t.email_status === 'sent' ? 'Emailed to the team' : 'Email not sent' + (t.email_error ? ': ' + supEsc(t.email_error) : '')}</span>
        ${t.email_status !== 'sent' ? `<button class="btn btn-ghost btn-sm" onclick="resendSupport(${t.id})">Email again</button>` : ''}
      </div>
    </div>`;
  }).join('') : `<div class="card" style="text-align:center;color:var(--muted);padding:40px">No messages from bars yet.</div>`;
}
function updateSupportBadge(n) {
  const b = document.getElementById('supportBadge');
  if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
}
async function setSupportStatus(id, status) {
  const r = await api('support', 'set_status', { id, status });
  if (!r.ok) { toast(r.error || 'Failed', 'error'); return; }
  loadSupportInbox();
}
async function resendSupport(id) {
  const r = await api('support', 'resend', { id });
  toast(r.ok ? 'Emailed' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
  loadSupportInbox();
}

// ── Email & alerts settings ───────────────────────
function emCount(id, outId) {
  const n = (document.getElementById(id).value.match(/[^\s,;@]+@[^\s,;@]+\.[^\s,;@]+/g) || []).length;
  document.getElementById(outId).textContent = n ? `${n} address${n > 1 ? 'es' : ''}` : 'No address yet';
}
async function loadEmailSettings() {
  const r = await apiGet('support', 'email_settings');
  if (!r.ok) { toast(r.error || 'Could not load', 'error'); return; }
  const d = r.data;
  document.getElementById('emSupport').value = d.supportEmails || '';
  document.getElementById('emAlerts').value = d.alertEmails || '';
  document.getElementById('emDays').value = d.alertDaysBefore || 7;
  document.getElementById('emFrom').value = d.mailFrom || '';
  document.getElementById('emFromName').value = d.mailFromName || '';
  document.getElementById('emKey').value = '';
  document.getElementById('emKeyHint').textContent = d.hasApiKey ? `A key is saved (${d.apiKeyHint}). Leave empty to keep it.` : 'No key saved yet — emails cannot be sent.';
  ['emSupport', 'emAlerts'].forEach(id => { const o = id === 'emSupport' ? 'emSupportCount' : 'emAlertsCount'; const el = document.getElementById(id); el.oninput = () => emCount(id, o); emCount(id, o); });
  loadAlertLog();
}
async function saveEmailSettings() {
  const r = await api('support', 'save_email_settings', {
    supportEmails: document.getElementById('emSupport').value, alertEmails: document.getElementById('emAlerts').value,
    alertDaysBefore: +document.getElementById('emDays').value || 7, mailFrom: document.getElementById('emFrom').value.trim(),
    mailFromName: document.getElementById('emFromName').value.trim(), apiKey: document.getElementById('emKey').value.trim(),
  });
  if (!r.ok) { toast(r.error || 'Could not save', 'error'); return; }
  toast(`Saved — ${r.supportCount} support and ${r.alertCount} alert address(es). All BarMS use them right away.`);
  loadEmailSettings();
}
async function testEmail() {
  const r = await api('support', 'test_email', {});
  toast(r.ok ? 'Test email sent to ' + r.sentTo.join(', ') : (r.error || 'Failed'), r.ok ? 'success' : 'error');
}
async function runAlertsNow() {
  const r = await api('support', 'run_alerts', {});
  if (!r.ok) { toast(r.error || 'Failed', 'error'); return; }
  const x = r.result || {};
  toast(!x.due ? 'No client needs to pay right now' : x.ok ? `Alert sent for ${x.due} client(s)` : `Found ${x.due} client(s) but the email failed: ${x.error}`, x.due && !x.ok ? 'error' : 'success');
  loadAlertLog();
}
async function loadAlertLog() {
  const r = await apiGet('support', 'alert_log');
  const el = document.getElementById('emAlertLog');
  if (!el) return;
  const kind = { due_soon: 'Ends soon', due_today: 'Ends today', overdue: 'Overdue' };
  el.innerHTML = (r.data || []).map(a => `<tr><td>${supEsc(a.business_name || '#' + a.client_id)}</td><td>${kind[a.kind] || a.kind}</td><td>${supEsc(a.expiry_date)}</td>
    <td style="font-size:12px">${supEsc(a.sent_to || '—')}</td><td style="color:${+a.ok ? '#047857' : '#BE123C'}">${+a.ok ? 'Sent' : supEsc(a.error || 'Failed')}</td><td style="font-size:12px">${supEsc(a.created_at)}</td></tr>`).join('')
    || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No alerts yet</td></tr>';
}

// new-message badge on the sidebar
setTimeout(async () => { try { const r = await apiGet('support', 'list'); if (r.ok) updateSupportBadge((r.counts || {}).new || 0); } catch (e) {} }, 2500);
