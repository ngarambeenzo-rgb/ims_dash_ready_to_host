/* ═══════════════════════════════════════════════════
   IMS — shared_helpers.js
   Single definitions of helper functions used across
   multiple modules. Load this BEFORE all feature JS.

   FIX: loadClientOptions and loadPlanOptions were
   defined in payments.js, licenses.js, AND clients.js
   causing the last-loaded file to silently override
   the others. Now defined once here.
═══════════════════════════════════════════════════ */

/**
 * Populate a <select> with client options.
 * @param {string} selectId  — element ID of the <select>
 * @param {number} [selectedId] — pre-select this client ID
 */
async function _loadClientSelectOptions(selectId, selectedId = null) {
  const res = await apiGet('clients', 'list');
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select client...</option>' +
    (res.data || []).map(c =>
      `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${esc(c.businessName)}</option>`
    ).join('');
}

/**
 * Populate a <select> with subscription plan options.
 * @param {string} selectId    — element ID of the <select>
 * @param {number} [selectedId] — pre-select this plan ID
 * @param {Function} [onPriceChange] — called with price when plan changes
 */
async function _loadPlanSelectOptions(selectId, selectedId = null, onPriceChange = null) {
  const res = await apiGet('subscriptions', 'plans');
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = (res.data || []).map(p =>
    `<option value="${p.id}" data-days="${p.durationDays}" data-price="${p.priceRwf}" ${p.id == selectedId ? 'selected' : ''}>
      ${esc(p.name)} — ${fmtRWF(p.priceRwf)} (${p.durationDays} days)
    </option>`
  ).join('');

  // Fire initial price
  if (onPriceChange && sel.options[sel.selectedIndex]) {
    onPriceChange(sel.options[sel.selectedIndex].dataset.price || 0);
  }

  // Fire on change
  if (onPriceChange) {
    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      onPriceChange(opt ? opt.dataset.price || 0 : 0);
    });
  }
}

/**
 * Populate a <select> with product options.
 * @param {string} selectId — element ID of the <select>
 */
async function _loadProductSelectOptions(selectId) {
  const res = await apiGet('products', 'list');
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = (res.data || []).map(p =>
    `<option value="${p.id}">${esc(p.name)}</option>`
  ).join('');
}
