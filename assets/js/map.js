/* ═══════════════════════════════════════════════════
   IMS — map.js
   One live map for everything we control: client businesses (address set
   by us), devices running our products (position reported by the product),
   websites we run for clients, and the places around them.
   • Night vector map of East Africa, focused on Rwanda (see map-style.js)
   • Updates by itself: a tiny "has anything changed?" check every 5 seconds
═══════════════════════════════════════════════════ */

let _dashMap = null;
const RWANDA_CENTER = [-1.9441, 30.0619];
const MAP_TILES = { streets: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' } };   // used by the small address picker in the client form

const _M = {
  map: null, ready: false, style: 'dark', pitch3d: false,
  data: { clients: [], devices: [], deployments: [], stats: {} }, loadedAt: 0, pulseV: null,
  mk: { client: {}, device: {} }, clusters: [],
  on: { clients: true, devices: true, alerts: true, comp: true, other: true, infra: true, buildings: true, bounds: true },
  sel: null, tab: 'clients', query: '', placing: null, places: '', placeRows: [], cands: [],
  events: [], unseen: 0, pulseTimer: null, freshTimer: null, insightTimer: null, me: null, placeMk: null,
};
const _FR = { live: 'Live now', recent: 'Seen today', stale: 'Not seen for over a day', lost: 'Marked lost', none: 'No position yet' };
const _ST = { active: 'Active', trial: 'Trial', expired: 'Expired', suspended: 'Suspended' };

// ── small helpers ─────────────────────────────────
function _ago(min) {
  if (min === null || min === undefined) return 'never';
  min = Math.max(0, Math.round(min));
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min ago';
  if (min < 1440) return Math.round(min / 60) + ' h ago';
  return Math.round(min / 1440) + ' d ago';
}
const _gDir  = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
const _gOpen = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
function _km(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function _fmtKm(km) { return km === null || km === undefined ? '' : km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km'; }
const _client = id => _M.data.clients.find(c => c.id === id);
const _device = id => _M.data.devices.find(d => d.id === id);
const _clientName = d => { const c = _client(d.clientId); return c ? c.business_name : 'Unknown client'; };
// How old a position is *now* (the server told us its age when we loaded)
function _age(d) { return d.ageMin === null || d.ageMin === undefined ? null : d.ageMin + (Date.now() - _M.loadedAt) / 60000; }
function _fr(d) {
  if (d.lost) return 'lost';
  const a = _age(d);
  return a === null ? 'none' : a <= 15 ? 'live' : a <= 1440 ? 'recent' : 'stale';
}
function _daysLeft(c) { return c.expiry_date ? Math.ceil((new Date(c.expiry_date) - new Date(new Date().toDateString())) / 86400000) : null; }
function _attention(c) {
  if (c.status === 'expired' || c.status === 'suspended') return 'bad';
  const d = _daysLeft(c); if (d !== null && d <= 7) return d < 0 ? 'bad' : 'warn';
  return '';
}
function _clientOnline(c) { return _M.data.devices.some(d => d.clientId === c.id && _fr(d) === 'live'); }

// ── map set-up ────────────────────────────────────
function _initMainMap() {
  if (_M.map) return;
  if (typeof maplibregl === 'undefined') { document.getElementById('mapList').innerHTML = '<div class="empty-state">The map library could not load. Check the internet connection and reload.</div>'; return; }
  const rw = IMS_REGIONS.rwanda.bounds;
  _M.map = new maplibregl.Map({
    container: 'mainMap', style: imsDarkStyle(), attributionControl: false, maxBounds: IMS_MAX_BOUNDS, minZoom: 3.2, maxPitch: 70,
    bounds: rw, fitBoundsOptions: { padding: 30 }, pitchWithRotate: true, dragRotate: true, hash: false,
  });
  _M.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap contributors · OpenFreeMap' }), 'bottom-left');
  _M.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  _M.map.on('style.load', _onStyleLoad);
  _M.map.on('click', e => {
    if (_M.placing) return _placeAt(e.lngLat.lat, e.lngLat.lng);
    if (_M.sel && !e.originalEvent.target.closest('.pin')) mapClose();
  });
  _M.map.on('moveend', () => { _cluster(); _scheduleInsights(); });
  _M.map.on('idle', () => _scheduleInsights());
  _M.map.on('zoom', () => _clusterSoon());
  window.addEventListener('resize', () => _M.map && _M.map.resize());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && _currentPage === 'map') _pulse(true); });
  _M.pulseTimer = setInterval(_pulse, 5000);
  _M.freshTimer = setInterval(() => { if (_currentPage === 'map') _refreshFresh(); }, 30000);
}

