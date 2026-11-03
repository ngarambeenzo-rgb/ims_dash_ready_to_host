/* ═══════════════════════════════════════════════════
   IMS — ui.js
   Workbench behaviour: tabs, explorer, command palette,
   terminal panel, status bar, mobile drawer and
   phone-friendly tables.
═══════════════════════════════════════════════════ */

const IMS_GROUP = { dashboard: 'operate', clients: 'manage', subscriptions: 'manage', devices: 'manage', licenses: 'manage', payments: 'manage' };
const IMS_ICON  = { dashboard: 'dashboard', clients: 'clients', subscriptions: 'subs', devices: 'devices', licenses: 'key', payments: 'payments', support: 'support', map: 'map', reports: 'chart', products: 'package', auditlog: 'audit', settings: 'settings' };
const _$ = id => document.getElementById(id);
const _pad = n => String(n).padStart(2, '0');
const _hms = d => `${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;

// ── Clock ─────────────────────────────────────────
function updateClock() {
  const t = _$('topTime');
  if (t) t.textContent = new Date().toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' });
}
updateClock();
setInterval(updateClock, 15000);

// ── Mobile explorer drawer ────────────────────────
function openNav()  { document.body.classList.add('nav-open'); }
function closeNav() { document.body.classList.remove('nav-open'); }

// ── Explorer: collapsible sections and folders ────
function toggleSection(id) { _$(id).classList.toggle('closed'); }
function toggleFolder(el)  { el.classList.toggle('closed'); }

// ── Floating panels ───────────────────────────────
function closePanels() { document.querySelectorAll('.float-panel.open').forEach(p => p.classList.remove('open')); }
function _togglePanelEl(id) {
  const p = _$(id); if (!p) return;
  const was = p.classList.contains('open');
  closePanels();
  if (!was) p.classList.add('open');
}
function toggleAlerts()      { _togglePanelEl('alertPanel'); }
function showQuickActions()  { _togglePanelEl('quickPanel'); }
function closeQuickActions() { closePanels(); }
document.addEventListener('click', e => {
  if (!e.target.closest('.float-panel') && !e.target.closest('[onclick*="toggleAlerts"]') && !e.target.closest('[onclick*="showQuickActions"]')) closePanels();
});

// ── Breadcrumb (one page at a time, no tab pile-up) ──
function imsOpenTab(page) {
  const g = _$('crumbGroup');
  if (g) g.textContent = IMS_GROUP[page] || 'system';
}
function imsCloseTab() {}

// ── Explorer: clients and timeline ────────────────
let _imsClients = [], _treeAt = 0;
const _stDot = { active: 'dot-green', trial: 'dot-blue', expired: 'dot-red', suspended: 'dot-gray' };
async function imsRefreshTree(force) {
  if (!force && Date.now() - _treeAt < 30000) return;
  _treeAt = Date.now();
  const res = await apiGet('clients', 'list');
  if (!res.ok) return;
  _imsClients = res.data || [];
  _$('treeClientCount').textContent = _imsClients.length;
  _$('clientsTree').innerHTML = _imsClients.length ? _imsClients.map((c, i) => `
    <div class="tree-client" onclick="imsOpenClient(${i})" title="${esc(c.businessName)} · ${esc(c.status)}">
      <span class="dot ${_stDot[c.status] || 'dot-gray'}"></span><span class="nm">${esc(c.businessName)}</span><span class="st">${esc(c.status)}</span>
    </div>`).join('') : '<div class="tree-empty">No clients yet</div>';
}
function imsOpenClient(i) {
  const c = _imsClients[i]; if (!c) return;
  showPage('clients');
  if (typeof filterClients === 'function') setTimeout(() => filterClients(c.businessName), 200);
}
function imsTimeline(items) {
  const el = _$('timelineTree'); if (!el) return;
  el.innerHTML = (items || []).length ? items.slice(0, 6).map(a => `
    <div class="tl-item"><b>${esc(a.doneBy || 'system')}</b> ${esc(a.details || a.actionType || '')}<small>${fmtDateTime(a.createdAt)}</small></div>`).join('') : '<div class="tree-empty">No activity yet</div>';
}

// ── Problems (fed by the dashboard; shown in the status bar and palette) ──
let _problems = [];
function imsProblems(list) {
  _problems = list || [];
  const n = _problems.length;
  _$('sbProblemsN').textContent = n;
  _$('sbProblems').classList.toggle('warn', n > 0);
  _$('sbProblems').title = n ? _problems.map(p => p.text).join('\n') : 'No problems';
}

// ── Command palette ───────────────────────────────
let _palItems = [], _palSel = 0;
function _palBuild() {
  const items = [];
  Object.keys(IMS_ICON).forEach(p => items.push({ ic: IMS_ICON[p], label: 'Go to ' + (PAGE_TITLES[p] ? PAGE_TITLES[p].en : p), grp: 'page', run: () => showPage(p) }));
  items.push(
    { ic: 'plus',     label: 'Add client',        grp: 'command', run: () => showAddClient() },
    { ic: 'payments', label: 'Record payment',    grp: 'command', run: () => showRecordPayment() },
    { ic: 'key',      label: 'Generate license',  grp: 'command', run: () => showGenerateLicense() },
    { ic: 'devices',  label: 'Approve devices',   grp: 'command', run: () => showPage('devices') },
    { ic: 'globe',    label: 'Switch language',   grp: 'view',    run: () => toggleLang() },
    { ic: 'refresh',  label: 'Reload current page', grp: 'view',  run: () => showPage(_currentPage) },
    { ic: 'logout',   label: 'Sign out',          grp: 'account', run: () => doLogout() },
  );
  _imsClients.forEach((c, i) => items.push({ ic: 'clients', label: 'Client: ' + c.businessName, grp: c.status, run: () => imsOpenClient(i) }));
  return items;
}
function openPalette() {
  closePanels(); closeNav();
  _$('paletteScrim').classList.add('open');
  const i = _$('paletteInput'); i.value = ''; i.focus();
  imsRefreshTree();
  paletteFilter('');
}
function closePalette() { _$('paletteScrim').classList.remove('open'); }
function paletteFilter(q) {
  q = q.trim().toLowerCase();
  const all = _palBuild();
  _palItems = q ? all.filter(it => q.split(/\s+/).every(w => it.label.toLowerCase().includes(w))) : all.slice(0, 14);
  _palSel = 0;
  _$('paletteList').innerHTML = _palItems.length ? _palItems.slice(0, 40).map((it, i) => `
    <div class="pal-item${i === 0 ? ' sel' : ''}" data-i="${i}" onclick="paletteRun(${i})" onmousemove="paletteHover(${i})"><svg class="ic ic-sm"><use href="#i-${it.ic}"/></svg><span>${esc(it.label)}</span><span class="grp">${esc(it.grp)}</span></div>`).join('') : '<div class="pal-empty">No matching command</div>';
}
function paletteHover(i) { _palSel = i; document.querySelectorAll('.pal-item').forEach((e, n) => e.classList.toggle('sel', n === i)); }
function paletteRun(i) { const it = _palItems[i]; closePalette(); if (it) it.run(); }
function paletteKey(e) {
  const n = Math.min(_palItems.length, 40);
  if (e.key === 'ArrowDown') { paletteHover((_palSel + 1) % Math.max(1, n)); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { paletteHover((_palSel - 1 + n) % Math.max(1, n)); e.preventDefault(); }
  else if (e.key === 'Enter') { paletteRun(_palSel); }
  const s = document.querySelector('.pal-item.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
}
// Kept for older callers
function globalSearchFn(q) { if ((q || '').trim().length > 1) { showPage('clients'); if (typeof filterClients === 'function') filterClients(q); } }

// ── Keyboard ──────────────────────────────────────
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === 'k' || (e.shiftKey && k === 'p'))) { e.preventDefault(); openPalette(); }
  else if (e.key === 'Escape') { closeModal(); closePanels(); closeNav(); closePalette(); }
});
_$('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });

// ── Status bar ────────────────────────────────────
let _imsLastOk = 0;
function imsConn(ok) {
  const bar = _$('statusbar'); if (!bar) return;
  bar.classList.toggle('bad', !ok);
  _$('sysStatusText').textContent = ok ? 'Connected' : 'Server unreachable';
  if (ok) _imsLastOk = Date.now();
  _imsConnSub();
}
function _imsConnSub() {
  const sub = _$('sysStatusSub'); if (!sub) return;
  if (!_imsLastOk) { sub.textContent = 'Waiting for data'; return; }
  const s = Math.round((Date.now() - _imsLastOk) / 1000);
  sub.textContent = s < 10 ? 'Synced just now' : s < 60 ? `Synced ${s}s ago` : `Synced ${Math.round(s / 60)} min ago`;
}
setInterval(_imsConnSub, 15000);

// Mirror the explorer badges onto the activity bar and status bar
function _mirrorBadges() {
  const map = [['pendingDevicesBadge', 'actDevicesBadge', 'sbDevicesN'], ['supportBadge', 'actSupportBadge', 'sbSupportN']];
  map.forEach(([src, act, sb]) => {
    const s = _$(src); if (!s) return;
    const n = parseInt(s.textContent, 10) || 0;
    const a = _$(act); a.textContent = n; a.style.display = n ? '' : 'none';
    _$(sb).textContent = n;
  });
}
['pendingDevicesBadge', 'supportBadge'].forEach(id => new MutationObserver(_mirrorBadges).observe(_$(id), { childList: true, characterData: true, subtree: true, attributes: true }));

// Language label in the status bar
const _origApplyLang = applyLanguage;
applyLanguage = function () { _origApplyLang(); const l = _$('langStatus'); if (l) l.textContent = currentLang.toUpperCase(); };

// ── Session ended (server says 401 while the app is open) ──
function imsSessionEnded() {
  const shell = _$('appShell');
  if (!shell || shell.style.display === 'none') return;
  shell.style.display = 'none';
  _$('loginWrap').style.display = 'grid';
  closeNav(); closePalette();
  toast('Your session ended. Sign in again.', 'warning');
}

// ── Phone-friendly tables ─────────────────────────
// Every table gets its header text copied onto each cell so CSS can stack rows into cards on small screens.
function _labelTable(table) {
  const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  if (!heads.length) return;
  table.classList.add('rt');
  table.querySelectorAll('tbody tr').forEach(tr => {
    if (tr.dataset.labelled === String(tr.children.length)) return;
    [...tr.children].forEach((td, i) => {
      if (td.hasAttribute('colspan')) return;
      td.setAttribute('data-label', heads[i] || '');
      // Mixed text + elements (e.g. name<br>email) would split into separate flex items on phones, so keep them together.
      if (td.childNodes.length > 1 && !(td.firstElementChild && td.firstElementChild.classList.contains('tdv'))) {
        const w = document.createElement('span');
        w.className = 'tdv';
        while (td.firstChild) w.appendChild(td.firstChild);
        td.appendChild(w);
      }
    });
    tr.dataset.labelled = String(tr.children.length);
  });
}
const _tblObs = new MutationObserver(muts => {
  const seen = new Set();
  muts.forEach(m => {
    const t = m.target.closest ? m.target.closest('table') : m.target.parentElement && m.target.parentElement.closest('table');
    if (t && !seen.has(t)) { seen.add(t); _labelTable(t); }
  });
});
document.querySelectorAll('table').forEach(t => { _labelTable(t); _tblObs.observe(t, { childList: true, subtree: true }); });
new MutationObserver(muts => {
  muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    const list = n.tagName === 'TABLE' ? [n] : [...n.querySelectorAll('table')];
    list.forEach(t => { if (!t.classList.contains('rt')) { _labelTable(t); _tblObs.observe(t, { childList: true, subtree: true }); } });
  }));
}).observe(document.body, { childList: true, subtree: true });

