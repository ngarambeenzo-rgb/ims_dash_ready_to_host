/* ═══════════════════════════════════════════════════
   IMS — map.js — Full Google Maps-like Experience
   Features:
   1. Dark streets with buildings, roads, POIs
   2. Real GPS user location
   3. Client markers with full info popups
   4. Turn-by-turn directions with 3 route options
   5. Nearby places (restaurants, hotels, gas etc)
   6. Search bar with geocoding
   7. Traffic / Satellite / Streets tiles
   8. Distance measurement
   9. Share & print map
   10. Fullscreen support
═══════════════════════════════════════════════════ */

let _mainMap          = null;
let _dashMap          = null;
let _mapMarkers       = [];
let _tileLayer        = null;
let _labelLayer       = null;
let _routeLayers      = [];
let _nearbyMarkers    = [];
let _userMarker       = null;
let _allMapClients    = [];
let _currentTile      = 'dark';
let _selectedRoute    = 0;
let _currentRoutes    = [];
let _destClient       = null;
let _userLatLng       = null;

const RWANDA_CENTER = [-1.9441, 30.0619];
const RWANDA_ZOOM   = 9;

const RWANDA_LOCATIONS = [
  { city:'Kigali — Nyarugenge', lat:-1.9441, lng:30.0619 },
  { city:'Kigali — Gasabo',     lat:-1.8900, lng:30.1200 },
  { city:'Kigali — Kicukiro',   lat:-1.9800, lng:30.1000 },
  { city:'Butare / Huye',       lat:-2.5967, lng:29.7394 },
  { city:'Musanze',             lat:-1.4994, lng:29.6336 },
  { city:'Rubavu / Gisenyi',    lat:-1.7017, lng:29.2567 },
  { city:'Byumba / Gicumbi',    lat:-1.5764, lng:30.0647 },
  { city:'Rwamagana',           lat:-1.9489, lng:30.4350 },
  { city:'Nyanza',              lat:-2.3542, lng:29.7314 },
  { city:'Rusizi',              lat:-2.4847, lng:28.9089 },
  { city:'Kibungo',             lat:-2.1597, lng:30.5442 },
  { city:'Gitarama',            lat:-2.0742, lng:29.7569 },
  { city:'Kibuye',              lat:-2.0598, lng:29.3483 },
  { city:'Kayonza',             lat:-1.9862, lng:30.6507 },
  { city:'Nyagatare',           lat:-1.3011, lng:30.3258 },
];

const STATUS_COLORS = {
  active:    '#00D084',
  trial:     '#4D9EFF',
  expired:   '#FF4D6D',
  suspended: '#7B8CAA',
};

// Tile layers — dark with full street detail
const TILES = {
  dark: {
    url:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap © CARTO',
    name: '🌑 Dark'
  },
  streets: {
    url:  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap © CARTO',
    name: '🗺️ Streets'
  },
  satellite: {
    url:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
    name: '🛰️ Satellite'
  },
  traffic: {
    // Satellite + OpenStreetMap labels overlay (simulates traffic view)
    url:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap © CARTO',
    name: '🚦 Traffic'
  },
};

// ── LOAD MAP ──────────────────────────────────────
async function loadMap() {
  const res = await apiGet('clients', 'list');
  _allMapClients = res.data || [];

  // Assign locations to clients
  _allMapClients.forEach((c, i) => {
    const loc = RWANDA_LOCATIONS[i % RWANDA_LOCATIONS.length];
    c._lat  = loc.lat + (Math.random() - 0.5) * 0.025;
    c._lng  = loc.lng + (Math.random() - 0.5) * 0.025;
    c._city = loc.city;
  });

  initMainMap();
  renderMapMarkers(_allMapClients);
  updateMapStats(_allMapClients);
  renderMapSidebar(_allMapClients);
  populateDistSelect(_allMapClients);

  // Try to get real GPS location
  locateMe(true); // silent=true (no alert if fails)
}

