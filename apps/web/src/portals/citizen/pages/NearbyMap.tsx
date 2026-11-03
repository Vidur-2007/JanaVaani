// Map body for /app/nearby (lazy: pulls in react-leaflet). Search circle around the center, public-safe issue dots
// (no ids, no text) colored by department, "you are here" dot. Panning the map moves the search center.
import { useEffect, useRef } from 'react';
import { Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint, MapPoint } from '@contracts/types';
import { MapView } from '@/design/components';
import { DEPARTMENT_IDS } from './nearbyGeo';

/** SVG presentation attributes can't use var(), so department colors go through classes (a top-level `className`
 * prop: react-leaflet only sends `pathOptions` through setStyle, which ignores className). */
const DEPT_CSS =
  DEPARTMENT_IDS.map(
    (d) => `.jv-dot-${d}{stroke:var(--dept-${d})!important;fill:var(--dept-${d})!important}`,
  ).join('') +
  '.jv-radius{stroke:var(--primary)!important;fill:var(--primary)!important}.jv-me{stroke:#fff!important;fill:var(--accent)!important}';

function Follow({ to }: { to: GeoPoint }) {
  const map = useMap();
  useEffect(() => {
    const c = map.getCenter();
    if (Math.abs(c.lat - to.lat) > 1e-5 || Math.abs(c.lng - to.lng) > 1e-5)
      map.panTo([to.lat, to.lng], { animate: true });
  }, [map, to.lat, to.lng]);
  return null;
}

/** Zoom so the whole search circle fits whenever the radius changes (MapContainer ignores later zoom props). */
function FitRadius({ center, radius }: { center: GeoPoint; radius: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.fitBounds(L.latLng(center.lat, center.lng).toBounds(radius * 2.2), { animate: true });
    // Only on radius changes; panning moves the center itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, radius]);
  return null;
}

function MoveWatcher({ onMove }: { onMove: (p: GeoPoint) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onMove({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) }), 250);
    },
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return null;
}

export default function NearbyMap({
  center,
  radius,
  points,
  me,
  onMove,
  ariaLabel,
}: {
  center: GeoPoint;
  radius: number;
  points: MapPoint[];
  me?: GeoPoint | null;
  onMove: (p: GeoPoint) => void;
  ariaLabel: string;
}) {
  const zoom = radius <= 500 ? 15 : radius <= 1000 ? 14 : 13;
  return (
    <>
      <style>{DEPT_CSS}</style>
      <MapView center={center} zoom={zoom} height={320} scrollWheelZoom={false} ariaLabel={ariaLabel}>
        <Follow to={center} />
        <FitRadius center={center} radius={radius} />
        <MoveWatcher onMove={onMove} />
        <Circle
          center={[center.lat, center.lng]}
          radius={radius}
          className="jv-radius"
          pathOptions={{ weight: 2, fillOpacity: 0.06, opacity: 0.7 }}
        />
        {points.map((p, i) => (
          <CircleMarker
            key={`${p.lat},${p.lng},${i}`}
            center={[p.lat, p.lng]}
            radius={7}
            className={`jv-dot-${p.category}`}
            pathOptions={{ weight: 2, fillOpacity: 0.75 }}
          />
        ))}
        {me && (
          <CircleMarker
            center={[me.lat, me.lng]}
            radius={8}
            className="jv-me"
            pathOptions={{ weight: 3, fillOpacity: 1 }}
          />
        )}
      </MapView>
    </>
  );
}
