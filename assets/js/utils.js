/* ═══════════════════════════════════════════════════
   IMS — utils.js
   Shared helpers: toast, modal, formatters, i18n
═══════════════════════════════════════════════════ */

// ── i18n ──────────────────────────────────────────
const DICT = {
  en: {
    dashboard:'Dashboard', clients:'Clients', subscriptions:'Subscriptions',
    payments:'Payments', devices:'Devices', licenses:'Licenses',
    products:'Products & updates', clientMap:'Client map', auditLog:'Audit log',
    settings:'Settings', logout:'Sign out', signIn:'Sign in', signInTitle:'Sign in',
    controlCenter:'Control center', support:'Support inbox', reports:'Reports',
    username:'Username', password:'Password',
    invalidCredentials:'Wrong username or password. Try again.',
    main:'Main', control:'Manage', system:'System',
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
    payments:'Paiements', devices:'Appareils', licenses:'Licenses',
    products:'Produits', clientMap:'Carte Clients', auditLog:'Journal d\'audit',
    settings:'Paramètres', logout:'Se déconnecter', signIn:'Se connecter', signInTitle:'Connexion',
    controlCenter:'Centre de contrôle', support:'Messagerie support', reports:'Rapports',
    username:'Nom d\'utilisateur', password:'Mot de passe',
    invalidCredentials:'Identifiants invalides. Réessayez.',
    main:'Principal', control:'Gestion', system:'Système',
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
  if (lb) lb.textContent = currentLang === 'en' ? 'Français' : 'English';
  if (tlb) tlb.textContent = currentLang === 'en' ? 'FR' : 'EN';
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
  openModal('Please confirm', `<p style="font-size:14px;line-height:1.6">${msg}</p>`,
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
    active:    ['green',  'Active'],
    expired:   ['red',    'Expired'],
    trial:     ['blue',   'Trial'],
    suspended: ['gray',   'Suspended'],
    pending:   ['orange', 'Pending'],
    approved:  ['green',  'Approved'],
    blocked:   ['red',    'Blocked'],
    revoked:   ['red',    'Revoked'],
  };
  const m = map[status];
  return m ? `<span class="badge badge-${m[0]}">${m[1]}</span>` : `<span class="badge badge-gray">${esc(status)}</span>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


// Inline icon from the sprite in index.php
function ico(name, cls) { return '<svg class="ic ic-sm' + (cls ? ' ' + cls : '') + '"><use href="#i-' + name + '"/></svg>'; }
