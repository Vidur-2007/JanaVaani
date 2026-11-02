// MapView: Leaflet base map with theme-aware CARTO tiles and attribution.
// Leaflet is lazy-loaded so it never lands in the main bundle. Children are react-leaflet layers
// (import them from 'react-leaflet' inside your own lazily loaded page).
import { lazy, Suspense, type ReactNode } from 'react';
import type { GeoPoint } from '@contracts/types';
import { Skeleton } from '@/design/ui/skeleton';
import { cn } from '@/lib/utils';

export interface MapViewProps {
  center?: GeoPoint;
  zoom?: number;
  className?: string;
  /** CSS height (default 320px). */
  height?: number | string;
  children?: ReactNode;
  /** Disable scroll-wheel zoom (default true on small embeds). */
  scrollWheelZoom?: boolean;
  /** Show the "Approximate demo boundaries" note (when drawing ward polygons). */
  showBoundaryNote?: boolean;
  ariaLabel?: string;
}

/** Hyderabad city center. */
export const HYDERABAD: GeoPoint = { lat: 17.385, lng: 78.4867 };

const MapViewImpl = lazy(() => import('./MapViewImpl'));

export function MapView(props: MapViewProps) {
  const height = props.height ?? 320;
  return (
    <Suspense fallback={<Skeleton className={cn('w-full rounded-[var(--radius-lg)]', props.className)} style={{ height }} />}>
      <MapViewImpl {...props} height={height} />
    </Suspense>
  );
}
