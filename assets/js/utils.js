/* ═══════════════════════════════════════════════════
   IMS — utils.js
   Shared helpers: toast, modal, formatters, i18n
═══════════════════════════════════════════════════ */

// ── i18n ──────────────────────────────────────────
const DICT = {
  en: {
    dashboard:'Dashboard', clients:'Clients', subscriptions:'Subscriptions',
    payments:'Payments', devices:'Devices', licenses:'Licenses',
    products:'Products', clientMap:'Client Map', auditLog:'Audit Log',
    settings:'Settings', logout:'Logout', signIn:'Sign In →',
    username:'Username', password:'Password',
    invalidCredentials:'Invalid credentials. Try again.',
    main:'Main', control:'Control', system:'System',
    addClient:'Add Client', recordPayment:'Record Payment',
    approve:'Approve', block:'Block', revoke:'Revoke', renew:'Renew',
    suspend:'Suspend', activate:'Activate', edit:'Edit', delete:'Delete',
    save:'Save', cancel:'Cancel', close:'Close', confirm:'Confirm',
    active:'Active', expired:'Expired', trial:'Trial', suspended:'Suspended',
    pending:'Pending', approved:'Approved', blocked:'Blocked',
    days:'days', hours:'hours', never:'Never', today:'Today',
    loading:'Loading...', noData:'No data found',
  },
  fr: {
    dashboard:'Tableau de bord', clients:'Clients', subscriptions:'Abonnements',
    payments:'Paiements', devices:'Appareils', licenses:'Licences',
    products:'Produits', clientMap:'Carte Clients', auditLog:'Journal d\'audit',
    settings:'Paramètres', logout:'Déconnexion', signIn:'Se connecter →',
    username:'Nom d\'utilisateur', password:'Mot de passe',
    invalidCredentials:'Identifiants invalides. Réessayez.',
    main:'Principal', control:'Contrôle', system:'Système',
    addClient:'Ajouter Client', recordPayment:'Enregistrer Paiement',
    approve:'Approuver', block:'Bloquer', revoke:'Révoquer', renew:'Renouveler',
    suspend:'Suspendre', activate:'Activer', edit:'Modifier', delete:'Supprimer',
    save:'Enregistrer', cancel:'Annuler', close:'Fermer', confirm:'Confirmer',
    active:'Actif', expired:'Expiré', trial:'Essai', suspended:'Suspendu',
    pending:'En attente', approved:'Approuvé', blocked:'Bloqué',
    days:'jours', hours:'heures', never:'Jamais', today:'Aujourd\'hui',
    loading:'Chargement...', noData:'Aucune donnée',
  }
};

let currentLang = 'en';

function t(key) { return (DICT[currentLang] || DICT.en)[key] || key; }

function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT') el.placeholder = t(key);
    else el.textContent = t(key);
  });
  const lb = document.getElementById('langBtn');
  const tlb = document.getElementById('topLangBtn');
  if (lb) lb.textContent = currentLang === 'en' ? '🇫🇷 Français' : '🇬🇧 English';
  if (tlb) tlb.textContent = currentLang === 'en' ? '🇫🇷 FR' : '🇬🇧 EN';
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'fr' : 'en';
  localStorage.setItem('ims_lang', currentLang);
  applyLanguage();
}

// ── Toast ─────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => el.classList.remove('show'), 3200);
}

// ── Modal ─────────────────────────────────────────
function openModal(title, contentHTML, footerHTML = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalContent').innerHTML = contentHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function confirm2(msg, cb) {
  openModal('Confirm', `<p style="font-size:14px;line-height:1.6">${msg}</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-red" onclick="closeModal();(${cb.toString()})()">Confirm</button>`
  );
}

// ── Formatters ────────────────────────────────────
function fmtRWF(n) { return 'RWF ' + Number(n || 0).toLocaleString(); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-RW') : '—'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-RW') : '—'; }
function fmtDaysLeft(expiryDate) {
  if (!expiryDate) return '—';
  const diff = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  if (diff < 0) return `<span style="color:var(--red);font-weight:700">Expired ${Math.abs(diff)}d ago</span>`;
  if (diff <= 7) return `<span style="color:var(--orange);font-weight:700">${diff} days</span>`;
  return `<span style="color:var(--green);font-weight:700">${diff} days</span>`;
}

function statusBadge(status) {
  const map = {
    active:    '<span class="badge badge-green">✅ Active</span>',
    expired:   '<span class="badge badge-red">⌛ Expired</span>',
    trial:     '<span class="badge badge-blue">🔵 Trial</span>',
    suspended: '<span class="badge badge-gray">⛔ Suspended</span>',
    pending:   '<span class="badge badge-orange">⏳ Pending</span>',
    approved:  '<span class="badge badge-green">✅ Approved</span>',
    blocked:   '<span class="badge badge-red">🚫 Blocked</span>',
    revoked:   '<span class="badge badge-red">🚫 Revoked</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status}</span>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Alerts panel ──────────────────────────────────
function toggleAlerts() {
  const panel = document.getElementById('alertPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