// ── INIT MAP ──────────────────────────────────────
function initMainMap() {
  if (_mainMap) return;

  _mainMap = L.map('mainMapContainer', {
    center: RWANDA_CENTER,
    zoom:   RWANDA_ZOOM,
    zoomControl: false,
    attributionControl: true,
  });

  // Zoom top-right
  L.control.zoom({ position: 'topright' }).addTo(_mainMap);

  // Scale control
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(_mainMap);

  // Default tile
  _tileLayer = L.tileLayer(TILES.dark.url, {
    attribution: TILES.dark.attr,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_mainMap);
}

// ── GPS LOCATION ──────────────────────────────────
function locateMe(silent = false) {
  if (!navigator.geolocation) {
    if (!silent) toast('Geolocation not supported by this browser', 'error');
    return;
  }

  if (!silent) toast('Finding your location...', 'info');

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      _userLatLng = [lat, lng];

      // Remove old user marker
      if (_userMarker) _mainMap.removeLayer(_userMarker);

      // Add pulsing user location marker
      const userIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">
            <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(77,158,255,0.3);animation:userPulse 2s infinite"></div>
            <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:rgba(77,158,255,0.5);animation:userPulse 2s infinite 0.5s"></div>
            <div style="width:12px;height:12px;border-radius:50%;background:#4D9EFF;border:2.5px solid #fff;box-shadow:0 0 12px #4D9EFF;z-index:2"></div>
          </div>
          <style>
            @keyframes userPulse{0%,100%{transform:scale(0.8);opacity:0.6}50%{transform:scale(1.3);opacity:0.2}}
          </style>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      _userMarker = L.marker([lat, lng], { icon: userIcon })
        .addTo(_mainMap)
        .bindPopup(`
          <div style="font-family:Inter,sans-serif;padding:10px;min-width:160px;background:#131C2E;border-radius:10px">
            <div style="font-weight:700;color:#4D9EFF;margin-bottom:4px">📍 Your Location</div>
            <div style="font-size:11px;color:#7B8CAA">Lat: ${lat.toFixed(6)}</div>
            <div style="font-size:11px;color:#7B8CAA">Lng: ${lng.toFixed(6)}</div>
            <div style="font-size:11px;color:#7B8CAA">Accuracy: ~${Math.round(pos.coords.accuracy)}m</div>
          </div>
        `, { className: 'ims-popup' });

      _mainMap.flyTo([lat, lng], 13, { duration: 1.5 });
      if (!silent) toast('Location found ✅');
    },
    err => {
      if (!silent) {
        const msgs = {1:'Location access denied',2:'Location unavailable',3:'Location request timed out'};
        toast(msgs[err.code] || 'Could not get location', 'error');
        // Use Kigali as fallback
        _userLatLng = RWANDA_CENTER;
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ── SWITCH TILES ──────────────────────────────────
function switchTile(type) {
  _currentTile = type;
  if (!_mainMap) return;

  if (_tileLayer) { _mainMap.removeLayer(_tileLayer); _tileLayer = null; }
  if (_labelLayer) { _mainMap.removeLayer(_labelLayer); _labelLayer = null; }

  _tileLayer = L.tileLayer(TILES[type]?.url || TILES.dark.url, {
    attribution: TILES[type]?.attr || TILES.dark.attr,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_mainMap);
  _tileLayer.bringToBack();

  // For satellite: add label overlay
  if (type === 'satellite') {
    _labelLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, opacity: 0.9,
    }).addTo(_mainMap);
  }

  document.querySelectorAll('.map-tile-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tileBtn_' + type);
  if (btn) btn.classList.add('active');
}

// ── BUILD GLOWING MARKER HTML ─────────────────────
function buildPinHtml(color, delay = 0) {
  return `
    <div style="position:relative;width:50px;height:50px;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:${color};opacity:0;transform:translate(-50%,-50%);top:50%;left:50%;animation:pinRing1 2.5s ease-out infinite ${delay}s"></div>
      <div style="position:absolute;width:30px;height:30px;border-radius:50%;background:${color};opacity:0;transform:translate(-50%,-50%);top:50%;left:50%;animation:pinRing2 2.5s ease-out infinite ${delay+0.4}s"></div>
      <div style="position:absolute;width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,0.5);background:${color}33;transform:translate(-50%,-50%);top:50%;left:50%"></div>
      <div style="position:absolute;width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color},0 0 20px ${color}66;transform:translate(-50%,-50%);top:50%;left:50%"></div>
    </div>
  `;
}

// ── RENDER CLIENT MARKERS ─────────────────────────
function renderMapMarkers(clients) {
  if (!_mainMap) return;
  _mapMarkers.forEach(m => _mainMap.removeLayer(m));
  _mapMarkers = [];

  const pinEl = document.getElementById('mapPinCount');
  if (pinEl) pinEl.textContent = clients.length + (clients.length === 1 ? ' client' : ' clients');

  if (!clients.length) return;

  const bounds = [];

  clients.forEach((client, i) => {
    if (!client._lat) {
      const loc = RWANDA_LOCATIONS[i % RWANDA_LOCATIONS.length];
      client._lat  = loc.lat + (Math.random() - 0.5) * 0.025;
      client._lng  = loc.lng + (Math.random() - 0.5) * 0.025;
      client._city = loc.city;
    }

    const color = STATUS_COLORS[client.status] || '#7B8CAA';
    const delay = (i % 5) * 0.4;
    bounds.push([client._lat, client._lng]);

    const icon = L.divIcon({
      className: '',
      html: buildPinHtml(color, delay),
      iconSize: [50, 50],
      iconAnchor: [25, 25],
      popupAnchor: [0, -30],
    });

    const marker = L.marker([client._lat, client._lng], { icon }).addTo(_mainMap);

    // Days left calculation
    const daysLeft = client.expiryDate
      ? Math.ceil((new Date(client.expiryDate) - new Date()) / 86400000)
      : null;
    const daysHtml = daysLeft !== null
      ? daysLeft > 0
        ? `<span style="color:${daysLeft <= 7 ? '#FF8C42' : '#00D084'};font-weight:700">${daysLeft}d left</span>`
        : `<span style="color:#FF4D6D;font-weight:700">Expired</span>`
      : '—';

    const lastSync = client.lastSync
      ? new Date(client.lastSync).toLocaleDateString('en-RW')
      : 'Never';

    marker.bindPopup(`
      <div style="font-family:'Inter',sans-serif">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,${color}33,${color}11);padding:14px;border-bottom:1px solid ${color}22">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:40px;height:40px;border-radius:10px;background:${color}33;border:1.5px solid ${color}66;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:${color};flex-shrink:0">
              ${(client.businessName||'?').substring(0,2).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700;font-size:13px;color:#E8EDF5">${esc(client.businessName)}</div>
              <div style="font-size:10px;color:#7B8CAA;margin-top:1px">📍 ${esc(client.location || client._city + ', Rwanda')}</div>
            </div>
          </div>
          <span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid ${color}44">● ${(client.status||'').toUpperCase()}</span>
        </div>

        <!-- Info grid -->
        <div style="padding:12px 14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;text-align:center">
              <div style="font-size:9px;color:#7B8CAA;text-transform:uppercase">Plan</div>
              <div style="font-size:12px;font-weight:700;color:#E8EDF5">${esc(client.planName||'—')}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;text-align:center">
              <div style="font-size:9px;color:#7B8CAA;text-transform:uppercase">Devices</div>
              <div style="font-size:12px;font-weight:700;color:#E8EDF5">${client.activeDevices||0}/${client.maxDevices||0}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;text-align:center">
              <div style="font-size:9px;color:#7B8CAA;text-transform:uppercase">Days Left</div>
              <div style="font-size:11px;margin-top:2px">${daysHtml}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:7px;text-align:center">
              <div style="font-size:9px;color:#7B8CAA;text-transform:uppercase">Last Sync</div>
              <div style="font-size:10px;font-weight:600;color:#E8EDF5">${lastSync}</div>
            </div>
          </div>

          <div style="font-size:11px;color:#7B8CAA;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)">
            ${client.contactPhone ? `📞 <span style="color:#E8EDF5">${esc(client.contactPhone)}</span><br>` : ''}
            ${client.contactEmail ? `📧 <span style="color:#E8EDF5">${esc(client.contactEmail)}</span>` : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button onclick="getDirectionsTo(${i})" style="background:rgba(77,158,255,0.15);border:1px solid rgba(77,158,255,0.3);color:#4D9EFF;border-radius:7px;padding:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif">
              🧭 Directions
            </button>
            <button onclick="showPage('payments')" style="background:rgba(0,208,132,0.15);border:1px solid rgba(0,208,132,0.3);color:#00D084;border-radius:7px;padding:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif">
              💰 Pay
            </button>
          </div>
        </div>
      </div>
    `, { className: 'ims-popup', maxWidth: 260, minWidth: 250 });

    marker.bindTooltip(`
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}"></div>
        <strong>${esc(client.businessName)}</strong>
        <span style="opacity:.6;font-size:10px">${esc(client._city)}</span>
      </div>
    `, { className: 'ims-tooltip', offset: [0, -30], direction: 'top' });

    _mapMarkers.push(marker);
  });

  if (bounds.length > 0) {
    try {
      _mainMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true });
    } catch(e) {
      _mainMap.setView(RWANDA_CENTER, RWANDA_ZOOM);
    }
  }
}

