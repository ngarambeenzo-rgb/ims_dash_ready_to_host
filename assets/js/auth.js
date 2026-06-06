/* ═══════════════════════════════════════════════════
   IMS — auth.js
   Login, logout, session management
═══════════════════════════════════════════════════ */

let session = { adminId: 0, username: '', fullName: '', role: '' };

async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';

  if (!u || !p) { errEl.style.display = 'flex'; return; }

  const res = await api('auth', 'login', { username: u, password: p });
  if (!res.ok) { errEl.style.display = 'flex'; return; }

  session = { adminId: res.admin.id, username: res.admin.username, fullName: res.admin.fullName };

  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  document.getElementById('adminName').textContent = res.admin.fullName;
  document.getElementById('adminRole').textContent = 'Super Admin';
  document.getElementById('topbarAdmin').textContent = res.admin.fullName;
  document.getElementById('avatarTxt').textContent = res.admin.fullName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  showPage('dashboard');
  loadAlerts();
}

async function doLogout() {
  await api('auth', 'logout', {});
  session = { adminId: 0, username: '', fullName: '' };
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginWrap').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

async function changePassword() {
  const cur = document.getElementById('curPwd').value;
  const nw = document.getElementById('newPwd').value;
  const cf = document.getElementById('confPwd').value;
  if (!cur || !nw || !cf) { toast('Fill all fields', 'error'); return; }
  if (nw !== cf) { toast('Passwords do not match', 'error'); return; }
  if (nw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  const res = await api('auth', 'change_password', { current: cur, new: nw });
  if (!res.ok) { toast(res.error || 'Error', 'error'); return; }
  toast('Password updated successfully');
  document.getElementById('curPwd').value = '';
  document.getElementById('newPwd').value = '';
  document.getElementById('confPwd').value = '';
}

// Check session on load
window.addEventListener('load', async () => {
  const res = await apiGet('auth', 'me');
  if (res.ok) {
    session = { adminId: res.admin.id, username: res.admin.username, fullName: res.admin.fullName };
    const _set = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
    const _show = (id, d) => { const e = document.getElementById(id); if(e) e.style.display = d; };
    _show('loginWrap', 'none');
    _show('appShell', 'flex');
    _set('adminName', res.admin.fullName);
    _set('adminRole', 'Super Admin');
    _set('topbarAdmin', res.admin.fullName);
    _set('avatarTxt', res.admin.fullName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase());
    showPage('dashboard');
    loadAlerts();
  }
});
