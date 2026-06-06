/* ═══════════════════════════════════════════════════
   IMS — api.js
   All API calls to IMS backend
═══════════════════════════════════════════════════ */

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

async function api(endpoint, action, data = null) {
  const url = `api/${endpoint}.php?action=${action}`;
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify(data || {})
  };
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch(e) {
    console.error('API error:', endpoint, action, e);
    return { ok: false, error: 'Network error' };
  }
}

async function apiGet(endpoint, action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  try {
    const res = await fetch(`api/${endpoint}.php?${qs}`, {
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    return await res.json();
  } catch(e) {
    return { ok: false, error: 'Network error' };
  }
}