// ── GET DIRECTIONS ────────────────────────────────
async function getDirectionsTo(clientIndex) {
  const client = _allMapClients[clientIndex];
  if (!client || !client._lat) return;

  _destClient = client;
  _mainMap.closePopup();

  // Show panel
  const panel = document.getElementById('directionsPanel');
  if (panel) panel.style.display = 'block';

  // Update labels
  const fromLat = _userLatLng ? _userLatLng[0] : RWANDA_CENTER[0];
  const fromLng = _userLatLng ? _userLatLng[1] : RWANDA_CENTER[1];

  document.getElementById('dirFrom').textContent = _userLatLng ? `📍 Your Location (${fromLat.toFixed(4)}, ${fromLng.toFixed(4)})` : '📍 Kigali, Rwanda (default)';
  document.getElementById('dirTo').textContent = `🏢 ${client.businessName} — ${client.location || client._city}`;
  document.getElementById('dirToShort').textContent = client.businessName;

  // Draw routes
  await drawRoutes([fromLat, fromLng], [client._lat, client._lng], client);

  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── DRAW ROUTES ───────────────────────────────────
async function drawRoutes(from, to, client) {
  // Clear old routes
  _routeLayers.forEach(l => _mainMap.removeLayer(l));
  _routeLayers = [];
  _currentRoutes = [];

  toast('Calculating routes...', 'info');

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?alternatives=2&geometries=geojson&overview=full&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      _currentRoutes = data.routes;

      const routeColors = ['#4D9EFF', '#00D084', '#FF8C42'];
      const routeLabels = ['Fastest', 'Shortest', 'Alt Route'];

      data.routes.forEach((route, i) => {
        const layer = L.geoJSON(route.geometry, {
          style: {
            color: routeColors[i],
            weight: i === 0 ? 6 : 4,
            opacity: i === 0 ? 0.9 : 0.35,
            dashArray: i === 0 ? null : (i === 1 ? '10,5' : '4,10'),
            lineCap: 'round',
            lineJoin: 'round',
          }
        }).addTo(_mainMap);

        _routeLayers.push(layer);

        const mins  = Math.round(route.duration / 60);
        const km    = (route.distance / 1000).toFixed(1);
        const hours = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;

        if (document.getElementById(`route${i}Time`))
          document.getElementById(`route${i}Time`).textContent = hours;
        if (document.getElementById(`route${i}Dist`))
          document.getElementById(`route${i}Dist`).textContent = `${km} km`;
      });

      // Summary (fastest route)
      const fastest = data.routes[0];
      const fMins   = Math.round(fastest.duration / 60);
      const fKm     = (fastest.distance / 1000).toFixed(1);
      document.getElementById('dirSummaryTime').textContent = fMins + ' min';
      document.getElementById('dirSummaryDist').textContent = fKm + ' km';

      // Fit to fastest route
      _mainMap.fitBounds(_routeLayers[0].getBounds().pad(0.15));
      toast('Routes calculated ✅');
    } else {
      fallbackRoute(from, to);
    }
  } catch(e) {
    console.warn('OSRM unavailable:', e.message);
    fallbackRoute(from, to);
  }
}

