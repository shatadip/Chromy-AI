// Builds extension/data/globe.json from Natural Earth (via world-atlas, public domain):
//   dots:      land sample points [lat, lon] on a ~2.4° grid (drawn as the dotted globe)
//   countries: { ISO alpha-2: [lat, lon] } label point per country (largest polygon's centroid)
// Usage: npm install && npm run globe
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const countriesTopo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const landTopo = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const isoCountries = require('i18n-iso-countries');

const land = feature(landTopo, landTopo.objects.land);
const countries = feature(countriesTopo, countriesTopo.objects.countries);

const polygonsOf = (geom) =>
  geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (lon, lat, poly) => inRing(lon, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lon, lat, h));

// Land dots: equal-area-ish grid (fewer points toward the poles).
const landPolys = land.features.flatMap((f) => polygonsOf(f.geometry));
const STEP = 2.4;
const dots = [];
for (let lat = -58; lat <= 82; lat += STEP) {
  const lonStep = STEP / Math.max(Math.cos((lat * Math.PI) / 180), 0.25);
  for (let lon = -180; lon < 180; lon += lonStep) {
    if (landPolys.some((p) => inPolygon(lon, lat, p))) dots.push([+lat.toFixed(1), +lon.toFixed(1)]);
  }
}

// Country label points: area-weighted centroid of the largest polygon.
function ringAreaCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return a === 0 ? { area: 0, c: ring[0] } : { area: Math.abs(a), c: [cx / (6 * a), cy / (6 * a)] };
}

const labels = {};
for (const f of countries.features) {
  const alpha2 = isoCountries.numericToAlpha2(String(f.id).padStart(3, '0'));
  if (!alpha2) continue;
  const best = polygonsOf(f.geometry)
    .map((p) => ringAreaCentroid(p[0]))
    .sort((a, b) => b.area - a.area)[0];
  if (best) labels[alpha2] = [+best.c[1].toFixed(2), +best.c[0].toFixed(2)];
}

// Small countries/territories that vanish at 1:110m but show up in install stats.
const SMALL = {
  SG: [1.35, 103.82], HK: [22.32, 114.17], MO: [22.2, 113.55], BH: [26.07, 50.55], MT: [35.94, 14.38],
  MU: [-20.35, 57.55], MV: [3.2, 73.22], LU: [49.82, 6.13], AD: [42.55, 1.6], MC: [43.74, 7.42],
  LI: [47.16, 9.55], SM: [43.94, 12.46], BB: [13.19, -59.54], BN: [4.54, 114.73], CV: [16.0, -24.01],
  KM: [-11.88, 43.87], SC: [-4.68, 55.49], TT: [10.69, -61.22], BS: [25.03, -77.4], GP: [16.27, -61.55],
  MQ: [14.64, -61.02], RE: [-21.12, 55.54], PF: [-17.68, -149.41], GU: [13.44, 144.79], AG: [17.06, -61.8],
  LC: [13.91, -60.98], GD: [12.12, -61.68], VC: [12.98, -61.29], DM: [15.41, -61.37], KN: [17.36, -62.78],
  AW: [12.52, -69.97], CW: [12.17, -68.99], BM: [32.32, -64.76], KY: [19.31, -81.25], JE: [49.21, -2.13],
  GG: [49.45, -2.58], IM: [54.24, -4.55], FO: [61.89, -6.91], GI: [36.14, -5.35], XK: [42.6, 20.9]
};
for (const [code, pos] of Object.entries(SMALL)) labels[code] ??= pos;

mkdirSync(new URL('../extension/data/', import.meta.url), { recursive: true });
const out = new URL('../extension/data/globe.json', import.meta.url);
writeFileSync(out, JSON.stringify({ source: 'Natural Earth via world-atlas (public domain)', dots, countries: labels }));
console.log(`${dots.length} land dots, ${Object.keys(labels).length} countries -> extension/data/globe.json`);