function _onStyleLoad() {
  const m = _M.map;
  m.addSource('alerts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addSource('sel',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addSource('trail',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: 'alert-fill', type: 'fill', source: 'alerts', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ef4444', 'fill-opacity': .16 } });
  m.addLayer({ id: 'alert-line', type: 'line', source: 'alerts', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#f87171', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
  m.addLayer({ id: 'alert-link', type: 'line', source: 'alerts', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#fb923c', 'line-width': 2, 'line-dasharray': [2, 2] } });
  m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#22d3ee', 'fill-opacity': .06 } });
  m.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#22d3ee', 'line-width': 1.6, 'line-dasharray': [3, 3] } });
  m.addLayer({ id: 'trail-glow', type: 'line', source: 'trail', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#22d3ee', 'line-width': 9, 'line-blur': 5, 'line-opacity': .5 } });
  m.addLayer({ id: 'trail-line', type: 'line', source: 'trail', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#67e8f9', 'line-width': 3 } });
  m.addLayer({ id: 'trail-pts', type: 'circle', source: 'trail', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': ['case', ['get', 'end'], 6, 3.2], 'circle-color': ['case', ['get', 'start'], '#fbbf24', '#22d3ee'], 'circle-stroke-color': '#040816', 'circle-stroke-width': 1.4 } });
  if (_M.style === 'dark') imsAddFocusCountry(m, 'Rwanda').then(_applyLayerToggles);
  _M.ready = true;
  _applyLayerToggles(); _drawAlerts(); _drawSelection();
  if (_M.data.clients.length && !_M.loadedAt) _applyData();
}

function mapStyle(name) {
  if (name === _M.style) return;
  _M.style = name; _M.ready = false;
  document.querySelectorAll('#styleSeg button').forEach(b => b.classList.toggle('on', b.dataset.s === name));
  _M.map.setStyle(name === 'satellite' ? imsSatelliteStyle() : imsDarkStyle());
}

// ── layer toggles (legend) ────────────────────────
const _LAYER_IDS = {
  comp: ['poi-glow-comp', 'poi-comp', 'poi-comp-label'], other: ['poi-other', 'poi-other-label'],
  infra: ['poi-infra', 'poi-infra-label', 'poi-misc-label', 'housenumber'],
  buildings: ['building-flat', 'building-3d'], bounds: ['boundary-region', 'boundary-district', 'boundary-country-glow', 'boundary-country', 'focus-mask', 'focus-area', 'focus-glow', 'focus-edge'],
  alerts: ['alert-fill', 'alert-line', 'alert-link'],
};
function mapLayerToggle(key, on) {
  _M.on[key] = on;
  if (key === 'clients' || key === 'devices') { _cluster(); return; }
  _applyLayerToggles();
}
function _applyLayerToggles() {
  const m = _M.map; if (!m || !_M.ready) return;
  Object.keys(_LAYER_IDS).forEach(k => _LAYER_IDS[k].forEach(id => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', _M.on[k] ? 'visible' : 'none'); }));
}
function mapLegendToggle() { document.getElementById('mapLegend').classList.toggle('closed'); }

// ── loading + real time ───────────────────────────
async function loadMap(force) {
  _initMainMap();
  if (!_M.map) return;
  setTimeout(() => _M.map.resize(), 60);
  if (!force && Date.now() - _M.loadedAt < 8000) return;
  await _fetchOverview(true);
}
async function _fetchOverview(initial) {
  const res = await apiGet('track', 'overview');
  if (!res.ok) { document.getElementById('mapList').innerHTML = `<div class="empty-state">${esc(res.error || 'Could not load the map data.')}</div>`; return; }
  const prev = _M.data; const first = !_M.loadedAt;
  _M.data = res.data; _M.loadedAt = Date.now();
  if (!first) _diffEvents(prev, _M.data);
  if (_M.ready) _applyData();
  _renderStats(); _renderList();
  _setLive('Live · updated ' + new Date().toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  if (_M.sel) { const s = _M.sel; _M.sel = null; mapSelect(s.type, s.id, { fly: false }); }
  if (first && _M.ready) { /* initial view stays on Rwanda */ }
}
// Is anything different? One tiny request; only then download everything.
async function _pulse(force) {
  if (_currentPage !== 'map' || document.hidden || !_M.map) return;
  const r = await apiGet('track', 'pulse');
  if (!r.ok) { _setLive('Offline · retrying…', true); return; }
  if (force || r.v !== _M.pulseV) { _M.pulseV = r.v; await _fetchOverview(false); }
  else _setLive('Live · nothing new · checked ' + new Date().toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
}
function _setLive(t, bad) {
  const el = document.getElementById('mapLiveText'); if (el) el.textContent = t;
  const p = document.querySelector('.live-pulse'); if (p) p.classList.toggle('bad', !!bad);
}

// What changed since the last look: feeds the Live tab and pops up the important ones
function _diffEvents(a, b) {
  const old = {}; a.devices.forEach(d => old[d.id] = d);
  const oldC = {}; a.clients.forEach(c => oldC[c.id] = c);
  b.clients.forEach(c => {
    const o = oldC[c.id];
    if (!o) _ev(`New client: ${c.business_name}`, 'info');
    else if (o.lat === null && c.lat !== null) _ev(`${c.business_name} was placed on the map`, 'info');
    else if (o.status !== c.status) _ev(`${c.business_name} is now ${c.status}`, c.status === 'active' ? 'ok' : 'warn');
  });
  b.devices.forEach(d => {
    const o = old[d.id]; const nm = `${imsDeviceLabel(d)} (${_clientName(d)})`;
    if (!o) { _ev(`New device: ${nm}`, 'info'); return; }
    if (!o.lost && d.lost) _ev(`${nm} was marked lost`, 'bad', true);
    if (o.lost && !d.lost) _ev(`${nm} was found`, 'ok');
    if (!o.away && d.away) _ev(`${nm} is ${_fmtKm(d.distanceKm)} from the business`, 'warn', true);
    if (o.status !== d.status) _ev(`${nm} is now ${d.status}`, d.status === 'approved' ? 'ok' : 'warn');
    if (d.lat !== null && (o.lat === null || _km([o.lat, o.lng], [d.lat, d.lng]) > 0.02)) _ev(`${nm} moved${d.distanceKm !== null ? ', ' + _fmtKm(d.distanceKm) + ' from the shop' : ''}`, 'move');
  });
}
function _ev(text, kind, important) {
  _M.events.unshift({ t: new Date(), text, kind });
  _M.events.length = Math.min(_M.events.length, 60);
  if (_M.tab !== 'live') { _M.unseen++; const c = document.getElementById('liveCount'); c.style.display = ''; c.textContent = _M.unseen; }
  else _renderList();
  if (important) toast(text, kind === 'bad' ? 'error' : 'warning');
}

function _renderStats() {
  const s = _M.data.stats || {};
  document.getElementById('msClients').textContent = (s.placed || 0) + '/' + (s.clients || 0);
  document.getElementById('msLive').textContent = _M.data.devices.filter(d => _fr(d) === 'live').length;
  document.getElementById('msAway').textContent = s.away || 0;
  document.getElementById('msLost').textContent = s.lost || 0;
  document.querySelector('.ms.away').classList.toggle('hot', (s.away || 0) > 0);
  document.querySelector('.ms.lost').classList.toggle('hot', (s.lost || 0) > 0);
}
function _refreshFresh() {
  Object.keys(_M.mk.device).forEach(id => { const d = _device(+id); if (d) _styleDevice(_M.mk.device[id].getElement(), d); });
  Object.keys(_M.mk.client).forEach(id => { const c = _client(+id); if (c) _styleClient(_M.mk.client[id].getElement(), c); });
  _renderStats(); _renderList();
}

// ── markers (HTML pins with glow) ─────────────────
const _SVG = {
  shop:  '<svg viewBox="0 0 24 24"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2"/></svg>',
  warn:  '<svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
  bang:  '<svg viewBox="0 0 24 24"><path d="M12 5v9M12 18.5h.01"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14 14 0 0 1 0 19 14 14 0 0 1 0-19z"/></svg>',
};
// Replace our classes but keep the ones MapLibre puts on a marker (positioning), otherwise the pin drifts when zooming
function _setCls(el, cls) {
  const keep = Array.from(el.classList).filter(k => k.indexOf('maplibregl-') === 0);
  el.className = keep.concat(cls.split(' ')).join(' ');
}
function _clientEl(c) {
  const el = document.createElement('div');
  el.addEventListener('click', e => { e.stopPropagation(); mapSelect('client', c.id); });
  _styleClient(el, c);
  return el;
}
function _styleClient(el, c) {
  const att = _attention(c);
  const kind = att === 'bad' ? 'bad' : att === 'warn' ? 'warn' : c.status === 'trial' ? 'trial' : 'client';
  const sel = _M.sel && _M.sel.type === 'client' && _M.sel.id === c.id ? ' sel' : '';
  const on = _clientOnline(c);
  _setCls(el, `pin pin-client k-${kind}${sel}`);
  el.innerHTML = `<div class="pin-bubble"><b>${esc(c.business_name)}</b><span class="${on ? 'on' : 'off'}"><i></i>${on ? 'Online' : c.devices ? 'Offline' : 'No devices'}</span><u>›</u></div>
    <div class="pin-head">${att ? _SVG.bang : _SVG.shop}</div><div class="pin-tail"></div><div class="pin-ring"></div>`;
}
function _deviceEl(d) {
  const el = document.createElement('div');
  el.addEventListener('click', e => { e.stopPropagation(); mapSelect('device', d.id); });
  _styleDevice(el, d);
  return el;
}
function _styleDevice(el, d) {
  const fr = _fr(d); const sel = _M.sel && _M.sel.type === 'device' && _M.sel.id === d.id ? ' sel' : '';
  _setCls(el, `pin pin-dev fr-${fr}${d.away ? ' away' : ''}${sel}`);
  el.innerHTML = `<div class="pin-bubble"><b>${esc(imsDeviceLabel(d))}</b><span class="${fr === 'live' ? 'on' : 'off'}"><i></i>${d.lost ? 'Lost' : fr === 'live' ? 'Live' : _ago(_age(d))}</span><u>›</u></div>
    <div class="dev-core">${fr === 'lost' ? _SVG.warn : _SVG.phone}</div><div class="dev-ripple"></div><div class="dev-ripple r2"></div>`;
}

// Create, move or remove markers so they match the latest data
function _applyData() {
  const m = _M.map;
  const seenC = {}, seenD = {};
  _M.data.clients.forEach(c => {
    if (c.lat === null) return; seenC[c.id] = 1;
    let mk = _M.mk.client[c.id];
    if (!mk) { mk = new maplibregl.Marker({ element: _clientEl(c), anchor: 'bottom', offset: [0, 13], draggable: false }).setLngLat([c.lng, c.lat]).addTo(m); _M.mk.client[c.id] = mk; _pop(mk); }
    else { _styleClient(mk.getElement(), c); _glide(mk, [c.lng, c.lat]); }
  });
  _M.data.devices.forEach(d => {
    if (d.lat === null) return; seenD[d.id] = 1;
    let mk = _M.mk.device[d.id];
    if (!mk) { mk = new maplibregl.Marker({ element: _deviceEl(d), anchor: 'center' }).setLngLat([d.lng, d.lat]).addTo(m); _M.mk.device[d.id] = mk; _pop(mk); }
    else { _styleDevice(mk.getElement(), d); _glide(mk, [d.lng, d.lat]); }
  });
  Object.keys(_M.mk.client).forEach(id => { if (!seenC[id]) { _M.mk.client[id].remove(); delete _M.mk.client[id]; } });
  Object.keys(_M.mk.device).forEach(id => { if (!seenD[id]) { _M.mk.device[id].remove(); delete _M.mk.device[id]; } });
  _drawAlerts(); _cluster(); _scheduleInsights();
}
function _pop(mk) { const el = mk.getElement(); el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 900); }
// Slide a marker to its new spot instead of jumping
function _glide(mk, to) {
  const from = mk.getLngLat();
  if (Math.abs(from.lng - to[0]) < 1e-7 && Math.abs(from.lat - to[1]) < 1e-7) return;
  const t0 = performance.now(), dur = 1400;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    mk.setLngLat([from.lng + (to[0] - from.lng) * e, from.lat + (to[1] - from.lat) * e]);
    if (k < 1) requestAnimationFrame(step); else _clusterSoon();
  };
  requestAnimationFrame(step);
  const el = mk.getElement(); el.classList.add('moved'); setTimeout(() => el.classList.remove('moved'), 1800);
}

// When zoomed far out, nearby pins merge into numbered bubbles
let _clTimer = null;
function _clusterSoon() { clearTimeout(_clTimer); _clTimer = setTimeout(_cluster, 120); }
function _cluster() {
  const m = _M.map; if (!m) return;
  _M.clusters.forEach(c => c.remove()); _M.clusters = [];
  const z = m.getZoom();
  const all = [];
  Object.keys(_M.mk.client).forEach(id => all.push({ type: 'client', id: +id, mk: _M.mk.client[id], on: _M.on.clients }));
  Object.keys(_M.mk.device).forEach(id => all.push({ type: 'device', id: +id, mk: _M.mk.device[id], on: _M.on.devices }));
  const cells = {};
  all.forEach(a => {
    const el = a.mk.getElement();
    const selected = _M.sel && _M.sel.type === a.type && _M.sel.id === a.id;
    if (!a.on) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (z >= 11 || selected) return;
    const p = m.project(a.mk.getLngLat()); const k = Math.floor(p.x / 64) + ',' + Math.floor(p.y / 64);
    (cells[k] = cells[k] || []).push(a);
  });
  Object.keys(cells).forEach(k => {
    const g = cells[k]; if (g.length < 2) return;
    g.forEach(a => a.mk.getElement().style.display = 'none');
    const lng = g.reduce((s, a) => s + a.mk.getLngLat().lng, 0) / g.length, lat = g.reduce((s, a) => s + a.mk.getLngLat().lat, 0) / g.length;
    const nDev = g.filter(a => a.type === 'device').length, el = document.createElement('div');
    el.className = 'pin-cluster ' + (nDev > g.length / 2 ? 'dv' : 'cl');
    el.innerHTML = `<span>${g.length}</span>`;
    el.addEventListener('click', e => { e.stopPropagation(); m.fitBounds(g.reduce((b, a) => b.extend(a.mk.getLngLat()), new maplibregl.LngLatBounds(g[0].mk.getLngLat(), g[0].mk.getLngLat())), { padding: 90, maxZoom: 14 }); });
    _M.clusters.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m));
  });
}

// Alert zones: a red area around lost devices, a dashed line from "away" devices back to their shop
function _drawAlerts() {
  const src = _M.map && _M.map.getSource('alerts'); if (!src) return;
  const f = [];
  _M.data.devices.forEach(d => {
    if (d.lat === null) return;
    if (d.lost) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [imsCircle(d.lng, d.lat, Math.max((d.accuracy || 0) / 1000, 0.35))] } });
    else if (d.away) { const c = _client(d.clientId); if (c && c.lat !== null) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c.lng, c.lat], [d.lng, d.lat]] } }); }
  });
  src.setData({ type: 'FeatureCollection', features: f });
}
function _drawSelection(extra) {
  const src = _M.map && _M.map.getSource('sel'); if (!src) return;
  const f = extra || [];
  if (_M.sel && !extra) {
    if (_M.sel.type === 'client') { const c = _client(_M.sel.id); if (c && c.lat !== null) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [imsCircle(c.lng, c.lat, c.awayKm)] } }); }
    else if (_M.sel.type === 'device') {
      const d = _device(_M.sel.id);
      if (d && d.lat !== null) {
        if (d.accuracy) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [imsCircle(d.lng, d.lat, d.accuracy / 1000)] } });
        const c = _client(d.clientId); if (c && c.lat !== null) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c.lng, c.lat], [d.lng, d.lat]] } });
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: f });
}