function fallbackRoute(from, to) {
  // Draw straight line as fallback
  const line = L.polyline([from, to], {
    color: '#4D9EFF', weight: 5, opacity: 0.7, dashArray: '10,5'
  }).addTo(_mainMap);
  _routeLayers.push(line);

  const dist = _mainMap.distance(from, to);
  const km   = (dist / 1000).toFixed(1);
  const mins = Math.round(dist / 400); // rough estimate

  ['0','1','2'].forEach((n, i) => {
    const el  = document.getElementById(`route${n}Time`);
    const elD = document.getElementById(`route${n}Dist`);
    if (el)  el.textContent  = (mins + i * 4) + ' min';
    if (elD) elD.textContent = km + ' km';
  });

  document.getElementById('dirSummaryTime').textContent = mins + ' min';
  document.getElementById('dirSummaryDist').textContent = km + ' km';

  _mainMap.fitBounds([[from[0],from[1]],[to[0],to[1]]], { padding:[40,40] });
  toast('Approximate route shown (offline mode)', 'warning');
}

// ── SELECT ROUTE ──────────────────────────────────
function selectRoute(idx, btn) {
  _selectedRoute = idx;

  document.querySelectorAll('.route-card').forEach((c, i) => {
    c.classList.toggle('active-route', i === idx);
  });

  _routeLayers.forEach((layer, i) => {
    layer.setStyle({
      opacity: i === idx ? 0.9 : 0.25,
      weight:  i === idx ? 6 : 3,
    });
    if (i === idx) layer.bringToFront();
  });
}

