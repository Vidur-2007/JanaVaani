import type { Ward } from '../../src/types';

// Spec B §3.2 — 30 demo wards (approximate centroids). Ids W-<ZONE>-NN, numbered in table order per zone.
// B's ml/build_wards.py should produce the same ids so mock and live data line up.

export const ZONES = [
  'Serilingampally',
  'Kukatpally',
  'Khairatabad',
  'Secunderabad',
  'Charminar',
  'LB Nagar',
] as const;
export const ZONE_CODES: Record<(typeof ZONES)[number], string> = {
  Serilingampally: 'SLP',
  Kukatpally: 'KKP',
  Khairatabad: 'KHB',
  Secunderabad: 'SEC',
  Charminar: 'CHR',
  'LB Nagar': 'LBN',
};

const RAW: [zone: (typeof ZONES)[number], name: string, lat: number, lng: number][] = [
  ['Serilingampally', 'Gachibowli', 17.4401, 78.3489],
  ['Serilingampally', 'Kondapur', 17.4699, 78.3578],
  ['Serilingampally', 'Madhapur', 17.4483, 78.3915],
  ['Serilingampally', 'Miyapur', 17.4968, 78.3614],
  ['Serilingampally', 'Lingampally', 17.4925, 78.317],
  ['Kukatpally', 'Kukatpally', 17.4849, 78.4138],
  ['Kukatpally', 'KPHB Colony', 17.4935, 78.399],
  ['Kukatpally', 'Moosapet', 17.4636, 78.4258],
  ['Kukatpally', 'Kompally', 17.536, 78.487],
  ['Khairatabad', 'Jubilee Hills', 17.4325, 78.4071],
  ['Khairatabad', 'Banjara Hills', 17.4156, 78.4347],
  ['Khairatabad', 'Ameerpet', 17.4375, 78.4482],
  ['Khairatabad', 'Mehdipatnam', 17.3959, 78.4312],
  ['Khairatabad', 'Tolichowki', 17.3986, 78.414],
  ['Khairatabad', 'Nampally', 17.389, 78.468],
  ['Secunderabad', 'Secunderabad', 17.4399, 78.4983],
  ['Secunderabad', 'Begumpet', 17.4447, 78.4664],
  ['Secunderabad', 'Tarnaka', 17.4281, 78.539],
  ['Secunderabad', 'Malkajgiri', 17.453, 78.528],
  ['Secunderabad', 'Alwal', 17.503, 78.509],
  ['Charminar', 'Charminar', 17.3616, 78.4747],
  ['Charminar', 'Falaknuma', 17.3313, 78.473],
  ['Charminar', 'Malakpet', 17.373, 78.5],
  ['Charminar', 'Attapur', 17.3724, 78.4307],
  ['Charminar', 'Abids', 17.392, 78.476],
  ['Charminar', 'Himayatnagar', 17.401, 78.487],
  ['LB Nagar', 'LB Nagar', 17.3457, 78.5522],
  ['LB Nagar', 'Dilsukhnagar', 17.3688, 78.5247],
  ['LB Nagar', 'Saroornagar', 17.353, 78.532],
  ['LB Nagar', 'Uppal', 17.4058, 78.5591],
];

const counters: Record<string, number> = {};
export const WARDS: Ward[] = RAW.map(([zone, name, lat, lng]) => {
  const code = ZONE_CODES[zone];
  counters[code] = (counters[code] ?? 0) + 1;
  return { id: `W-${code}-${String(counters[code]).padStart(2, '0')}`, name, zone, centroid: { lat, lng } };
});

export const wardByName = (name: string) => WARDS.find((w) => w.name === name)!;
export const wardById = (id: string) => WARDS.find((w) => w.id === id);

/** Nearest ward centroid (mock stand-in for B's point-in-polygon lookup). */
export function nearestWard(lat: number, lng: number): Ward {
  let best = WARDS[0];
  let bestD = Infinity;
  for (const w of WARDS) {
    const d = (w.centroid.lat - lat) ** 2 + (w.centroid.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Approximate demo boundaries: a hexagon around each centroid (B replaces with Voronoi polygons). */
export function wardsGeoJSON() {
  const r = 0.012;
  return {
    type: 'FeatureCollection' as const,
    features: WARDS.map((w) => {
      const ring: [number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * (i % 6);
        ring.push([
          +(w.centroid.lng + r * Math.cos(a)).toFixed(5),
          +(w.centroid.lat + r * 0.92 * Math.sin(a)).toFixed(5),
        ]);
      }
      return {
        type: 'Feature' as const,
        properties: { id: w.id, name: w.name, zone: w.zone },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    }),
  };
}
