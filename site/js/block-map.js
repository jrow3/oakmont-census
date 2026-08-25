// Draw the selected Oakmont blocks over a free Carto light basemap with Leaflet.
// Leaflet is loaded globally (CDN) by index.html; this module reads window.L. Geometry is the
// committed site/blocks.geojson — no runtime call to TIGERweb.

export async function renderBlockMap() {
  const el = document.getElementById('block-map');
  if (!el || !window.L) return;
  const L = window.L;

  let geo;
  try {
    const res = await fetch('./blocks.geojson', { cache: 'force-cache' });
    if (!res.ok) throw new Error(String(res.status));
    geo = await res.json();
  } catch {
    el.innerHTML = '<p class="explorer-loading">Block map unavailable.</p>';
    return;
  }

  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  const layer = L.geoJSON(geo, {
    style: { color: '#b5502e', weight: 1, fillColor: '#c96a44', fillOpacity: 0.35 },
    onEachFeature: (f, lyr) => {
      lyr.on('mouseover', () => lyr.setStyle({ fillOpacity: 0.6, weight: 2 }));
      lyr.on('mouseout', () => lyr.setStyle({ fillOpacity: 0.35, weight: 1 }));
    },
  }).addTo(map);

  map.fitBounds(layer.getBounds(), { padding: [16, 16] });
}
