// Deterministic helpers for the mock dataset. Same seed → same data, every run.

export const SEED = 20260101;

/** mulberry32 PRNG — small, fast, deterministic. */
export function createRng(seed = SEED) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    /** Picks n distinct items. */
    sample: <T>(arr: readonly T[], n: number): T[] => {
      const copy = [...arr];
      const out: T[] = [];
      while (out.length < n && copy.length) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      return out;
    },
    /** Offsets a point by up to `meters` in a random direction. */
    jitter: (lat: number, lng: number, meters: number) => {
      const r = (meters / 111_320) * Math.sqrt(next());
      const theta = next() * 2 * Math.PI;
      return {
        lat: +(lat + r * Math.cos(theta)).toFixed(6),
        lng: +(lng + (r * Math.sin(theta)) / Math.cos((lat * Math.PI) / 180)).toFixed(6),
      };
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

/** FNV-1a based 64-hex-char pseudo hash. Deterministic, NOT cryptographic (mock audit chain only). */
export function fakeHash(input: string): string {
  let out = '';
  for (let round = 0; round < 8; round++) {
    let h = 0x811c9dc5 ^ round;
    const s = `${round}:${input}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

export const pad = (n: number, width: number) => String(n).padStart(width, '0');

export const HOUR = 3_600_000;
export const MINUTE = 60_000;
export const DAY = 24 * HOUR;

/** Distance in meters between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
