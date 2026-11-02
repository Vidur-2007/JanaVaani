// Location capture (Spec A §5.7): GPS with accuracy · pick on map (draggable pin, ward overlay, live ward name) ·
// typed landmark. An AI-extracted place shows as a one-tap "Did you mean …?" suggestion.
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Loader2, MapPin, Sparkles } from 'lucide-react';
import type { GeoPoint, Location } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/design/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design/ui/tabs';
import { HYDERABAD, Skeleton, MapChunkBoundary } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { usePrefs } from '@/lib/prefs/store';
import { wardAt } from './geo';

const LocationMap = lazy(() => import('./LocationMap'));

export const locationLabel = (l: Location) =>
  l.landmark ?? l.address ?? l.ward_name ?? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;

type GpsState = { status: 'idle' | 'locating' | 'error' | 'denied'; fix?: GeoPoint & { accuracy: number } };

export function LocationSheet({
  open,
  onOpenChange,
  onSelect,
  suggestion,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (l: Location) => void;
  suggestion?: Location;
  current?: Location;
}) {
  const { t } = useTranslation('citizen');
  const setPrefs = usePrefs((s) => s.set);
  const wards = useQuery({
    queryKey: qk.meta.wardsGeoJSON,
    queryFn: ({ signal }) => api.wardsGeoJSON(signal),
    staleTime: Infinity,
    enabled: open,
  });
  const [tab, setTab] = useState<'gps' | 'map' | 'text'>('gps');
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [pin, setPin] = useState<GeoPoint>(current ?? suggestion ?? HYDERABAD);
  const [landmark, setLandmark] = useState('');

  useEffect(() => {
    if (open) setPin(current ?? suggestion ?? HYDERABAD);
  }, [open, current, suggestion]);

  const locate = () => {
    if (!('geolocation' in navigator)) return setGps({ status: 'error' });
    setGps({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const fix = {
          lat: +p.coords.latitude.toFixed(6),
          lng: +p.coords.longitude.toFixed(6),
          accuracy: Math.round(p.coords.accuracy),
        };
        setGps({ status: 'idle', fix });
        setPin(fix);
        setPrefs({ consent_location: true });
      },
      (e) => setGps({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const ward = wardAt(wards.data, pin.lat, pin.lng);
  const choose = (l: Location) => {
    onSelect(l);
    onOpenChange(false);
  };
  const withWard = (p: GeoPoint, extra: Partial<Location>): Location => {
    const w = wardAt(wards.data, p.lat, p.lng);
    return {
      lat: p.lat,
      lng: p.lng,
      ward_id: w?.id,
      ward_name: w?.name,
      zone: w?.zone,
      ...extra,
    } as Location;
  };

  const mapBox = (accuracy?: number, draggable = true) => (
    <MapChunkBoundary height={280}>
      <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-[var(--radius-lg)]" />}>
        <LocationMap
          pin={pin}
          onPinChange={draggable ? setPin : undefined}
          accuracy={accuracy}
          wards={wards.data}
          activeWardId={ward?.id}
        />
      </Suspense>
    </MapChunkBoundary>
  );
  const wardLine = (
    <p className="text-sm" aria-live="polite" data-testid="ward-name">
      <MapPin className="text-primary me-1 inline size-4 align-text-bottom" aria-hidden />
      {ward ? t('location.in_ward', { ward: ward.name, zone: ward.zone }) : t('location.outside')}
    </p>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-2xl overflow-y-auto rounded-t-[var(--radius-xl)]"
      >
        <SheetHeader>
          <SheetTitle>{t('location.title')}</SheetTitle>
          <SheetDescription>{t('location.subtitle')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {suggestion && (
            <button
              type="button"
              onClick={() => choose({ ...suggestion, source: 'text' })}
              className="bg-ai/10 border-ai/30 flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-start"
              data-testid="location-suggestion"
            >
              <Sparkles className="text-ai size-5 shrink-0" aria-hidden />
              <span className="flex-1">
                {t('location.did_you_mean', { place: locationLabel(suggestion) })}
              </span>
              <span className="text-ai text-sm font-medium">{t('location.use_this')}</span>
            </button>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid h-11 w-full grid-cols-3">
              <TabsTrigger value="gps">{t('location.tab_gps')}</TabsTrigger>
              <TabsTrigger value="map">{t('location.tab_map')}</TabsTrigger>
              <TabsTrigger value="text">{t('location.tab_text')}</TabsTrigger>
            </TabsList>

            <TabsContent value="gps" className="space-y-3 pt-3">
              {!gps.fix ? (
                <div className="space-y-3 text-center">
                  <p className="text-muted-foreground text-sm">{t('location.gps_hint')}</p>
                  <Button
                    className="touch-target h-12 w-full"
                    onClick={locate}
                    disabled={gps.status === 'locating'}
                    data-testid="gps-locate"
                  >
                    {gps.status === 'locating' ? (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    ) : (
                      <Crosshair className="size-5" aria-hidden />
                    )}
                    {gps.status === 'locating' ? t('location.locating') : t('location.use_gps')}
                  </Button>
                  {gps.status === 'denied' && <p className="text-danger text-sm">{t('location.denied')}</p>}
                  {gps.status === 'error' && <p className="text-danger text-sm">{t('location.gps_error')}</p>}
                </div>
              ) : (
                <>
                  {mapBox(gps.fix.accuracy, false)}
                  {wardLine}
                  <p className="text-muted-foreground text-xs">
                    {t('location.accuracy', { m: gps.fix.accuracy })}
                  </p>
                  <Button
                    className="touch-target h-12 w-full"
                    onClick={() =>
                      choose(
                        withWard(gps.fix!, {
                          source: 'gps',
                          accuracy_m: gps.fix!.accuracy,
                          address: ward ? `${ward.name}, Hyderabad` : undefined,
                        }),
                      )
                    }
                    data-testid="location-confirm"
                  >
                    {t('location.confirm')}
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="map" className="space-y-3 pt-3">
              {mapBox()}
              {wardLine}
              <p className="text-muted-foreground text-xs">{t('location.drag_hint')}</p>
              <Button
                className="touch-target h-12 w-full"
                onClick={() =>
                  choose(
                    withWard(pin, { source: 'pin', address: ward ? `${ward.name}, Hyderabad` : undefined }),
                  )
                }
                data-testid="location-confirm-pin"
              >
                {t('location.confirm')}
              </Button>
            </TabsContent>

            <TabsContent value="text" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="landmark">{t('location.landmark')}</Label>
                <Input
                  id="landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder={t('location.landmark_placeholder')}
                  className="h-12"
                />
              </div>
              <Button
                className="touch-target h-12 w-full"
                disabled={landmark.trim().length < 3}
                onClick={() =>
                  choose(
                    withWard(pin, { source: 'text', landmark: landmark.trim(), address: landmark.trim() }),
                  )
                }
                data-testid="location-confirm-text"
              >
                {t('location.confirm')}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function LocationButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  const { t } = useTranslation('citizen');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={active ? 'touch-target text-primary rounded-full' : 'touch-target rounded-full'}
      onClick={onClick}
      aria-label={t('report.share_location')}
      aria-pressed={active}
      data-testid="location-button"
    >
      <MapPin className="size-5" aria-hidden />
    </Button>
  );
}
