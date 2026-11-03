/* IMS — products.js */
let _allProducts = [];

async function loadProducts() {
  const res = await apiGet('products', 'list');
  _allProducts = res.data || [];
  renderProducts();
  loadDeployments();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!_allProducts.length) {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty-state"><div class="icon"></div><p>No products yet. Add your first product!</p></div></div>';
    return;
  }
  grid.innerHTML = _allProducts.map(p => `
    <div class="card">
      <div class="flex-between mb-16">
        <div>
          <div style="font-size:32px;margin-bottom:4px">${esc(p.icon || '📦')}</div>
          <div style="font-size:17px;font-weight:800;color:var(--text)">${esc(p.name)}</div>
          <div style="font-size:12px;color:var(--muted)">${esc(p.description || '')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><span class="badge badge-${p.active ? 'green' : 'gray'}">${p.active ? 'Active' : 'Inactive'}</span><span class="badge badge-purple">${({app:'App',website:'Website',api:'API',other:'Other'})[p.kind || 'app']}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="background:var(--card2);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--blue)">${p.totalClients || 0}</div>
          <div style="font-size:11px;color:var(--muted)">Total Clients</div>
        </div>
        <div style="background:var(--card2);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--green)">${p.activeClients || 0}</div>
          <div style="font-size:11px;color:var(--muted)">Active</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        Version: <strong>${esc(p.currentVersion || '1.0.0')}</strong> &nbsp;|&nbsp;
        Updated: <strong>${fmtDate(p.updatedAt)}</strong>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="showEditProduct(${p.id})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="showPushUpdate(${p.id})">Push Update</button>
      </div>
    </div>`).join('');
}

function showAddProduct() {
  openModal('Add New Product',
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Product Name *</label><input type="text" class="form-input" id="prName" placeholder="BarMS Pro"/></div>
      <div class="form-group"><label class="form-label">Icon (emoji)</label><input type="text" class="form-input" id="prIcon" placeholder="🍺" maxlength="4"/></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><input type="text" class="form-input" id="prDesc" placeholder="Bar Management System"/></div>
    <div class="form-row cols-2"><div class="form-group"><label class="form-label">Current Version</label><input type="text" class="form-input" id="prVersion" placeholder="1.0.0"/></div>
    <div class="form-group"><label class="form-label">What is it?</label><select class="form-input" id="prKind"><option value="app">App (installed on devices)</option><option value="website">Website we built for a client</option><option value="api">API or service</option><option value="other">Other</option></select></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveNewProduct()">Add Product</button>`
  );
}