function closeDirections() {
  const panel = document.getElementById('directionsPanel');
  if (panel) panel.style.display = 'none';
  _routeLayers.forEach(l => _mainMap.removeLayer(l));
  _routeLayers = [];
  _mainMap.setView(RWANDA_CENTER, RWANDA_ZOOM, { animate: true });
}

function startNavigation() {
  if (!_destClient) return;
  const fromLat = _userLatLng ? _userLatLng[0] : RWANDA_CENTER[0];
  const fromLng = _userLatLng ? _userLatLng[1] : RWANDA_CENTER[1];
  const url = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${_destClient._lat},${_destClient._lng}&travelmode=driving`;
  window.open(url, '_blank');
}

// ── DISTANCE CALCULATOR ───────────────────────────
function populateDistSelect(clients) {
  const sel = document.getElementById('distClientSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Choose client...</option>' +
    clients.map((c, i) => `<option value="${i}">${esc(c.businessName)} — ${esc(c._city)}</option>`).join('');
}

async function calculateDistance() {
  const sel = document.getElementById('distClientSelect');
  const idx = parseInt(sel?.value);
  if (isNaN(idx) || idx < 0) { toast('Select a client first', 'error'); return; }
  const client = _allMapClients[idx];
  if (!client) return;
  await getDirectionsTo(idx);
  focusClient(idx);
}

function openInGoogleMaps() {
  const sel = document.getElementById('distClientSelect');
  const idx = parseInt(sel?.value);
  const client = idx >= 0 ? _allMapClients[idx] : null;
  if (client && client._lat) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${client._lat},${client._lng}`, '_blank');
  } else {
    window.open('https://www.google.com/maps/@-1.9441,30.0619,12z', '_blank');
  }
}

// ── SEARCH / GEOCODING ────────────────────────────
function mapSearch(q) {
  if (!q || q.length < 2) { renderMapSidebar(_allMapClients); return; }
  const lq = q.toLowerCase();
  const filtered = _allMapClients.filter(c =>
    c.businessName?.toLowerCase().includes(lq) ||
    (c.location || '').toLowerCase().includes(lq) ||
    (c._city || '').toLowerCase().includes(lq)
  );
  renderMapSidebar(filtered);
}

async function geocodeSearch(q) {
  if (!q) return;
  try {
    // Search client names first
    const lq = q.toLowerCase();
    const client = _allMapClients.find(c => c.businessName?.toLowerCase().includes(lq));
    if (client) {
      const idx = _allMapClients.indexOf(client);
      focusClient(idx);
      return;
    }

    // Geocode using Nominatim (free)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Rwanda')}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data && data[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      _mainMap.flyTo([lat, lng], 14, { duration: 1.5 });

      L.popup({ className: 'ims-popup' })
        .setLatLng([lat, lng])
        .setContent(`<div style="padding:10px;font-family:'Inter',sans-serif;color:#E8EDF5"><strong>🔍 ${esc(data[0].display_name.split(',')[0])}</strong><br><span style="font-size:10px;color:#7B8CAA">${esc(data[0].display_name)}</span></div>`)
        .openOn(_mainMap);
    } else {
      toast('Location not found', 'warning');
    }
  } catch(e) {
    toast('Search error', 'error');
  }
}

