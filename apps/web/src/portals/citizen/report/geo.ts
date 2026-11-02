// Tiny geo helpers (no turf needed for a point-in-polygon lookup).
import type { WardsGeoJSON } from '@/lib/api/endpoints';

type Ring = [number, number][];

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, polygon: Ring[]): boolean {
  if (!polygon.length || !inRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => inRing(lng, lat, hole));
}

export interface WardHit {
  id: string;
  name: string;
  zone: string;
}

/** Ward containing the point (Polygon or MultiPolygon features), or null outside all demo wards. */
export function wardAt(geo: WardsGeoJSON | undefined, lat: number, lng: number): WardHit | null {
  if (!geo) return null;
  for (const f of geo.features) {
    const coords = f.geometry.coordinates as Ring[] | Ring[][];
    const polys = (f.geometry.type === 'MultiPolygon' ? coords : [coords]) as Ring[][];
    if (polys.some((p) => inPolygon(lng, lat, p))) return f.properties;
  }
  return null;
}