// ── list (left) ───────────────────────────────────
function mapTab(t) {
  _M.tab = t;
  if (t === 'live') { _M.unseen = 0; document.getElementById('liveCount').style.display = 'none'; }
  document.querySelectorAll('.map-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.mt === t));
  _renderList();
}
function mapSearchInput(v) { _M.query = (v || '').trim().toLowerCase(); _renderList(); }
const _match = (...parts) => !_M.query || parts.join(' ').toLowerCase().includes(_M.query);
const _selIs = (type, id) => _M.sel && _M.sel.type === type && _M.sel.id === id ? ' sel' : '';

function _renderList() {
  const el = document.getElementById('mapList'); if (!el) return;
  const d = _M.data; let html = '';
  if (_M.tab === 'clients') {
    const rows = d.clients.filter(c => _match(c.business_name, c.location, c.contact_phone));
    const placed = rows.filter(c => c.lat !== null), unplaced = rows.filter(c => c.lat === null);
    html += placed.map(c => {
      const att = _attention(c);
      return `<div class="ml-item${_selIs('client', c.id)}" onclick="mapSelect('client',${c.id})">
        <span class="ml-dot ${att ? 'att-' + att : 'st-' + c.status}"></span>
        <div class="ml-main"><b>${esc(c.business_name)}</b><span>${esc(c.location || 'No address typed')}</span></div>
        <div class="ml-side">${att ? `<span class="chip ${att === 'bad' ? 'bad' : 'warn'}">${att === 'bad' ? 'Locked' : _daysLeft(c) + ' d left'}</span>` : ''}${c.devices ? `<span class="chip">${c.devices} dev</span>` : ''}</div></div>`;
    }).join('');
    if (unplaced.length) html += `<div class="ml-head">Not on the map yet (${unplaced.length})</div>` + unplaced.map(c => `
      <div class="ml-item warn${_selIs('client', c.id)}" onclick="mapSelect('client',${c.id})"><span class="ml-dot nopos"></span>
        <div class="ml-main"><b>${esc(c.business_name)}</b><span>${esc(c.location || 'No address typed')}</span></div><div class="ml-side"><span class="chip warn">Place</span></div></div>`).join('');
    if (!rows.length) html = '<div class="empty-state">No client matches.</div>';
  } else if (_M.tab === 'devices') {
    const rows = d.devices.filter(x => _match(imsDeviceLabel(x), _clientName(x), x.os, x.browser));
    html = rows.map(x => `<div class="ml-item${_selIs('device', x.id)}" onclick="mapSelect('device',${x.id})"><span class="ml-dot fr-${_fr(x)}"></span>
        <div class="ml-main"><b>${esc(imsDeviceLabel(x))}</b><span>${esc(_clientName(x))} · ${x.lat === null ? 'no position yet' : _ago(_age(x))}</span></div>
        <div class="ml-side">${x.lost ? '<span class="chip bad">Lost</span>' : x.away ? '<span class="chip warn">Away</span>' : ''}</div></div>`).join('') || '<div class="empty-state">No device matches.</div>';
  } else if (_M.tab === 'sites') {
    const rows = d.deployments.filter(x => _match(x.name, x.client_name, x.url));
    html = rows.map(x => `<div class="ml-item" onclick="mapSelect('site',${x.id})"><span class="ml-dot ${x.status === 'live' ? 'fr-live' : 'fr-stale'}"></span>
        <div class="ml-main"><b>${esc(x.name)}</b><span>${esc(x.client_name)} · ${esc(x.product_name)}</span></div>
        <div class="ml-side"><span class="chip ${x.status === 'live' ? '' : 'warn'}">${x.status === 'live' ? 'Live' : 'Paused'}</span></div></div>`).join('')
      || '<div class="empty-state">No websites registered yet. Add them under Products &amp; updates.</div>';
  } else {
    html = _M.events.length ? _M.events.map(e => `<div class="ev ev-${e.kind}"><span class="ev-t">${e.t.toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span>${esc(e.text)}</span></div>`).join('')
      : '<div class="empty-state">Quiet for now. New clients, devices, moves and alerts show up here the moment they happen, with no refresh needed.</div>';
  }
  if (_M.places && _M.query && _M.tab !== 'live') html = _M.places + html;
  el.innerHTML = html;
}

// ── selection + detail card ───────────────────────
function mapSelect(type, id, opts) {
  opts = opts || { fly: true };
  _stopPlacing(); _clearTrail();
  _M.sel = { type, id };
  const card = document.getElementById('mapDetail'); let html = '', ll = null;
  if (type === 'client') { const c = _client(id); if (!c) return; html = _clientCard(c); if (c.lat !== null) ll = [c.lng, c.lat]; }
  else if (type === 'device') { const d = _device(id); if (!d) return; html = _deviceCard(d); if (d.lat !== null) ll = [d.lng, d.lat]; }
  else { const s = _M.data.deployments.find(x => x.id === id); if (!s) return; html = _siteCard(s); const c = _client(s.client_id); if (c && c.lat !== null) ll = [c.lng, c.lat]; }
  card.innerHTML = html; card.style.display = 'block';
  document.getElementById('mapLegend').classList.add('closed');
  _drawSelection();
  Object.keys(_M.mk.client).forEach(k => _styleClient(_M.mk.client[k].getElement(), _client(+k)));
  Object.keys(_M.mk.device).forEach(k => _styleDevice(_M.mk.device[k].getElement(), _device(+k)));
  _cluster(); _renderList();
  if (ll && opts.fly !== false) _M.map.flyTo({ center: ll, zoom: Math.max(_M.map.getZoom(), type === 'site' ? 13 : 16), pitch: _M.pitch3d ? 58 : _M.map.getPitch(), speed: .9, essential: true });
  _scheduleInsights();
}
function mapClose() {
  _M.sel = null; _clearTrail();
  document.getElementById('mapDetail').style.display = 'none';
  document.getElementById('mapLegend').classList.remove('closed');
  _drawSelection();
  Object.keys(_M.mk.client).forEach(k => _styleClient(_M.mk.client[k].getElement(), _client(+k)));
  Object.keys(_M.mk.device).forEach(k => _styleDevice(_M.mk.device[k].getElement(), _device(+k)));
  _cluster(); _renderList(); _scheduleInsights();
}
const _row = (k, v) => v === '' || v === null || v === undefined ? '' : `<div class="dr"><span>${k}</span><b>${v}</b></div>`;

function _clientCard(c) {
  const devs = _M.data.devices.filter(d => d.clientId === c.id), placed = c.lat !== null, att = _attention(c), dl = _daysLeft(c);
  return `
    <div class="md-head">
      <div class="md-ico k-${att === 'bad' ? 'bad' : att === 'warn' ? 'warn' : c.status === 'trial' ? 'trial' : 'client'}">${_SVG.shop}</div>
      <div class="md-title"><b>${esc(c.business_name)}</b><span><span class="badge badge-${c.status === 'active' ? 'green' : c.status === 'trial' ? 'blue' : c.status === 'expired' ? 'red' : 'gray'}">${_ST[c.status] || c.status}</span> ${esc(c.product_name || '')}</span></div>
      <button class="md-x" onclick="mapClose()" aria-label="Close">×</button>
    </div>
    <div class="md-body">
      ${att ? `<div class="md-alert ${att === 'bad' ? 'bad' : ''}">${att === 'bad' ? 'Subscription ended. The app is locked until a payment is recorded.' : `Subscription ends in ${dl} day${dl === 1 ? '' : 's'}. Record a payment to renew.`}</div>` : ''}
      ${_row('Address', esc(c.location || 'Not typed yet'))}
      ${placed ? _row('Position', `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`) : ''}
      ${_row('Phone', c.contact_phone ? `<a href="tel:${esc(c.contact_phone)}">${esc(c.contact_phone)}</a>` : '')}
      ${_row('Email', c.contact_email ? `<a href="mailto:${esc(c.contact_email)}">${esc(c.contact_email)}</a>` : '')}
      ${_row('Plan', esc(c.plan_name || ''))}
      ${_row('Ends', c.expiry_date ? fmtDate(c.expiry_date) : '')}
      ${_row('Location tracking', c.trackingConsent ? '<span class="t-on">On: devices share their position</span>' : '<span class="t-off">Off: client has not agreed</span>')}
      ${devs.length ? `<div class="md-sub">Devices (${devs.length})</div>` + devs.map(d => `
        <div class="md-dev" onclick="mapSelect('device',${d.id})"><span class="ml-dot fr-${_fr(d)}"></span><b>${esc(imsDeviceLabel(d))}</b><span>${d.lat === null ? 'no position' : _ago(_age(d)) + (d.distanceKm !== null ? ' · ' + _fmtKm(d.distanceKm) : '')}</span></div>`).join('') : ''}
      <div id="mdFind"></div>
    </div>
    <div class="md-actions">
      ${placed ? `<a class="btn btn-primary btn-sm" href="${_gDir(c.lat, c.lng)}" target="_blank" rel="noopener">${ico('map')}Directions</a>
        <a class="btn btn-ghost btn-sm" href="${_gOpen(c.lat, c.lng)}" target="_blank" rel="noopener">Google Maps</a>
        <button class="btn btn-ghost btn-sm" onclick="mapMovePin(${c.id})">Move pin</button>
        <button class="btn btn-ghost btn-sm" onclick="mapCopy('${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}')">Copy position</button>`
      : `<button class="btn btn-primary btn-sm" onclick="mapFindAddress(${c.id})">Find "${esc((c.location || '').slice(0, 22))}"</button>
        <button class="btn btn-ghost btn-sm" onclick="mapPlaceStart(${c.id})">Click the map</button>`}
      <button class="btn btn-ghost btn-sm" onclick="showPage('clients')">Open client</button>
      <button class="btn btn-green btn-sm" onclick="showRecordPayment(${c.id})">Record payment</button>
    </div>`;
}

function _deviceCard(d) {
  const c = _client(d.clientId), hasPos = d.lat !== null, fr = _fr(d);
  return `
    <div class="md-head">
      <div class="md-ico fr-${fr}">${fr === 'lost' ? _SVG.warn : _SVG.phone}</div>
      <div class="md-title"><b>${esc(imsDeviceLabel(d))}</b><span>${esc(_clientName(d))}</span></div>
      <button class="md-x" onclick="mapClose()" aria-label="Close">×</button>
    </div>
    <div class="md-body">
      <div class="md-state fr-${fr}">${d.lost ? 'Marked lost' : _FR[fr]}${hasPos ? ' · ' + _ago(_age(d)) : ''}</div>
      ${d.away ? `<div class="md-alert">${_fmtKm(d.distanceKm)} from the business. Outside its ${c.awayKm} km area.</div>` : ''}
      ${d.lost && d.lost_note ? `<div class="md-alert bad">${esc(d.lost_note)}</div>` : ''}
      ${hasPos ? _row('Position', `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`) : '<div class="md-alert info">This device has not sent a position yet. ' + (c && c.trackingConsent ? 'It will after it next connects.' : 'Location tracking is off for this client.') + '</div>'}
      ${_row('Accuracy', d.accuracy ? '± ' + d.accuracy + ' m' : '')}
      ${_row('From business', d.distanceKm !== null ? _fmtKm(d.distanceKm) : '')}
      ${_row('Source', d.source ? ({ gps: 'GPS', wifi: 'Wi-Fi', ip: 'Internet address' })[d.source] || d.source : '')}
      ${_row('Battery', d.battery !== null ? d.battery + '%' : '')}
      ${_row('System', esc([d.os, d.browser].filter(Boolean).join(' · ') || imsDeviceLabel(d)))}
      ${_row('Product version', esc(d.app_version || ''))}
      ${_row('Last contact', d.last_sync ? fmtDateTime(d.last_sync) : 'Never')}
      ${_row('Internet address', esc(d.last_ip || ''))}
      ${_row('Status', statusBadge(d.status))}
    </div>
    <div class="md-actions">
      ${hasPos ? `<a class="btn btn-primary btn-sm" href="${_gDir(d.lat, d.lng)}" target="_blank" rel="noopener">${ico('map')}Directions</a>
        <button class="btn btn-ghost btn-sm" onclick="mapTrail(${d.id},24)">Trail 24 h</button>
        <button class="btn btn-ghost btn-sm" onclick="mapTrail(${d.id},168)">7 days</button>
        <a class="btn btn-ghost btn-sm" href="${_gOpen(d.lat, d.lng)}" target="_blank" rel="noopener">Google Maps</a>
        <button class="btn btn-ghost btn-sm" onclick="mapCopy('${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}')">Copy position</button>` : ''}
      ${d.lost ? `<button class="btn btn-green btn-sm" onclick="mapLost(${d.id},false)">Mark as found</button>` : `<button class="btn btn-red btn-sm" onclick="mapLost(${d.id},true)">Mark as lost</button>`}
      ${d.status === 'approved' ? `<button class="btn btn-ghost btn-sm" onclick="mapBlock(${d.id})">Block device</button>` : ''}
    </div>`;
}

function _siteCard(s) {
  const c = _client(s.client_id);
  return `
    <div class="md-head">
      <div class="md-ico fr-${s.status === 'live' ? 'live' : 'stale'}">${_SVG.globe}</div>
      <div class="md-title"><b>${esc(s.name)}</b><span>${esc(s.product_name)} for ${esc(s.client_name)}</span></div>
      <button class="md-x" onclick="mapClose()" aria-label="Close">×</button>
    </div>
    <div class="md-body">
      ${_row('Status', s.status === 'live' ? '<span class="badge badge-green">Live</span>' : '<span class="badge badge-orange">Paused by us</span>')}
      ${_row('Address', s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : '')}
      ${_row('Client location', c ? esc(c.location || '') : '')}
      ${_row('Version', esc(s.version || ''))}
      ${_row('Last check', s.last_check ? fmtDateTime(s.last_check) + (s.last_http ? ` · HTTP ${s.last_http} · ${s.last_ms} ms` : '') : 'Not checked yet')}
      ${_row('Last seen by guard', s.last_seen ? fmtDateTime(s.last_seen) : '')}
    </div>
    <div class="md-actions">
      ${c && c.lat !== null ? `<button class="btn btn-ghost btn-sm" onclick="mapSelect('client',${c.id})">Show client</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="showPage('products')">Manage</button>
    </div>`;
}

// ── area insights: what is around the selected place ──
function _scheduleInsights() { clearTimeout(_M.insightTimer); _M.insightTimer = setTimeout(_insights, 500); }
function _insights() {
  const box = document.getElementById('mapInsights'), m = _M.map;
  if (!box || !m || !_M.ready || _M.style !== 'dark' || _currentPage !== 'map') { if (box) box.style.display = 'none'; return; }
  let center = m.getCenter(), title = null;
  if (_M.sel) {
    const e = _M.sel.type === 'client' ? _client(_M.sel.id) : _M.sel.type === 'device' ? _device(_M.sel.id) : null;
    const p = e && (_M.sel.type === 'client' ? [e.lng, e.lat] : [e.lng, e.lat]);
    if (p && p[0] !== null) { center = { lng: p[0], lat: p[1] }; title = _M.sel.type === 'client' ? e.business_name : _clientName(e); }
  }
  box.style.display = 'block';
  if (m.getZoom() < 13) {
    box.innerHTML = `<div class="ai-head"><svg class="ic ic-sm"><use href="#i-chart"/></svg><b>Area insights</b></div><div class="ai-note">Zoom in to a neighbourhood, or pick a client, to see what is around it.</div>`;
    return;
  }
  const R = 1, here = [center.lat, center.lng], seen = {}, g = { comp: 0, hotel: 0, fuel: 0, health: 0, bank: 0 };
  const fc = m.querySourceFeatures('omt', { sourceLayer: 'poi' });
  fc.forEach(f => {
    const c = f.properties.class; const [lng, lat] = f.geometry.coordinates || [];
    if (lng === undefined || _km(here, [lat, lng]) > R) return;
    const key = (f.properties.name || '') + '|' + Math.round(lng * 1e4) + '|' + Math.round(lat * 1e4);
    if (seen[key]) return; seen[key] = 1;
    if (['bar', 'restaurant', 'fast_food', 'cafe', 'pub', 'biergarten', 'nightclub'].includes(c)) g.comp++;
    else if (['lodging', 'hotel', 'hostel', 'guest_house'].includes(c)) g.hotel++;
    else if (c === 'fuel') g.fuel++;
    else if (['hospital', 'pharmacy', 'doctors', 'clinic'].includes(c)) g.health++;
    else if (['bank', 'atm'].includes(c)) g.bank++;
  });
  let area = title;
  if (!area) {
    const pl = m.querySourceFeatures('omt', { sourceLayer: 'place' }).filter(f => f.geometry.type === 'Point' && f.properties.name)
      .map(f => ({ n: f.properties.name_en || f.properties.name, d: _km(here, [f.geometry.coordinates[1], f.geometry.coordinates[0]]) })).sort((a, b) => a.d - b.d)[0];
    area = pl ? pl.n : 'This area';
  }
  const ours = _M.data.devices.filter(d => d.lat !== null && _km(here, [d.lat, d.lng]) <= R).length;
  const oursC = _M.data.clients.filter(c => c.lat !== null && _km(here, [c.lat, c.lng]) <= R).length;
  const row = (c, n, l) => `<div class="ai-row"><i style="--c:${c}"></i><span>${l}</span><b>${n}</b></div>`;
  box.innerHTML = `<div class="ai-head"><svg class="ic ic-sm"><use href="#i-chart"/></svg><b>Area insights</b><small>within ${R} km</small></div>
    <div class="ai-area">${esc(area)}</div>
    ${row(IMS_C.client, oursC, 'Our clients')}${row(IMS_C.live, ours, 'Our devices')}
    <div class="ai-sep"></div>
    ${row(IMS_C.comp, g.comp, 'Bars &amp; restaurants (competition)')}${row(IMS_C.hotel, g.hotel, 'Hotels &amp; lodges')}${row(IMS_C.fuel, g.fuel, 'Fuel stations')}${row(IMS_C.health, g.health, 'Health')}${row(IMS_C.bank, g.bank, 'Banks &amp; ATMs')}
    <div class="ai-note">Counted from OpenStreetMap places currently on screen.</div>`;
}

// ── actions ───────────────────────────────────────
const mapCopy = t => navigator.clipboard.writeText(t).then(() => toast('Position copied')).catch(() => toast('Could not copy', 'error'));
function _clearTrail() { const s = _M.map && _M.map.getSource('trail'); if (s) s.setData({ type: 'FeatureCollection', features: [] }); }

async function mapTrail(id, hours) {
  const res = await apiGet('track', 'history', { deviceId: id, hours });
  const pts = res.data || [];
  if (pts.length < 2) { toast('No trail yet. The device needs to report from a few different places.', 'info'); return; }
  const line = pts.map(p => [p.lng, p.lat]);
  const feats = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }]
    .concat(pts.map((p, i) => ({ type: 'Feature', properties: { start: i === 0, end: i === pts.length - 1 }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })));
  _M.map.getSource('trail').setData({ type: 'FeatureCollection', features: feats });
  _M.map.fitBounds(line.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(line[0], line[0])), { padding: 120, maxZoom: 17 });
  toast(`${pts.length} positions over the last ${hours >= 48 ? hours / 24 + ' days' : hours + ' hours'}`, 'success');
}

function mapLost(id, lost) {
  const d = _device(id);
  if (!lost) { api('track', 'set_lost', { deviceId: id, lost: false }).then(r => { toast(r.ok ? 'Marked as found. The device works normally again.' : (r.error || 'Failed'), r.ok ? 'success' : 'error'); _fetchOverview(); }); return; }
  openModal('Mark device as lost',
    `<div class="alert alert-orange"><div>The device shows a lock message the next time it connects, so nobody can use the product on it. Its position keeps updating here.</div></div>
     <div class="form-group"><label class="form-label">Message shown on the device</label>
     <textarea class="form-input" id="lostNote" rows="3">${esc('This device was reported lost. Please call ' + ((_client(d.clientId) || {}).contact_phone || 'IMS support') + ' to return it.')}</textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="mapLostSave(${id})">Mark as lost</button>`);
}
async function mapLostSave(id) {
  const r = await api('track', 'set_lost', { deviceId: id, lost: true, note: document.getElementById('lostNote').value.trim() });
  closeModal(); toast(r.ok ? 'Marked as lost. It locks on its next connection.' : (r.error || 'Failed'), r.ok ? 'success' : 'error'); _fetchOverview();
}
async function mapBlock(id) { if (typeof blockDevice === 'function') { await blockDevice(id); _fetchOverview(); } }

// ── placing a client on the map ───────────────────
async function mapFindAddress(id) {
  const c = _client(id), box = document.getElementById('mdFind');
  if (!c.location) { toast('Type the client address first (Clients → Edit).', 'warning'); return; }
  box.innerHTML = '<div class="md-sub">Searching…</div>';
  let res = await apiGet('track', 'geocode', { q: c.location, cc: 'rw' });
  if (res.ok && !(res.data || []).length) res = await apiGet('track', 'geocode', { q: c.location });
  if (!res.ok) { box.innerHTML = `<div class="md-alert bad">${esc(res.error)}</div>`; return; }
  _M.cands = res.data || [];
  box.innerHTML = _M.cands.length ? `<div class="md-sub">Pick the right place</div>` + _M.cands.map((r, i) => `
    <div class="md-dev" onclick="mapUseCandidate(${id},${i})"><b>${esc((r.display_name || '').split(',').slice(0, 2).join(','))}</b><span>${esc((r.display_name || '').split(',').slice(2, 4).join(','))}</span></div>`).join('')
    : '<div class="md-alert info">No match for that address. Use "Click the map" to place it by hand.</div>';
}
async function mapUseCandidate(id, i) { const r = _M.cands[i]; if (r) await _saveClientPos(id, parseFloat(r.lat), parseFloat(r.lon)); }
function mapPlaceStart(id) {
  _M.placing = id;
  const h = document.getElementById('mapHint'); h.textContent = 'Click the map where the business is. Press Esc to cancel.'; h.style.display = 'block';
  document.getElementById('mainMap').classList.add('placing');
}
function _stopPlacing() {
  _M.placing = null;
  const h = document.getElementById('mapHint'); if (h) h.style.display = 'none';
  const m = document.getElementById('mainMap'); if (m) m.classList.remove('placing');
}
async function _placeAt(lat, lng) { const id = _M.placing; _stopPlacing(); if (id) await _saveClientPos(id, lat, lng); }
async function _saveClientPos(id, lat, lng) {
  const r = await api('track', 'set_client_location', { id, lat, lng });
  if (!r.ok) { toast(r.error || 'Could not save the position', 'error'); return; }
  toast('Business placed on the map');
  await _fetchOverview(); mapSelect('client', id);
}
function mapMovePin(id) {
  const mk = _M.mk.client[id]; if (!mk) return;
  mk.setDraggable(true);
  const h = document.getElementById('mapHint'); h.textContent = 'Drag the pin to the right spot. It saves when you let go.'; h.style.display = 'block';
  mk.once('dragend', async () => { h.style.display = 'none'; mk.setDraggable(false); const p = mk.getLngLat(); await _saveClientPos(id, p.lat, p.lng); });
}

// ── search for any place in the region ────────────
async function mapSearchGo() {
  const q = document.getElementById('mapSearch').value.trim(); if (q.length < 3) return;
  let res = await apiGet('track', 'geocode', { q, cc: 'rw,ug,ke,tz,bi,cd,et,ss,so,dj,er' });
  if (res.ok && !(res.data || []).length) res = await apiGet('track', 'geocode', { q });
  if (!res.ok) { toast(res.error, 'error'); return; }
  const rows = res.data || []; _M.placeRows = rows;
  _M.places = rows.length ? `<div class="ml-head">Places</div>` + rows.map((r, i) => `
    <div class="ml-item" onclick="mapGoPlace(${i})"><span class="ml-dot nopos"></span><div class="ml-main"><b>${esc((r.display_name || '').split(',')[0])}</b><span>${esc((r.display_name || '').split(',').slice(1, 4).join(','))}</span></div></div>`).join('') : '';
  if (rows.length) mapGoPlace(0); else toast('No place found', 'info');
  _renderList();
}
function mapGoPlace(i) {
  const r = _M.placeRows[i]; if (!r) return;
  const ll = [parseFloat(r.lon), parseFloat(r.lat)];
  if (_M.placeMk) _M.placeMk.remove();
  const el = document.createElement('div'); el.className = 'pin-place'; el.innerHTML = `<span>${esc((r.display_name || '').split(',')[0])}</span><i></i>`;
  _M.placeMk = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 7] }).setLngLat(ll).addTo(_M.map);
  _M.map.flyTo({ center: ll, zoom: r.boundingbox && (r.type === 'country' || r.type === 'administrative') ? 8 : 16, speed: .9 });
}

// ── view controls ─────────────────────────────────
function mapRegion(key) {
  const r = IMS_REGIONS[key]; if (!r) return;
  document.getElementById('regionMenu').style.display = 'none';
  document.querySelectorAll('#regionSeg button[data-r]').forEach(b => b.classList.toggle('on', b.dataset.r === key));
  _M.map.fitBounds(r.bounds, { padding: key === 'east' ? 10 : 30, pitch: 0, bearing: 0, duration: 1400 });
  _M.pitch3d = false; document.getElementById('tiltTxt').classList.remove('on');
}
function mapRegionMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('regionMenu');
  if (menu.style.display === 'block') { menu.style.display = 'none'; return; }
  menu.innerHTML = ['uganda', 'kenya', 'tanzania', 'burundi', 'drc'].map(k => `<button onclick="mapRegion('${k}')">${IMS_REGIONS[k].label}</button>`).join('');
  menu.style.display = 'block';
  setTimeout(() => document.addEventListener('click', () => menu.style.display = 'none', { once: true }), 0);
}
function mapFitAll() {
  const pts = [];
  _M.data.clients.forEach(c => { if (c.lat !== null && _M.on.clients) pts.push([c.lng, c.lat]); });
  _M.data.devices.forEach(d => { if (d.lat !== null && _M.on.devices) pts.push([d.lng, d.lat]); });
  if (!pts.length) { mapRegion('rwanda'); toast('Nothing is placed on the map yet', 'info'); return; }
  _M.map.fitBounds(pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: 110, maxZoom: 16, duration: 1200 });
}
function mapZoom(d) { _M.map.easeTo({ zoom: _M.map.getZoom() + d, duration: 300 }); }
function mapTilt() {
  _M.pitch3d = !_M.pitch3d;
  document.getElementById('tiltTxt').classList.toggle('on', _M.pitch3d);
  _M.map.easeTo({ pitch: _M.pitch3d ? 60 : 0, bearing: _M.pitch3d ? -20 : 0, zoom: _M.pitch3d ? Math.max(_M.map.getZoom(), 15) : _M.map.getZoom(), duration: 900 });
}
function mapLocateMe() {
  if (!navigator.geolocation) { toast('This browser cannot give your location', 'warning'); return; }
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.longitude, p.coords.latitude];
    if (_M.me) _M.me.remove();
    const el = document.createElement('div'); el.className = 'pin-me';
    _M.me = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(_M.map);
    _M.map.flyTo({ center: ll, zoom: 15 });
  }, () => toast('Allow location access in your browser to use this', 'warning'), { enableHighAccuracy: true, timeout: 8000 });
}
function mapFullscreen() {
  const el = document.getElementById('mapShell');
  if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen();
  setTimeout(() => _M.map && _M.map.resize(), 300);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _M.placing) _stopPlacing(); });

// ── dashboard mini map ────────────────────────────
function initDashMap(clients, devices) {
  const el = document.getElementById('dashMapContainer');
  if (!el || typeof maplibregl === 'undefined') return;
  if (_dashMap) { _dashMap.remove(); _dashMap = null; }
  const feats = [];
  (clients || []).forEach(c => { if (c.lat !== null && c.lat !== undefined) feats.push({ type: 'Feature', properties: { k: 'c', s: c.status }, geometry: { type: 'Point', coordinates: [+c.lng, +c.lat] } }); });
  (devices || []).forEach(d => { if (d.last_lat !== null && d.last_lat !== undefined) feats.push({ type: 'Feature', properties: { k: 'd' }, geometry: { type: 'Point', coordinates: [+d.last_lng, +d.last_lat] } }); });
  _dashMap = new maplibregl.Map({ container: el, style: imsDarkStyle(), interactive: false, attributionControl: false, bounds: IMS_REGIONS.rwanda.bounds, fitBoundsOptions: { padding: 8 } });
  _dashMap.on('load', () => {
    imsAddFocusCountry(_dashMap, 'Rwanda');
    _dashMap.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    _dashMap.addLayer({ id: 'p-glow', type: 'circle', source: 'pts', paint: { 'circle-radius': ['case', ['==', ['get', 'k'], 'c'], 13, 8], 'circle-blur': 1, 'circle-opacity': .5, 'circle-color': ['case', ['==', ['get', 'k'], 'd'], '#22d3ee', ['match', ['get', 's'], 'active', '#3b82f6', 'trial', '#8b5cf6', '#ef4444']] } });
    _dashMap.addLayer({ id: 'p-dot', type: 'circle', source: 'pts', paint: { 'circle-radius': ['case', ['==', ['get', 'k'], 'c'], 6, 3.5], 'circle-stroke-color': '#040816', 'circle-stroke-width': 1.5, 'circle-color': ['case', ['==', ['get', 'k'], 'd'], '#22d3ee', ['match', ['get', 's'], 'active', '#3b82f6', 'trial', '#8b5cf6', '#ef4444']] } });
    if (feats.length > 1) {
      const b = feats.reduce((bb, f) => bb.extend(f.geometry.coordinates), new maplibregl.LngLatBounds(feats[0].geometry.coordinates, feats[0].geometry.coordinates));
      _dashMap.fitBounds(b, { padding: 26, maxZoom: 11, duration: 0 });
    }
  });
}

// ═══ Client form: where is the business? ═══
// Used by Add client / Edit client. Type the address, press Find, then drag the pin to the exact door.
const _GF = {};   // per-form state: { map, marker }
function imsGeoFields(p, c) {
  const lat = c && c.lat !== null && c.lat !== undefined && c.lat !== '' ? Number(c.lat) : '';
  const lng = c && c.lng !== null && c.lng !== undefined && c.lng !== '' ? Number(c.lng) : '';
  const consent = c && Number(c.tracking_consent) === 1;
  const away = c && c.away_km ? Number(c.away_km) : 2;
  return `
  <div class="geo-box">
    <div class="geo-head"><b>Where is the business?</b>
      <button type="button" class="btn btn-ghost btn-sm" onclick="imsGeoFind('${p}')">Find the address on the map</button></div>
    <div class="geo-map" id="${p}GeoMap"></div>
    <div class="geo-note" id="${p}GeoNote">Click the map or drag the pin to the exact spot. Devices are measured against this position.</div>
    <div class="form-row cols-2" style="margin-top:8px">
      <div class="form-group" style="margin:0"><label class="form-label">Latitude</label><input class="form-input" id="${p}Lat" value="${lat}" placeholder="-1.9441" inputmode="decimal" oninput="imsGeoTyped('${p}')"/></div>
      <div class="form-group" style="margin:0"><label class="form-label">Longitude</label><input class="form-input" id="${p}Lng" value="${lng}" placeholder="30.0619" inputmode="decimal" oninput="imsGeoTyped('${p}')"/></div>
    </div>
    <label class="geo-check"><input type="checkbox" id="${p}Consent" ${consent ? 'checked' : ''}/>
      <span><b>Devices share their location with us</b><br>Turn this on only after the client has agreed. It lets us show where their devices are and help find one that is lost.</span></label>
    <div class="form-group" style="margin:8px 0 0"><label class="form-label">Warn me when a device is more than this far from the business (km)</label>
      <input type="number" class="form-input" id="${p}Away" value="${away}" min="1" max="500" style="max-width:120px"/></div>
  </div>`;
}
function imsGeoValues(p) {
  const lat = document.getElementById(p + 'Lat').value.trim(), lng = document.getElementById(p + 'Lng').value.trim();
  return { lat, lng, geoSource: 'manual', trackingConsent: document.getElementById(p + 'Consent').checked, awayKm: parseInt(document.getElementById(p + 'Away').value, 10) || 2 };
}
function imsGeoInit(p, c, addressInputId) {
  setTimeout(() => {
    const el = document.getElementById(p + 'GeoMap');
    if (!el || typeof L === 'undefined') return;
    const st = _GF[p] = { addr: addressInputId, map: null, marker: null };
    const lat = parseFloat(document.getElementById(p + 'Lat').value), lng = parseFloat(document.getElementById(p + 'Lng').value);
    const has = !isNaN(lat) && !isNaN(lng);
    st.map = L.map(el, { zoomControl: true, attributionControl: false }).setView(has ? [lat, lng] : RWANDA_CENTER, has ? 16 : 8);
    L.tileLayer(MAP_TILES.streets.url, { maxZoom: 19 }).addTo(st.map);
    st.map.on('click', e => imsGeoSet(p, e.latlng.lat, e.latlng.lng, true));
    if (has) imsGeoSet(p, lat, lng, false);
    setTimeout(() => st.map.invalidateSize(), 250);
  }, 120);
}
function imsGeoSet(p, lat, lng, fromUser) {
  const st = _GF[p]; if (!st || !st.map) return;
  document.getElementById(p + 'Lat').value = (+lat).toFixed(6);
  document.getElementById(p + 'Lng').value = (+lng).toFixed(6);
  if (!st.marker) {
    st.marker = L.marker([lat, lng], { draggable: true }).addTo(st.map);
    st.marker.on('dragend', e => imsGeoSet(p, e.target.getLatLng().lat, e.target.getLatLng().lng, true));
  } else st.marker.setLatLng([lat, lng]);
  if (fromUser) document.getElementById(p + 'GeoNote').textContent = 'Position saved when you press Save. Drag the pin to adjust it.';
}
function imsGeoTyped(p) {
  const lat = parseFloat(document.getElementById(p + 'Lat').value), lng = parseFloat(document.getElementById(p + 'Lng').value);
  const st = _GF[p];
  if (st && st.map && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    if (!st.marker) imsGeoSet(p, lat, lng, false); else st.marker.setLatLng([lat, lng]);
    st.map.setView([lat, lng], Math.max(st.map.getZoom(), 15));
  }
}
async function imsGeoFind(p) {
  const st = _GF[p]; const q = (document.getElementById(st.addr).value || '').trim();
  const note = document.getElementById(p + 'GeoNote');
  if (q.length < 3) { note.textContent = 'Type the address in the Location box first.'; return; }
  note.textContent = 'Searching…';
  let res = await apiGet('track', 'geocode', { q, cc: 'rw' });
  if (res.ok && !(res.data || []).length) res = await apiGet('track', 'geocode', { q });
  if (!res.ok) { note.textContent = res.error; return; }
  const r = (res.data || [])[0];
  if (!r) { note.textContent = 'No match for that address. Click the map to place the pin by hand.'; return; }
  imsGeoSet(p, parseFloat(r.lat), parseFloat(r.lon), true);
  st.map.setView([parseFloat(r.lat), parseFloat(r.lon)], 16);
  note.textContent = 'Found: ' + (r.display_name || '').split(',').slice(0, 3).join(',') + '. Drag the pin if it is not exactly right.';
}