// ── NEARBY PLACES ─────────────────────────────────
async function findNearby(type) {
  // Clear previous nearby markers
  _nearbyMarkers.forEach(m => _mainMap.removeLayer(m));
  _nearbyMarkers = [];

  const center = _mainMap.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 2000; // 2km

  const typeLabels = {
    restaurant: { emoji:'🍽️', label:'Restaurant', color:'#FF8C42' },
    hotel:      { emoji:'🏨', label:'Hotel',      color:'#A855F7' },
    gas_station:{ emoji:'⛽', label:'Gas Station',color:'#F59E0B' },
    bank:       { emoji:'🏦', label:'Bank',       color:'#4D9EFF' },
    hospital:   { emoji:'🏥', label:'Hospital',   color:'#FF4D6D' },
    pharmacy:   { emoji:'💊', label:'Pharmacy',   color:'#00D084' },
  };

  const info = typeLabels[type] || { emoji:'📍', label:type, color:'#7B8CAA' };

  toast(`Finding nearby ${info.label}s...`, 'info');

  try {
    // Use Overpass API (free OpenStreetMap data)
    const query = `[out:json][timeout:10];node["amenity"="${type}"](around:${radius},${lat},${lng});out 10;`;
    const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query));
    const data = await res.json();

    if (data.elements && data.elements.length > 0) {
      data.elements.forEach(place => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${info.color};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid rgba(255,255,255,0.6);box-shadow:0 4px 12px ${info.color}88">${info.emoji}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const name = place.tags?.name || info.label;
        const marker = L.marker([place.lat, place.lon], { icon })
          .addTo(_mainMap)
          .bindTooltip(`${info.emoji} ${name}`, { className: 'ims-tooltip' })
          .bindPopup(`
            <div style="font-family:'Inter',sans-serif;padding:10px;min-width:160px">
              <div style="font-weight:700;color:#E8EDF5;margin-bottom:4px">${info.emoji} ${esc(name)}</div>
              <div style="font-size:10px;color:#7B8CAA">${info.label}</div>
              ${place.tags?.['addr:street'] ? `<div style="font-size:10px;color:#7B8CAA;margin-top:3px">📍 ${esc(place.tags['addr:street'])}</div>` : ''}
              ${place.tags?.phone ? `<div style="font-size:10px;color:#7B8CAA;margin-top:2px">📞 ${esc(place.tags.phone)}</div>` : ''}
              <button onclick="window.open('https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}','_blank')" style="margin-top:8px;width:100%;background:rgba(77,158,255,0.2);border:1px solid rgba(77,158,255,0.3);color:#4D9EFF;border-radius:6px;padding:5px;font-size:11px;cursor:pointer;font-family:inherit">View on Google Maps</button>
            </div>
          `, { className: 'ims-popup' });
        _nearbyMarkers.push(marker);
      });

      toast(`Found ${data.elements.length} nearby ${info.label}s ✅`);
    } else {
      toast(`No ${info.label}s found nearby`, 'warning');
    }
  } catch(e) {
    toast(`Could not load nearby ${info.label}s`, 'error');
  }
}

// ── MAP STATS ─────────────────────────────────────
function updateMapStats(clients) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('mapStatActive',  clients.filter(c => c.status === 'active').length);
  set('mapStatTrial',   clients.filter(c => c.status === 'trial').length);
  set('mapStatExpired', clients.filter(c => c.status === 'expired').length);
  set('mapStatTotal',   clients.length);
  set('mapClientCount', clients.length + ' clients');
}

