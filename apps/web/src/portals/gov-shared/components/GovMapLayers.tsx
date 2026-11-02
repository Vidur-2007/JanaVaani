// Leaflet layers for GovMap. leaflet.heat and leaflet.markercluster patch a global `L`, so it is set before they load.
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { CircleMarker, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import type { FeatureCollection } from 'geojson';
import type { Incident, MapPoint } from '@contracts/types';
import type { WardsGeoJSON } from '@/lib/api/endpoints';
import type { MapLayer } from './GovMap';

const pluginsReady = (async () => {
  (window as unknown as { L: typeof L }).L = L;
  await Promise.all([import('leaflet.heat'), import('leaflet.markercluster')]);
})();

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const HEAT_WEIGHT: Record<MapPoint['priority'], number> = { critical: 1, high: 0.7, medium: 0.45, low: 0.25 };

function HeatLayer({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.heatLayer(
      points.map((p) => [p.lat, p.lng, HEAT_WEIGHT[p.priority]]),
      { radius: 26, blur: 22, minOpacity: 0.3, maxZoom: 14 },
    );
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, points]);
  return null;
}

function ClusterLayer({ points, onClick }: { points: MapPoint[]; onClick?: (p: MapPoint) => void }) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
    group.addLayers(
      points.map((p) => {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          weight: 1,
          color: cssVar('--bg'),
          fillColor: cssVar(`--dept-${p.category}`),
          fillOpacity: 0.9,
        });
        if (onClick) m.on('click', () => onClick(p));
        return m;
      }) as unknown as L.Layer[],
    );
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [map, points, onClick]);
  return null;
}

const pulseIcon = () =>
  L.divIcon({
    className: '',
    iconSize: [14, 14],
    html: `<span style="position:relative;display:block;width:14px;height:14px">
      <span class="motion-safe:animate-pulse-ring" style="position:absolute;inset:0;border-radius:999px;background:var(--prio-critical)"></span>
      <span style="position:absolute;inset:3px;border-radius:999px;background:var(--prio-critical)"></span>
    </span>`,
  });

function CriticalPulses({ points, onClick }: { points: MapPoint[]; onClick?: (p: MapPoint) => void }) {
  const icon = useMemo(() => pulseIcon(), []);
  return (
    <>
      {points.map((p, i) => (
        <Marker
          key={p.id ?? i}
          position={[p.lat, p.lng]}
          icon={icon}
          eventHandlers={onClick ? { click: () => onClick(p) } : undefined}
        />
      ))}
    </>
  );
}

function IncidentLayer({ incidents }: { incidents: Incident[] }) {
  const { t } = useTranslation('gov');
  return (
    <>
      {incidents.map((i) => (
        <CircleMarker
          key={i.id}
          center={[i.centroid.lat, i.centroid.lng]}
          radius={Math.min(26, 8 + Math.sqrt(i.support_count) * 2.5)}
          pathOptions={{
            color: `var(--dept-${i.category})`,
            fillColor: `var(--dept-${i.category})`,
            fillOpacity: 0.28,
            weight: 2,
          }}
        >
          <Tooltip>
            {i.title_en} · {t('map.reports', { count: i.grievance_ids.length })}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

function WardLayer({
  wards,
  values,
  onClick,
}: {
  wards: WardsGeoJSON;
  values?: Record<string, number>;
  onClick?: (id: string) => void;
}) {
  const max = Math.max(1, ...Object.values(values ?? {}));
  return (
    <GeoJSON
      // Leaflet copies styles at creation, so new values need a fresh layer.
      key={JSON.stringify(values ?? null)}
      data={wards as unknown as FeatureCollection}
      style={(f) => {
        const v = values?.[f?.properties?.id] ?? 0;
        return {
          color: 'var(--accent)',
          weight: 1,
          opacity: 0.55,
          fillColor: 'var(--accent)',
          fillOpacity: values ? 0.06 + (v / max) * 0.5 : 0.04,
        };
      }}
      onEachFeature={(f, layer) => {
        layer.bindTooltip(`${f.properties.name} · ${f.properties.zone}`, { sticky: true });
        if (onClick) layer.on('click', () => onClick(f.properties.id));
      }}
    />
  );
}

export interface GovMapLayersProps {
  points: MapPoint[];
  incidents: Incident[];
  wards?: WardsGeoJSON;
  wardValues?: Record<string, number>;
  layers: MapLayer[];
  onWardClick?: (id: string) => void;
  onPointClick?: (p: MapPoint) => void;
}

export default function GovMapLayers({
  points,
  incidents,
  wards,
  wardValues,
  layers,
  onWardClick,
  onPointClick,
}: GovMapLayersProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    pluginsReady.then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  const critical = useMemo(
    () => points.filter((p) => p.priority === 'critical' && !['closed', 'rejected', 'merged'].includes(p.status)),
    [points],
  );
  if (!ready) return null;
  return (
    <>
      {layers.includes('wards') && wards && (
        <WardLayer wards={wards} values={wardValues} onClick={onWardClick} />
      )}
      {layers.includes('heat') && points.length > 0 && <HeatLayer points={points} />}
      {layers.includes('clusters') && points.length > 0 && (
        <ClusterLayer points={points} onClick={onPointClick} />
      )}
      {layers.includes('incidents') && <IncidentLayer incidents={incidents} />}
      {layers.includes('critical') && <CriticalPulses points={critical} onClick={onPointClick} />}
    </>
  );
}
