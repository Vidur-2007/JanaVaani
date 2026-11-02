// GovMap (Spec C §4). The Leaflet layers live in GovMapLayers so plugins load only on pages that show a map.
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import type { DepartmentId, GeoPoint, Incident, MapPoint } from '@contracts/types';
import { MapView } from '@/design/components';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';
import { api, qk } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';

const GovMapLayers = lazy(() => import('./GovMapLayers'));

export type MapLayer = 'heat' | 'clusters' | 'wards' | 'incidents' | 'critical';
const LAYERS: MapLayer[] = ['heat', 'clusters', 'wards', 'incidents', 'critical'];

export interface GovMapProps {
  points?: MapPoint[];
  incidents?: Incident[];
  /** Ward id → value; shades the choropleth. */
  wardValues?: Record<string, number>;
  defaultLayers?: MapLayer[];
  /** Hide layers a page has no data for. */
  availableLayers?: MapLayer[];
  onWardClick?: (wardId: string) => void;
  onPointClick?: (point: MapPoint) => void;
  /** Replaces cluster zoom-in with a case list. */
  onClusterClick?: (points: MapPoint[]) => void;
  center?: GeoPoint;
  zoom?: number;
  height?: number | string;
  scrollWheelZoom?: boolean;
  className?: string;
  /** Rendered inside the map, e.g. a page's own overlay. */
  children?: ReactNode;
}

const LEGEND: DepartmentId[] = ['roads', 'water', 'drainage', 'sanitation', 'streetlights', 'power'];

export function GovMap({
  points = [],
  incidents = [],
  wardValues,
  defaultLayers = ['heat', 'critical'],
  availableLayers = LAYERS,
  onWardClick,
  onPointClick,
  onClusterClick,
  center,
  zoom = 11,
  height = 420,
  scrollWheelZoom = true,
  className,
  children,
}: GovMapProps) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const [layers, setLayers] = useState<string[]>(defaultLayers);
  const show = (l: MapLayer) => layers.includes(l);
  const geo = useQuery({
    queryKey: qk.meta.wardsGeoJSON,
    queryFn: ({ signal }) => api.wardsGeoJSON(signal),
    staleTime: Infinity,
    enabled: show('wards'),
  });

  return (
    <div className={cn('relative', className)} data-testid="gov-map">
      <MapView
        center={center}
        zoom={zoom}
        height={height}
        scrollWheelZoom={scrollWheelZoom}
        showBoundaryNote={show('wards')}
        ariaLabel={t('map.label')}
      >
        <Suspense fallback={null}>
          <GovMapLayers
            points={points}
            incidents={incidents}
            wards={show('wards') ? geo.data : undefined}
            wardValues={wardValues}
            layers={layers as MapLayer[]}
            onWardClick={onWardClick}
            onPointClick={onPointClick}
            onClusterClick={onClusterClick}
          />
        </Suspense>
        {children}
      </MapView>

      <div className="glass absolute end-2 top-2 z-[500] flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto rounded-[var(--radius-md)] p-1">
        <Layers className="text-muted-foreground mx-1 size-4 shrink-0" aria-hidden />
        <ToggleGroup
          type="multiple"
          size="sm"
          value={layers}
          onValueChange={setLayers}
          aria-label={t('map.layers')}
        >
          {availableLayers.map((l) => (
            <ToggleGroupItem key={l} value={l} className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary min-h-11 px-2 text-xs md:min-h-8">
              {t(`map.layer.${l}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {show('clusters') && (
        <ul
          className="glass absolute start-2 bottom-6 z-[500] hidden gap-x-3 gap-y-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] sm:grid sm:grid-cols-3"
          aria-label={t('map.legend')}
        >
          {LEGEND.map((d) => (
            <li key={d} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: `var(--dept-${d})` }} aria-hidden />
              {tc(`departments.${d}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