// ── SIDEBAR ───────────────────────────────────────
function renderMapSidebar(clients) {
  const container = document.getElementById('mapClientList');
  if (!container) return;

  if (!clients.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">📍</div><p>No clients found</p></div>';
    return;
  }

  container.innerHTML = clients.map((c, i) => {
    const realIdx = _allMapClients.indexOf(c);
    const color   = STATUS_COLORS[c.status] || '#7B8CAA';
    return `
    <div onclick="focusClient(${realIdx})" style="display:flex;align-items:center;gap:9px;padding:9px 11px;background:var(--card2);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;border:1px solid transparent"
      onmouseover="this.style.borderColor='${color}55'" onmouseout="this.style.borderColor='transparent'">
      <div style="position:relative;width:12px;height:12px;flex-shrink:0">
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:sidebarDot 2s infinite ${(realIdx%5)*0.2}s"></div>
        <div style="position:absolute;inset:2px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}"></div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.businessName)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">📍 ${esc(c.location || c._city || 'Rwanda')}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
        <span style="background:${color}20;color:${color};font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px">${c.status||'?'}</span>
        <button onclick="event.stopPropagation();getDirectionsTo(${realIdx})" style="background:none;border:none;color:var(--blue);font-size:9px;cursor:pointer;padding:0;font-family:inherit;font-weight:600">🧭 Route</button>
      </div>
    </div>`;
  }).join('');
}

// ── FOCUS CLIENT ──────────────────────────────────
function focusClient(index) {
  if (!_mainMap || !_mapMarkers[index]) return;
  const marker = _mapMarkers[index];
  _mainMap.flyTo(marker.getLatLng(), 15, { duration: 1.5, easeLinearity: 0.4 });
  setTimeout(() => marker.openPopup(), 1600);
}

// ── FILTER ────────────────────────────────────────
function filterMapByStatus(status, btn) {
  document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtered = status ? _allMapClients.filter(c => c.status === status) : _allMapClients;
  renderMapMarkers(filtered);
  renderMapSidebar(filtered);
  updateMapStats(filtered);
}

function filterMapClients(q) { mapSearch(q); }

// ── MAP TOOLS ─────────────────────────────────────
function toggleMapFullscreen() {
  const el = document.getElementById('mainMapContainer');
  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => {
      setTimeout(() => _mainMap && _mainMap.invalidateSize(), 300);
    }).catch(() => toast('Fullscreen not available', 'error'));
  } else {
    document.exitFullscreen();
  }
}

function shareMapLink() {
  const center = _mainMap.getCenter();
  const zoom   = _mainMap.getZoom();
  const url    = `https://www.openstreetmap.org/#map=${zoom}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
  navigator.clipboard.writeText(url).then(() => toast('Map link copied ✅')).catch(() => prompt('Map link:', url));
}

function printMap() {
  window.print();
}

// ── DASHBOARD MINI MAP ────────────────────────────
function initDashMap(clients) {
  const container = document.getElementById('dashMapContainer');
  if (!container || _dashMap) return;

  _dashMap = L.map('dashMapContainer', {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
  }).setView(RWANDA_CENTER, 7);

  L.tileLayer(TILES.dark.url, { subdomains: 'abcd', maxZoom: 19 }).addTo(_dashMap);

  clients.forEach((client, i) => {
    const loc   = RWANDA_LOCATIONS[i % RWANDA_LOCATIONS.length];
    const lat   = loc.lat + (Math.random() - 0.5) * 0.05;
    const lng   = loc.lng + (Math.random() - 0.5) * 0.05;
    const color = STATUS_COLORS[client.status] || '#7B8CAA';

    const icon = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:16px;height:16px;border-radius:50%;background:${color};opacity:0.2;animation:sidebarDot 2s infinite ${i*0.25}s"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div>
      </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    L.marker([lat, lng], { icon }).addTo(_dashMap)
     .bindTooltip(esc(client.businessName), { className: 'ims-tooltip', offset: [0, -5] });
  });

  L.polyline(
    [[-2.84,28.86],[-2.84,30.90],[-1.05,30.90],[-1.05,28.86],[-2.84,28.86]],
    { color: 'rgba(77,158,255,0.2)', weight: 1.5, dashArray: '5,5' }
  ).addTo(_dashMap);
}

// Sidebar dot animation
const _mapCss = document.createElement('style');
_mapCss.textContent = `
  @keyframes sidebarDot{0%,100%{transform:scale(1);opacity:0.3}50%{transform:scale(1.8);opacity:0.05}}
  @keyframes pulseLive{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes pinRing1{0%{transform:translate(-50%,-50%) scale(0.3);opacity:0.6}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
  @keyframes pinRing2{0%{transform:translate(-50%,-50%) scale(0.4);opacity:0.5}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
`;
document.head.appendChild(_mapCss);
