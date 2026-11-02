// Map body for the location sheet (lazy: pulls in react-leaflet). Draggable pin, tap-to-move,
// ward polygons from /meta/wards.geojson, accuracy circle for GPS fixes.
import { useEffect, useMemo } from 'react';
import { Circle, GeoJSON, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint } from '@contracts/types';
import { MapView } from '@/design/components';
import type { WardsGeoJSON } from '@/lib/api/endpoints';

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:var(--primary);transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 12px rgb(0 0 0/.35)"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function Follow({ to }: { to: GeoPoint }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([to.lat, to.lng], { animate: true });
  }, [map, to.lat, to.lng]);
  return null;
}

function TapToMove({ onPick }: { onPick: (p: GeoPoint) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });
  return null;
}

export default function LocationMap({
  pin,
  onPinChange,
  accuracy,
  wards,
  activeWardId,
  height = 280,
}: {
  pin: GeoPoint;
  onPinChange?: (p: GeoPoint) => void;
  accuracy?: number;
  wards?: WardsGeoJSON;
  activeWardId?: string;
  height?: number;
}) {
  const handlers = useMemo(
    () => ({
      dragend: (e: L.LeafletEvent) => {
        const ll = (e.target as L.Marker).getLatLng();
        onPinChange?.({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
      },
    }),
    [onPinChange],
  );
  return (
    <MapView center={pin} zoom={14} height={height} scrollWheelZoom showBoundaryNote={!!wards}>
      {wards && (
        <GeoJSON
          key={activeWardId ?? 'none'}
          data={wards as unknown as GeoJSON.FeatureCollection}
          style={(f) => {
            const active = f?.properties?.id === activeWardId;
            return { color: active ? '#FF7A1A' : '#22D3C5', weight: active ? 2.5 : 1, fillOpacity: active ? 0.15 : 0.03, opacity: active ? 0.9 : 0.5 };
          }}
        />
      )}
      {accuracy != null && <Circle center={[pin.lat, pin.lng]} radius={accuracy} pathOptions={{ color: '#22D3C5', fillOpacity: 0.12, weight: 1 }} />}
      <Marker position={[pin.lat, pin.lng]} icon={pinIcon} draggable={!!onPinChange} eventHandlers={handlers} keyboard />
      {onPinChange && <TapToMove onPick={onPinChange} />}
      <Follow to={pin} />
    </MapView>
  );
}
