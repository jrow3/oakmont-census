// Two side-by-side maps for the methodology page: the ACS tract geography (2 tracts) next to the
// Decennial block geography (76 blocks), drawn at the SAME scale so the block boundary reads as a
// tighter subset of the tracts. Leaflet is loaded globally (CDN) by methodology.html.

const TRACT_STYLE = { color: '#0e9384', weight: 1.5, fillColor: '#0e9384', fillOpacity: 0.12 };
const BLOCK_STYLE = { color: '#b5502e', weight: 1, fillColor: '#c96a44', fillOpacity: 0.4 };

async function loadGeo(path) {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function baseMap(el) {
  const map = window.L.map(el, { scrollWheelZoom: false, zoomControl: false, attributionControl: true });
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
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

  // Same scale: fit BOTH maps to the tract extent (which contains the blocks), so the 76 blocks
  // read as a tighter cluster inside the same frame.
  const bounds = tractLayer.getBounds().pad(0.04);
  tractMap.fitBounds(bounds);
  blockMap.fitBounds(bounds);
}
