/* ═══════════════════════════════════════════════════
   IMS — api.js
   All API calls to IMS backend
═══════════════════════════════════════════════════ */

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

// Reads a response, reports connection state, and sends the admin back to sign-in when the session has ended.
async function _apiRead(res) {
  const data = await res.json();
  if (typeof imsConn === 'function') imsConn(true);
  if (res.status === 401 && typeof imsSessionEnded === 'function' && data && data.error === 'Not authenticated') imsSessionEnded();
  return data;
}

function _imsLog(method, endpoint, action, status, t0) {
  if (typeof imsLog === 'function') imsLog(method, endpoint, action, status, Math.round(performance.now() - t0));
}

async function api(endpoint, action, data = null) {
  const url = `api/${endpoint}.php?action=${action}`;
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify(data || {})
  };
  const t0 = performance.now();
  try {
    const res = await fetch(url, opts);
    _imsLog('POST', endpoint, action, res.status, t0);
    return await _apiRead(res);
  } catch(e) {
    _imsLog('POST', endpoint, action, 0, t0);
    console.error('API error:', endpoint, action, e);
    if (typeof imsConn === 'function') imsConn(false);
    return { ok: false, error: 'Network error' };
  }
}

async function apiGet(endpoint, action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const t0 = performance.now();
  try {
    const res = await fetch(`api/${endpoint}.php?${qs}`, {
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    _imsLog('GET', endpoint, action, res.status, t0);
    return await _apiRead(res);
  } catch(e) {
    _imsLog('GET', endpoint, action, 0, t0);
    if (typeof imsConn === 'function') imsConn(false);
    return { ok: false, error: 'Network error' };
  }
}
