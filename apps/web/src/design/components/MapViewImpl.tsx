import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { HYDERABAD, type MapViewProps } from './MapView';

// CARTO basemaps now require an API key (tiles come back watermarked), so the default is keyless
// OpenStreetMap tiles; the Ink theme darkens them with a CSS filter (see `.jv-tiles-dark` below).
// Set VITE_TILE_URL (+ VITE_TILE_ATTRIBUTION) to use another provider, e.g. a keyed CARTO URL.
const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  (import.meta.env.VITE_TILE_ATTRIBUTION as string | undefined) ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARK_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6)';

export default function MapViewImpl({
  center = HYDERABAD,
  zoom = 12,
  className,
  height,
  children,
  scrollWheelZoom = false,
  showBoundaryNote,
  ariaLabel,
}: MapViewProps) {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const dark = theme === 'ink' && !import.meta.env.VITE_TILE_URL;
  return (
    <div
      className={cn('relative overflow-hidden rounded-[var(--radius-lg)] border', className)}
      style={{ height }}
      role="region"
      aria-label={ariaLabel ?? t('map.label')}
    >
      {dark && <style>{`.jv-tiles-dark .leaflet-tile-pane{filter:${DARK_FILTER}}`}</style>}
      {/* 44px zoom buttons (touch targets, Spec §11 accessibility). */}
      <style>{`.leaflet-bar a,.leaflet-touch .leaflet-bar a{width:44px;height:44px;line-height:44px;font-size:22px}`}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className={cn('size-full', dark && 'jv-tiles-dark')}
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
        {children}
      </MapContainer>
      {showBoundaryNote && (
        <span className="glass pointer-events-none absolute start-2 top-2 z-[500] rounded-full px-2.5 py-1 text-[11px] font-medium">
          {t('map.approximate_boundaries')}
        </span>
      )}
    </div>
  );
}
