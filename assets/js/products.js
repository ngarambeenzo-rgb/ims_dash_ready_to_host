/* IMS — products.js */
let _allProducts = [];

async function loadProducts() {
  const res = await apiGet('products', 'list');
  _allProducts = res.data || [];
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!_allProducts.length) {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty-state"><div class="icon">📦</div><p>No products yet. Add your first product!</p></div></div>';
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
        <span class="badge badge-${p.active ? 'green' : 'gray'}">${p.active ? 'Active' : 'Inactive'}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--blue)">${p.totalClients || 0}</div>
          <div style="font-size:11px;color:var(--muted)">Total Clients</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--green)">${p.activeClients || 0}</div>
          <div style="font-size:11px;color:var(--muted)">Active</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        Version: <strong>${esc(p.currentVersion || '1.0.0')}</strong> &nbsp;|&nbsp;
        Updated: <strong>${fmtDate(p.updatedAt)}</strong>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="showEditProduct(${p.id})">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="showPushUpdate(${p.id})">📤 Push Update</button>
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
    <div class="form-group"><label class="form-label">Current Version</label><input type="text" class="form-input" id="prVersion" placeholder="1.0.0"/></div>`,
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
  };
  if (!data.name) { toast('Product name required', 'error'); return; }
  const res = await api('products', 'add', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Product added ✅');
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
    <div class="form-group"><label class="form-label">Current Version</label><input type="text" class="form-input" id="eprVersion" value="${esc(p.currentVersion || '1.0.0')}"/></div>`,
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
  };
  const res = await api('products', 'edit', data);
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  closeModal();
  toast('Product updated ✅');
  loadProducts();
}

// Replacement for showPushUpdate and pushUpdate in products.js
function showPushUpdate(id) {
  const p = _allProducts.find(x => x.id === id);
  openModal('📤 Push Update — ' + (p?.name || ''),
    '<div class="alert alert-blue" style="margin-bottom:14px"><span>ℹ️</span><div>' +
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
    '<strong style="color:var(--text)">📋 What happens after upload:</strong><br>' +
    '1. IMS stores the ZIP file on server<br>' +
    '2. Version number updated in database<br>' +
    '3. Every BarMS syncs → detects new version → downloads<br>' +
    '4. Bar staff see "Update Available" notification<br>' +
    '5. App installs update silently on next reload</div>',
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="pushUpdateBtn" onclick="pushUpdate(' + id + ')">📤 Upload & Push</button>'
  );
}

async function pushUpdate(id) {
  const version = (document.getElementById('updateVersion')?.value || '').trim();
  const notes   = (document.getElementById('updateNotes')?.value || '').trim();
  const fileEl  = document.getElementById('updateFile');
  const file    = fileEl?.files?.[0];

  if (!version) { toast('Version number required', 'error'); return; }

  const btn = document.getElementById('pushUpdateBtn');
  if (btn) { btn.textContent = '⏳ Uploading...'; btn.disabled = true; }

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
      if (btn) { btn.textContent = '📤 Upload & Push'; btn.disabled = false; }
      return;
    }
    closeModal();
    toast(data.message || 'Update pushed! All BarMS installations will update on next sync ✅');
    loadProducts();
  } catch(e) {
    toast('Upload failed — check connection and try again', 'error');
    if (btn) { btn.textContent = '📤 Upload & Push'; btn.disabled = false; }
  }
}


