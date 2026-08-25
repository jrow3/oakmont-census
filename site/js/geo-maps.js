// Two side-by-side maps for the methodology page: the ACS tract geography (2 tracts) next to the
// Decennial block geography (the selected blocks), drawn at the SAME scale so the block boundary reads as a
// tighter subset of the tracts. Leaflet is loaded globally (CDN) by methodology.html.

const TRACT_STYLE = { color: '#0b7a6e', weight: 2.5, fillColor: '#0e9384', fillOpacity: 0.18 };
const BLOCK_STYLE = { color: '#a5401f', weight: 1.5, fillColor: '#c96a44', fillOpacity: 0.5 };

async function loadGeo(path) {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function baseMap(el) {
  const map = window.L.map(el, { scrollWheelZoom: false, zoomControl: false, attributionControl: true, zoomSnap: 0 });
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);
  return map;
}

export async function renderGeoMaps() {
  const tractEl = document.getElementById('tract-map');
  const blockEl = document.getElementById('block-map');
  if (!tractEl || !blockEl || !window.L) return;
  const L = window.L;

  let tracts, blocks;
  try {
    [tracts, blocks] = await Promise.all([loadGeo('./tracts.geojson'), loadGeo('./blocks.geojson')]);
  } catch {
    tractEl.innerHTML = blockEl.innerHTML = '<p class="explorer-loading">Map unavailable.</p>';
    return;
  }

  const tractMap = baseMap(tractEl);
  const blockMap = baseMap(blockEl);
  const tractLayer = L.geoJSON(tracts, { style: TRACT_STYLE }).addTo(tractMap);
  L.geoJSON(blocks, { style: BLOCK_STYLE }).addTo(blockMap);

  // Same scale: put BOTH maps at the same center and zoom (the tract extent contains the blocks),
  // so the blocks read as a tighter cluster inside the same frame. Zoom is the level that fits
  // the whole tract extent, backed off a hair so the tracts never spill off the edges.
  const bounds = tractLayer.getBounds();
  const center = bounds.getCenter();
  const zoom = tractMap.getBoundsZoom(bounds, false) - 0.1;
  tractMap.setView(center, zoom, { animate: false });
  blockMap.setView(center, zoom, { animate: false });
}
