/* ═══════════════════════════════════════════════════
   IMS — map-style.js
   The night map: deep-navy land, glowing blue rivers and lakes,
   orange main roads, blue side roads, 3D buildings, and the places
   around a client (bars, restaurants, hotels, fuel, hospitals, banks).

   Data: OpenStreetMap through OpenFreeMap vector tiles. It is rebuilt
   from the live OpenStreetMap database every week, with no key and no
   limit, so new roads and places appear on their own.
═══════════════════════════════════════════════════ */

const IMS_TILEJSON = 'https://tiles.openfreemap.org/planet';
const IMS_GLYPHS   = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Region shortcuts (west, south, east, north)
const IMS_REGIONS = {
  rwanda:   { label: 'Rwanda',        bounds: [[28.78, -2.90], [31.00, -0.98]] },
  kigali:   { label: 'Kigali',        bounds: [[29.95, -2.08], [30.28, -1.82]] },
  east:     { label: 'East Africa',   bounds: [[26.0, -12.4], [51.6, 15.4]] },
  uganda:   { label: 'Uganda',        bounds: [[29.5, -1.6], [35.1, 4.3]] },
  kenya:    { label: 'Kenya',         bounds: [[33.8, -4.8], [41.95, 5.1]] },
  tanzania: { label: 'Tanzania',      bounds: [[29.3, -11.8], [40.5, -0.9]] },
  burundi:  { label: 'Burundi',       bounds: [[28.9, -4.5], [30.9, -2.3]] },
  drc:      { label: 'DR Congo (east)', bounds: [[26.5, -8.0], [31.4, 3.0]] },
};
const IMS_MAX_BOUNDS = [[17, -22], [58, 22]];   // keeps the map on East Africa and its neighbours

// Colours used by markers, legend and map layers (one place so they always agree)
const IMS_C = {
  client: '#3b82f6', trial: '#8b5cf6', warn: '#f59e0b', bad: '#ef4444', live: '#10b981', recent: '#eab308', stale: '#64748b',
  comp: '#22c55e', hotel: '#a855f7', fuel: '#f59e0b', health: '#f43f5e', bank: '#06b6d4',
};

