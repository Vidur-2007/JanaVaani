import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { HYDERABAD, type MapViewProps } from './MapView';

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
  const style = theme === 'ink' ? 'dark_all' : 'light_all';
  return (
    <div
      className={cn('relative overflow-hidden rounded-[var(--radius-lg)] border', className)}
      style={{ height }}
      role="region"
      aria-label={ariaLabel ?? t('map.label')}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className="size-full"
        attributionControl
      >
        <TileLayer
          key={style}
          url={`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`}
          attribution={ATTRIBUTION}
          subdomains="abcd"
          maxZoom={19}
        />
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