async function saveNewProduct() {
  const data = {
    name:           document.getElementById('prName').value.trim(),
    icon:           document.getElementById('prIcon').value.trim(),
    description:    document.getElementById('prDesc').value.trim(),
    currentVersion: document.getElementById('prVersion').value.trim() || '1.0.0',
    kind:           document.getElementById('prKind').value,
  };
  if (!data.name) { toast('Product name required', 'error'); return; }
  const res = await api('products', 'add', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Product added');
  loadProducts();
}

function showEditProduct(id) {
  const p = _allProducts.find(x => x.id === id);
  if (!p) return;
  openModal('Edit Product',
    `<div class="form-row cols-2">
      <div class="form-group"><label class="form-label">Product Name *</label><input type="text" class="form-input" id="eprName" value="${esc(p.name)}"/></div>
      <div class="form-group"><label class="form-label">Icon</label><input type="text" class="form-input" id="eprIcon" value="${esc(p.icon || '')}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label><input type="text" class="form-input" id="eprDesc" value="${esc(p.description || '')}"/></div>
    <div class="form-row cols-2"><div class="form-group"><label class="form-label">Current Version</label><input type="text" class="form-input" id="eprVersion" value="${esc(p.currentVersion || '1.0.0')}"/></div>
    <div class="form-group"><label class="form-label">What is it?</label><select class="form-input" id="eprKind">${['app:App (installed on devices)','website:Website we built for a client','api:API or service','other:Other'].map(o => { const [v,l] = o.split(':'); return `<option value="${v}" ${(p.kind || 'app') === v ? 'selected' : ''}>${l}</option>`; }).join('')}</select></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveEditProduct(${id})">Save</button>`
  );
}

async function saveEditProduct(id) {
  const data = {
    id,
    name:           document.getElementById('eprName').value.trim(),
    icon:           document.getElementById('eprIcon').value.trim(),
    description:    document.getElementById('eprDesc').value.trim(),
    currentVersion: document.getElementById('eprVersion').value.trim(),
    kind:           document.getElementById('eprKind').value,
  };
  const res = await api('products', 'edit', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Product updated');
  loadProducts();
}

// Replacement for showPushUpdate and pushUpdate in products.js
function showPushUpdate(id) {
  const p = _allProducts.find(x => x.id === id);
  openModal('Push Update — ' + (p?.name || ''),
    '<div class="alert alert-blue" style="margin-bottom:14px"><div>' +
    '<strong>How it works:</strong> Upload a new BarMS ZIP file. Every BarMS installation will ' +
    'automatically download and install it on next sync — just like GitHub pushes.' +
    '</div></div>' +
    '<div class="form-group"><label class="form-label">New Version Number *</label>' +
    '<input type="text" class="form-input" id="updateVersion" placeholder="e.g. 1.1.0"/></div>' +
    '<div class="form-group"><label class="form-label">Release Notes</label>' +
    '<textarea class="form-input" id="updateNotes" rows="3" placeholder="What changed? Bug fixes? New features?"></textarea></div>' +
    '<div class="form-group"><label class="form-label">BarMS ZIP File</label>' +
    '<input type="file" class="form-input" id="updateFile" accept=".zip" style="padding:6px"/>' +
    '<div style="font-size:11px;color:var(--muted);margin-top:4px">Upload complete BarMS ZIP. IMS stores and distributes to all clients automatically.</div></div>' +
    '<div style="background:var(--card2);border-radius:8px;padding:12px;font-size:12px;color:var(--muted)">' +
    '<strong style="color:var(--text)">What happens after upload:</strong><br>' +
    '1. IMS stores the ZIP file on server<br>' +
    '2. Version number updated in database<br>' +
    '3. Every BarMS syncs → detects new version → downloads<br>' +
    '4. Bar staff see "Update Available" notification<br>' +
    '5. App installs update silently on next reload</div>',
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="pushUpdateBtn" onclick="pushUpdate(' + id + ')">Upload & Push</button>'
  );
}

async function pushUpdate(id) {
  const version = (document.getElementById('updateVersion')?.value || '').trim();
  const notes   = (document.getElementById('updateNotes')?.value || '').trim();
  const fileEl  = document.getElementById('updateFile');
  const file    = fileEl?.files?.[0];

  if (!version) { toast('Version number required', 'error'); return; }

  const btn = document.getElementById('pushUpdateBtn');
  if (btn) { btn.textContent = 'Uploading...'; btn.disabled = true; }

  const formData = new FormData();
  formData.append('productId', id);
  formData.append('version', version);
  formData.append('notes', notes);
  if (file) formData.append('updateFile', file);

  try {
    const res = await fetch('api/updates.php?action=upload', {
      method: 'POST',
      headers: { 'X-CSRF-Token': getCsrfToken() },
      body: formData
    });
    const data = await res.json();
    if (!data.ok) {
      toast(data.error || 'Upload failed', 'error');
      if (btn) { btn.textContent = 'Upload & Push'; btn.disabled = false; }
      return;
    }
    closeModal();
    toast(data.message || 'Update pushed! All BarMS installations will update on next sync');
    loadProducts();
  } catch(e) {
    toast('Upload failed — check connection and try again', 'error');
    if (btn) { btn.textContent = 'Upload & Push'; btn.disabled = false; }
  }
}



// ═══ Deployments: every place one of our products runs ═══
let _deployments = [];
async function loadDeployments() {
  const res = await apiGet('deployments', 'list');
  _deployments = res.data || [];
  const tb = document.getElementById('deployTable');
  if (!tb) return;
  if (!_deployments.length) {
    tb.innerHTML = '<tr><td colspan="7" class="td-muted" style="text-align:center;padding:26px">Nothing registered yet. Add a client\'s website or app and it shows up here and on the map.</td></tr>';
    return;
  }
  tb.innerHTML = _deployments.map(d => {
    const health = d.last_check
      ? (d.last_http >= 200 && d.last_http < 400 ? `<span class="badge badge-green">${d.last_http} · ${d.last_ms} ms</span>` : `<span class="badge badge-red">${d.last_http || 'No answer'}</span>`)
      : '<span class="td-muted">Not checked</span>';
    const seen = d.last_seen ? `<div class="td-muted">Guard seen ${fmtDateTime(d.last_seen)}</div>` : '';
    return `<tr>
      <td><b class="td-primary">${esc(d.name)}</b>${d.version ? `<div class="td-muted">v${esc(d.version)}</div>` : ''}</td>
      <td>${esc(d.client_name)}</td>
      <td>${esc(d.product_name)}</td>
      <td>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--cyan)">${esc(d.url.replace(/^https?:\/\//, ''))}</a>` : '<span class="td-muted">None</span>'}</td>
      <td>${health}${seen}</td>
      <td>${d.status === 'live' ? '<span class="badge badge-green">Live</span>' : '<span class="badge badge-orange">Paused</span>'}</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="checkDeployment(${d.id})">Check now</button>
        <button class="btn btn-ghost btn-sm" onclick="showDeploymentGuard(${d.id})">Guard code</button>
        ${d.status === 'live' ? `<button class="btn btn-red btn-sm" onclick="pauseDeployment(${d.id})">Pause</button>` : `<button class="btn btn-green btn-sm" onclick="resumeDeployment(${d.id})">Resume</button>`}
        <button class="btn-icon" title="Edit" onclick="showEditDeployment(${d.id})">${ico('edit')}</button>
        <button class="btn-icon" title="Remove" onclick="removeDeployment(${d.id})">${ico('trash')}</button>
      </div></td></tr>`;
  }).join('');
}

async function showAddDeployment() {
  const [cl, pr] = await Promise.all([apiGet('clients', 'list'), apiGet('products', 'list')]);
  const clients = cl.data || [], products = pr.data || [];
  openModal('Register a website or app',
    `<div class="form-group"><label class="form-label">Client *</label><select class="form-input" id="dpClient">${clients.map(c => `<option value="${c.id}">${esc(c.businessName)}</option>`).join('')}</select></div>
     <div class="form-group"><label class="form-label">Product *</label><select class="form-input" id="dpProduct">${products.map(p => `<option value="${p.id}">${esc(p.name)} (${({app:'app',website:'website',api:'API',other:'other'})[p.kind || 'app']})</option>`).join('')}</select></div>
     <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="dpName" placeholder="Chez Patrick website"/></div>
     <div class="form-row cols-2">
       <div class="form-group"><label class="form-label">Address (URL)</label><input class="form-input" id="dpUrl" placeholder="https://chezpatrick.rw"/></div>
       <div class="form-group"><label class="form-label">Version</label><input class="form-input" id="dpVersion" placeholder="1.0.0"/></div>
     </div>
     <div class="alert alert-blue"><div>After saving you get a small guard code to paste into the website. It lets us see the site is alive and pause it if the client stops paying.</div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveDeployment()">Register</button>`);
}
async function saveDeployment() {
  const r = await api('deployments', 'add', {
    clientId: document.getElementById('dpClient').value, productId: document.getElementById('dpProduct').value,
    name: document.getElementById('dpName').value.trim(), url: document.getElementById('dpUrl').value.trim(), version: document.getElementById('dpVersion').value.trim() });
  if (!r.ok) { toast(r.error || 'Could not register', 'error'); return; }
  toast('Registered');
  await loadDeployments();
  showDeploymentGuard(r.id);
}
function showEditDeployment(id) {
  const d = _deployments.find(x => x.id === id); if (!d) return;
  openModal('Edit: ' + d.name,
    `<div class="form-group"><label class="form-label">Name</label><input class="form-input" id="edpName" value="${esc(d.name)}"/></div>
     <div class="form-row cols-2">
       <div class="form-group"><label class="form-label">Address (URL)</label><input class="form-input" id="edpUrl" value="${esc(d.url || '')}"/></div>
       <div class="form-group"><label class="form-label">Version</label><input class="form-input" id="edpVersion" value="${esc(d.version || '')}"/></div>
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="updateDeployment(${id})">Save</button>`);
}
async function updateDeployment(id) {
  const r = await api('deployments', 'update', { id, name: document.getElementById('edpName').value.trim(), url: document.getElementById('edpUrl').value.trim(), version: document.getElementById('edpVersion').value.trim() });
  if (!r.ok) { toast(r.error || 'Could not save', 'error'); return; }
  closeModal(); toast('Saved'); loadDeployments();
}
async function checkDeployment(id) {
  const r = await api('deployments', 'check', { id });
  toast(r.http >= 200 && r.http < 400 ? `Answered ${r.http} in ${r.ms} ms` : (r.http ? `Answered with error ${r.http}` : 'No answer from that address'), r.http >= 200 && r.http < 400 ? 'success' : 'error');
  loadDeployments();
}
function pauseDeployment(id) {
  openModal('Pause this website',
    `<div class="alert alert-orange"><div>Visitors see a "service paused" message instead of the site, the next time the page loads.</div></div>
     <div class="form-group"><label class="form-label">Message visitors see</label><textarea class="form-input" id="dpMsg" rows="3">This service is temporarily unavailable. Please contact us.</textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="savePause(${id})">Pause</button>`);
}
async function savePause(id) {
  const r = await api('deployments', 'set_status', { id, status: 'paused', message: document.getElementById('dpMsg').value.trim() });
  closeModal(); toast(r.ok ? 'Paused' : (r.error || 'Failed'), r.ok ? 'success' : 'error'); loadDeployments();
}
async function resumeDeployment(id) {
  const r = await api('deployments', 'set_status', { id, status: 'live' });
  toast(r.ok ? 'Live again' : (r.error || 'Failed'), r.ok ? 'success' : 'error'); loadDeployments();
}
function removeDeployment(id) {
  const d = _deployments.find(x => x.id === id);
  openModal('Remove from IMS', `<p style="line-height:1.6">Stop tracking <strong>${esc(d ? d.name : '')}</strong>? The website itself is not touched.</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="closeModal();doRemoveDeployment(${id})">Remove</button>`);
}
async function doRemoveDeployment(id) {
  const r = await api('deployments', 'delete', { id });
  toast(r.ok ? 'Removed' : (r.error || 'Failed'), r.ok ? 'success' : 'error'); loadDeployments();
}
function showDeploymentGuard(id) {
  const d = _deployments.find(x => x.id === id); if (!d) return;
  const base = location.origin + location.pathname.replace(/\/[^/]*$/, '');
  const code = `<script src="${base}/api/guard.php?t=${d.token}" defer><\/script>`;
  openModal('Guard code for ' + d.name,
    `<p style="margin-bottom:10px;color:var(--muted)">Paste this just before <code>&lt;/body&gt;</code> on every page of the website.</p>
     <textarea class="form-input" id="guardCode" rows="3" readonly onclick="this.select()" style="font-family:var(--mono);font-size:12px">${esc(code)}</textarea>
     <p style="margin-top:10px;color:var(--muted);font-size:12px">If IMS cannot be reached, the site keeps working. It only pauses when we pause it, or when the client's subscription has ended.</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('guardCode').value).then(()=>toast('Copied'))">Copy code</button>`);
}