function imsDarkStyle() {
  const NAME = ['coalesce', ['get', 'name_en'], ['get', 'name']];
  const HALO = '#040816';
  const Z = (...s) => ['interpolate', ['linear'], ['zoom'], ...s];
  const ROAD = (cls) => ['all', ['in', ['get', 'class'], ['literal', cls]], ['!=', ['get', 'brunnel'], 'tunnel']];
  const POI = (cls) => ['in', ['get', 'class'], ['literal', cls]];
  const COMP = ['bar', 'restaurant', 'fast_food', 'cafe', 'pub', 'biergarten', 'nightclub'];
  const HOTEL = ['lodging', 'hotel', 'hostel', 'guest_house'];
  const FUEL = ['fuel'];
  const HEALTH = ['hospital', 'pharmacy', 'doctors', 'clinic'];
  const BANK = ['bank', 'atm'];
  // known public places, grouped by colour (matched on class or subclass because OSM tags vary)
  const G = {
    edu:   ['school', 'college', 'university', 'kindergarten', 'library'],
    faith: ['place_of_worship', 'church', 'mosque', 'cathedral', 'temple', 'chapel'],
    gov:   ['town_hall', 'townhall', 'courthouse', 'police', 'fire_station', 'embassy', 'post', 'post_office', 'government', 'prison', 'public_building', 'community_centre'],
    move:  ['bus_station', 'bus', 'railway', 'station', 'ferry_terminal', 'harbor', 'taxi', 'aerodrome', 'airport'],
    shop:  ['marketplace', 'supermarket', 'mall', 'department_store', 'grocery', 'convenience'],
    fun:   ['stadium', 'museum', 'attraction', 'monument', 'memorial', 'theatre', 'cinema', 'zoo', 'garden', 'sports_centre', 'swimming_pool', 'golf', 'viewpoint', 'artwork'],
  };
  const ANY = (l) => ['any', ['in', ['get', 'class'], ['literal', l]], ['in', ['get', 'subclass'], ['literal', l]]];
  const INFRA = ['any', ANY(G.edu), ANY(G.faith), ANY(G.gov), ANY(G.move), ANY(G.shop), ANY(G.fun)];
  const INFRA_COLOR = ['case', ANY(G.edu), '#38bdf8', ANY(G.faith), '#f0abfc', ANY(G.gov), '#5eead4', ANY(G.move), '#fde047', ANY(G.shop), '#fdba74', '#f9a8d4'];

  return {
    version: 8,
    name: 'IMS Night',
    glyphs: IMS_GLYPHS,
    sources: { omt: { type: 'vector', url: IMS_TILEJSON } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#040816' } },

      // ground
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#082019', 'grass', '#09182b', 'farmland', '#081528', 'wetland', '#08283a', 'sand', '#101c38', 'ice', '#18284a', '#07112a'], 'fill-opacity': .95 } },
      { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse',
        paint: { 'fill-color': ['match', ['get', 'class'], 'residential', '#091330', 'industrial', '#101b40', 'commercial', '#101b40', 'retail', '#12204a', 'cemetery', '#08202a', 'military', '#1a1022', 'stadium', '#0a2332', 'pitch', '#0a2332', 'rgba(0,0,0,0)'], 'fill-opacity': .9 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#08291f', 'fill-opacity': .7 } },

      // water: glowing
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#0a3a8c' } },
      { id: 'water-edge-glow', type: 'line', source: 'omt', 'source-layer': 'water', paint: { 'line-color': '#2f7bff', 'line-width': Z(3, 1, 12, 6), 'line-blur': 4, 'line-opacity': .45 } },
      { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water', paint: { 'line-color': '#5aa2ff', 'line-width': Z(3, .5, 12, 1.4), 'line-opacity': .9 } },
      { id: 'waterway-glow', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['river', 'canal']]],
        paint: { 'line-color': '#2563eb', 'line-width': Z(6, 2, 14, 12), 'line-blur': 4, 'line-opacity': .5 } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 7,
        paint: { 'line-color': '#3b8cff', 'line-width': Z(7, .7, 14, 3.4) } },

      // boundaries
      { id: 'boundary-region', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 5, filter: ['all', ['in', ['get', 'admin_level'], ['literal', [4]]], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#4964b8', 'line-width': Z(5, .5, 12, 1.2), 'line-dasharray': [3, 3], 'line-opacity': .45 } },
      { id: 'boundary-district', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 9.5, filter: ['all', ['in', ['get', 'admin_level'], ['literal', [5, 6]]], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#3b4f96', 'line-width': .8, 'line-dasharray': [2, 3], 'line-opacity': .55 } },
      { id: 'boundary-country-glow', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#7c3aed', 'line-width': Z(2, 3, 10, 9), 'line-blur': 4, 'line-opacity': .5 } },
      { id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#b39bff', 'line-width': Z(2, .8, 10, 2) } },

      // buildings: flat from far, 3D up close
      { id: 'building-flat', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, maxzoom: 15.5, paint: { 'fill-color': '#112456', 'fill-opacity': .9 } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 15,
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#12275c', 40, '#2a4fb0'],
                 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': .88 } },

      // aviation + rail
      { id: 'aeroway', type: 'line', source: 'omt', 'source-layer': 'aeroway', minzoom: 10, paint: { 'line-color': '#8aa0d6', 'line-width': Z(10, .8, 16, 5) } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9, filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': '#5b6fb0', 'line-width': 1, 'line-dasharray': [4, 3] } },

      // roads: faint blue glow for streets, bright orange for main roads
      { id: 'road-path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ROAD(['path', 'track']),
        paint: { 'line-color': '#2b438f', 'line-width': Z(14, .4, 18, 1.4), 'line-dasharray': [2, 2] } },
      { id: 'road-minor-glow', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: ROAD(['minor', 'service']),
        paint: { 'line-color': '#1d4ed8', 'line-width': Z(11, .8, 15, 4, 18, 14), 'line-blur': 2.5, 'line-opacity': .35 } },
      { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: ROAD(['minor', 'service']),
        paint: { 'line-color': '#4468d4', 'line-width': Z(11, .3, 15, 1.2, 18, 6) } },
      { id: 'road-tertiary', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9, filter: ROAD(['tertiary']),
        paint: { 'line-color': '#86a6ff', 'line-width': Z(9, .5, 14, 1.8, 18, 9) } },
      { id: 'road-secondary', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7, filter: ROAD(['secondary']),
        paint: { 'line-color': '#a8c0ff', 'line-width': Z(7, .5, 14, 2.4, 18, 11) } },
      { id: 'road-primary-glow', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6.5, filter: ROAD(['primary', 'trunk', 'motorway']),
        paint: { 'line-color': '#ff8a1f', 'line-width': Z(6.5, 1.5, 12, 8, 18, 22), 'line-blur': 4, 'line-opacity': .35 } },
      { id: 'road-primary', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6.5, filter: ROAD(['primary']),
        paint: { 'line-color': '#ffb454', 'line-width': Z(5, .6, 12, 2.4, 18, 12) } },
      { id: 'road-trunk', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 4, filter: ROAD(['trunk', 'motorway']),
        paint: { 'line-color': '#ff9a2e', 'line-width': Z(4, .8, 12, 3, 18, 14) } },

      // places that matter to a bar: competitors, hotels, fuel, hospitals, banks
      { id: 'poi-glow-comp', type: 'circle', source: 'omt', 'source-layer': 'poi', minzoom: 13, filter: POI(COMP),
        paint: { 'circle-color': IMS_C.comp, 'circle-radius': Z(13, 5, 17, 13), 'circle-blur': 1, 'circle-opacity': .35 } },
      { id: 'poi-comp', type: 'circle', source: 'omt', 'source-layer': 'poi', minzoom: 13, filter: POI(COMP),
        paint: { 'circle-color': IMS_C.comp, 'circle-radius': Z(13, 2.5, 17, 6), 'circle-stroke-color': '#052e16', 'circle-stroke-width': 1.4 } },
      { id: 'poi-other', type: 'circle', source: 'omt', 'source-layer': 'poi', minzoom: 14.5, filter: ['any', POI(HOTEL), POI(FUEL), POI(HEALTH), POI(BANK)],
        paint: { 'circle-color': ['case', POI(HOTEL), IMS_C.hotel, POI(FUEL), IMS_C.fuel, POI(HEALTH), IMS_C.health, IMS_C.bank],
                 'circle-radius': Z(14.5, 2.5, 17, 5.5), 'circle-stroke-color': '#0b0f24', 'circle-stroke-width': 1.2 } },
      { id: 'poi-comp-label', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 15.5, filter: POI(COMP),
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true },
        paint: { 'text-color': '#86efac', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },
      { id: 'poi-other-label', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16.2, filter: ['any', POI(HOTEL), POI(FUEL), POI(HEALTH), POI(BANK)],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true },
        paint: { 'text-color': '#c4b5fd', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },

      // landmarks and public places people know: schools, worship, government, transport, markets, sport, culture
      { id: 'poi-infra', type: 'circle', source: 'omt', 'source-layer': 'poi', minzoom: 14, filter: INFRA,
        paint: { 'circle-color': INFRA_COLOR, 'circle-radius': Z(14, 2.2, 17, 5), 'circle-stroke-color': '#0b0f24', 'circle-stroke-width': 1.1 } },
      { id: 'poi-infra-label', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 15, filter: INFRA,
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': Z(15, 10, 18, 12), 'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true,
                  'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
        paint: { 'text-color': INFRA_COLOR, 'text-halo-color': HALO, 'text-halo-width': 1.5 } },
      { id: 'poi-misc-label', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16.5,
        filter: ['all', ['has', 'name'], ['!', INFRA], ['!', POI(COMP)], ['!', ['any', POI(HOTEL), POI(FUEL), POI(HEALTH), POI(BANK)]]],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, .6], 'text-anchor': 'top', 'text-max-width': 7, 'text-optional': true },
        paint: { 'text-color': '#8fa0cf', 'text-halo-color': HALO, 'text-halo-width': 1.3 } },
      { id: 'housenumber', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 17.2,
        layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-allow-overlap': false },
        paint: { 'text-color': '#7f93c9', 'text-halo-color': HALO, 'text-halo-width': 1.2 } },
      { id: 'park-name', type: 'symbol', source: 'omt', 'source-layer': 'park', minzoom: 11, filter: ['has', 'name'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': Z(11, 10, 16, 12), 'text-max-width': 7 },
        paint: { 'text-color': '#4ade80', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },
      { id: 'airport-name', type: 'symbol', source: 'omt', 'source-layer': 'aerodrome_label', minzoom: 7, filter: ['has', 'name'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-width': 8, 'text-offset': [0, .8], 'text-anchor': 'top' },
        paint: { 'text-color': '#fde047', 'text-halo-color': HALO, 'text-halo-width': 1.5 } },
      { id: 'peak-name', type: 'symbol', source: 'omt', 'source-layer': 'mountain_peak', minzoom: 7, filter: ['has', 'name'],
        layout: { 'text-field': ['concat', '▲ ', NAME], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-max-width': 8, 'text-optional': true },
        paint: { 'text-color': '#c7a46b', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },

      // labels
      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': Z(3, 10, 10, 14), 'text-max-width': 8, 'text-letter-spacing': .1 },
        paint: { 'text-color': '#5b9bff', 'text-halo-color': HALO, 'text-halo-width': 1.2 } },
      { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 11.5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': Z(11.5, 10, 17, 12), 'text-letter-spacing': .03 },
        paint: { 'text-color': '#8ea5e0', 'text-halo-color': HALO, 'text-halo-width': 1.6 } },
      { id: 'road-name-minor', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13.5,
        filter: ['!', ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]]],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-letter-spacing': .03 },
        paint: { 'text-color': '#7f95d0', 'text-halo-color': HALO, 'text-halo-width': 1.6 } },
      { id: 'place-village', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb', 'quarter', 'neighbourhood', 'hamlet']]],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': Z(11, 10, 16, 14), 'text-max-width': 7 },
        paint: { 'text-color': '#9fb3e8', 'text-halo-color': HALO, 'text-halo-width': 1.6 } },
      { id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 7, filter: ['==', ['get', 'class'], 'town'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': Z(7, 11, 12, 16), 'text-max-width': 8 },
        paint: { 'text-color': '#c9d6fa', 'text-halo-color': HALO, 'text-halo-width': 1.8 } },
      { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 3, filter: ['==', ['get', 'class'], 'city'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': Z(3, 10, 8, 15, 12, 21), 'text-max-width': 8, 'symbol-sort-key': ['get', 'rank'] },
        paint: { 'text-color': '#eef2ff', 'text-halo-color': HALO, 'text-halo-width': 2 } },
      { id: 'place-state', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4, maxzoom: 9, filter: ['==', ['get', 'class'], 'state'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': Z(4, 10, 8, 13), 'text-transform': 'uppercase', 'text-letter-spacing': .12, 'text-max-width': 7 },
        paint: { 'text-color': '#5a74bd', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },
      { id: 'place-country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 7, filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': Z(2, 11, 6, 17), 'text-transform': 'uppercase', 'text-letter-spacing': .2, 'text-max-width': 8 },
        paint: { 'text-color': '#a9bcff', 'text-halo-color': HALO, 'text-halo-width': 2 } },
    ],
  };
}

// Plain satellite imagery (Esri) for when someone wants to see the real roofs
function imsSatelliteStyle() {
  return {
    version: 8, glyphs: IMS_GLYPHS,
    sources: {
      sat: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
             tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
      lab: { type: 'raster', tileSize: 256, maxzoom: 19,
             tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
    },
    layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'lab', type: 'raster', source: 'lab' }],
  };
}

// Helpers shared by the map page and the dashboard preview
function imsCircle(lng, lat, km, steps) {
  steps = steps || 64; const pts = [];
  const d = km / 6371, la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
  for (let i = 0; i <= steps; i++) {
    const b = (i / steps) * 2 * Math.PI;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    pts.push([lo2 * 180 / Math.PI, la2 * 180 / Math.PI]);
  }
  return pts;
}
// Rwanda lit up, everything outside it dimmed
async function imsAddFocusCountry(map, name) {
  try {
    const res = await apiGet('track', 'country', { name: name || 'Rwanda' });
    if (!res.ok || !res.geometry) return;
    const g = res.geometry;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
    if (!rings.length) return;
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    if (map.getSource('focus')) return;
    map.addSource('focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { k: 'mask' }, geometry: { type: 'Polygon', coordinates: [world, ...rings] } },
      { type: 'Feature', properties: { k: 'edge' }, geometry: { type: 'MultiLineString', coordinates: rings } },
      { type: 'Feature', properties: { k: 'area' }, geometry: { type: 'MultiPolygon', coordinates: rings.map(r => [r]) } },
    ] } });
    const before = map.getLayer('poi-glow-comp') ? 'poi-glow-comp' : undefined;
    map.addLayer({ id: 'focus-mask', type: 'fill', source: 'focus', filter: ['==', ['get', 'k'], 'mask'], paint: { 'fill-color': '#02040d', 'fill-opacity': .42 } }, before);
    map.addLayer({ id: 'focus-area', type: 'fill', source: 'focus', filter: ['==', ['get', 'k'], 'area'], paint: { 'fill-color': '#22d3ee', 'fill-opacity': .035 } }, before);
    map.addLayer({ id: 'focus-glow', type: 'line', source: 'focus', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': '#22d3ee', 'line-width': 9, 'line-blur': 6, 'line-opacity': .55 } }, before);
    map.addLayer({ id: 'focus-edge', type: 'line', source: 'focus', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': '#67e8f9', 'line-width': 1.6 } }, before);
  } catch (e) { /* the map works fine without the outline */ }
}
