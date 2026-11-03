// MapView: Leaflet base map with theme-aware CARTO tiles and attribution.
// Leaflet is lazy-loaded so it never lands in the main bundle. Children are react-leaflet layers
// (import them from 'react-leaflet' inside your own lazily loaded page).
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinOff } from 'lucide-react';
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

const loadImpl = () => import('./MapViewImpl');
// React caches a rejected lazy() forever, so "back online" swaps in a fresh one (module-level, shared by all maps).
let MapViewImpl = lazy(loadImpl);
let implFailed = false;

/** P7: a map that can't load (offline before Leaflet arrived) must never take the page down. */
class MapBoundary extends Component<
  { fallback: ReactNode; onRetry: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    implFailed = true;
    window.addEventListener('online', this.retry, { once: true });
  }
  componentWillUnmount() {
    window.removeEventListener('online', this.retry);
  }
  retry = () => {
    if (implFailed) {
      MapViewImpl = lazy(loadImpl);
      implFailed = false;
    }
    this.setState({ failed: false });
    this.props.onRetry();
  };
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function MapUnavailable({ height, className }: { height: number | string; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <div
      className={cn(
        'bg-surface-2 text-muted-foreground grid w-full place-items-center rounded-[var(--radius-lg)] border text-sm',
        className,
      )}
      style={{ height }}
      role="img"
      aria-label={t('map_unavailable')}
      data-testid="map-unavailable"
    >
      <span className="flex flex-col items-center gap-2 p-4 text-center">
        <MapPinOff className="size-6" aria-hidden />
        {t('map_unavailable')}
      </span>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  const height = props.height ?? 320;
  const [, rerender] = useState(0);
  return (
    <MapBoundary
      fallback={<MapUnavailable height={height} className={props.className} />}
      onRetry={() => rerender((n) => n + 1)}
    >
      <Suspense
        fallback={
          <Skeleton className={cn('w-full rounded-[var(--radius-lg)]', props.className)} style={{ height }} />
        }
      >
        <MapViewImpl {...props} height={height} />
      </Suspense>
    </MapBoundary>
  );
}

/**
 * P7: wrap a page's own lazily loaded map chunk. If it can't load (offline), show the "map unavailable"
 * placeholder instead of the page error screen; the rest of the page keeps working.
 */
export function MapChunkBoundary({
  height,
  className,
  children,
}: {
  height: number | string;
  className?: string;
  children: ReactNode;
}) {
  const [, rerender] = useState(0);
  return (
    <MapBoundary
      fallback={<MapUnavailable height={height} className={className} />}
      onRetry={() => rerender((n) => n + 1)}
    >
      {children}
    </MapBoundary>
  );
}
