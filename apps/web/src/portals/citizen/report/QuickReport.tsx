// Quick report (Spec A §5.6): photo → location (auto GPS) → optional line → analyze → ConfirmationCard → submit.
// Target: 3 taps (photo, continue, confirm). Duplicates are checked before creating, so "Add my support"
// never leaves a stray new ticket behind.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Loader2, MapPin, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DuplicateMatch, GrievanceDraft, Location, Media } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { PageTransition } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk, type CreateGrievanceRequest } from '@/lib/api/endpoints';
import { replyLang, usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { ConfirmationCard, type ConfirmOptions } from './ConfirmationCard';
import { DuplicateSheet, SupportCelebration } from './DuplicateSheet';
import { wardAt } from './geo';
import { LocationSheet, locationLabel } from './LocationSheet';
import { queueOutbox } from './outbox';
import { PhotoTray, usePhotoUpload } from './PhotoAttach';
import { SubmittedScreen, type SubmittedItem } from './SubmittedScreen';

type Phase = 'capture' | 'confirm' | 'done' | 'supported' | 'queued';

function useAutoLocation(enabled: boolean, onFix: (l: Location) => void) {
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        onFix({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy_m: Math.round(p.coords.accuracy), source: 'gps' }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

export default function QuickReport() {
  const { t } = useTranslation('citizen');
  const prefs = usePrefs();
  const qc = useQueryClient();
  const uiLang = replyLang(prefs);
  const [phase, setPhase] = useState<Phase>('capture');
  const [media, setMedia] = useState<Media[]>([]);
  const [rawLocation, setLocation] = useState<Location | undefined>();
  // A GPS fix gets its ward (and a readable label) from the ward polygons.
  const wards = useQuery({ queryKey: qk.meta.wardsGeoJSON, queryFn: ({ signal }) => api.wardsGeoJSON(signal), staleTime: Infinity });
  const location = useMemo<Location | undefined>(() => {
    if (!rawLocation || rawLocation.ward_id) return rawLocation;
    const w = wardAt(wards.data, rawLocation.lat, rawLocation.lng);
    return w ? { ...rawLocation, ward_id: w.id, ward_name: w.name, zone: w.zone, address: rawLocation.address ?? `${w.name}, Hyderabad` } : rawLocation;
  }, [rawLocation, wards.data]);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<GrievanceDraft | null>(null);
  const [dups, setDups] = useState<DuplicateMatch[]>([]);
  const [pendingSubmit, setPendingSubmit] = useState<ConfirmOptions | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedItem[]>([]);
  const [supportCount, setSupportCount] = useState<number>();
  const [locOpen, setLocOpen] = useState(false);

  const photo = usePhotoUpload((m) => setMedia((cur) => [...cur.filter((x) => x.id !== m.id), m]), location);
  useAutoLocation(prefs.consent_location === true, (l) => setLocation((cur) => cur ?? l));

  const analyze = useMutation({
    mutationFn: ({ txt, loc }: { txt: string; loc?: Location }) =>
      api.analyzeGrievance({ text: txt, ui_lang: uiLang, media_ids: media.map((m) => m.id), location: loc }),
    onSuccess: (d) => {
      setDraft(d);
      setPhase('confirm');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const create = useMutation({
    mutationFn: (body: CreateGrievanceRequest) => api.createGrievance(body),
    onSuccess: (r) => {
      setSubmitted([{ grievance_id: r.grievance.id, guest_pin: r.guest_pin }]);
      setPhase('done');
      qc.invalidateQueries({ queryKey: qk.grievances.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const body = (o: ConfirmOptions): CreateGrievanceRequest => ({
    draft: draft!,
    location: location ?? draft!.location ?? { lat: 0, lng: 0, source: 'text' },
    media_ids: media.map((m) => m.id),
    is_anonymous: o.is_anonymous,
    is_private: o.is_private,
  });

  const submit = async (o: ConfirmOptions) => {
    if (!draft) return;
    if (!navigator.onLine) {
      await queueOutbox(body(o), draft.title.original);
      setPhase('queued');
      return;
    }
    const where = location ?? draft.location;
    if (where && dups.length === 0 && !pendingSubmit) {
      try {
        const matches = await api.checkDuplicates({ text: draft.cleaned_original, location: where, category: draft.category });
        if (matches.length) {
          setDups(matches);
          setPendingSubmit(o);
          return;
        }
      } catch {
        /* duplicate check is advisory; continue to submit */
      }
    }
    create.mutate(body(o));
  };

  const support = useMutation({
    mutationFn: (m: DuplicateMatch) => api.supportGrievance((m.incident_id ?? m.grievance_id)!),
    onSuccess: (r) => {
      setSupportCount(r.support_count + 1);
      setDups([]);
      setPhase('supported');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const restart = () => {
    setPhase('capture');
    setMedia([]);
    setText('');
    setDraft(null);
    setDups([]);
    setPendingSubmit(null);
    setSubmitted([]);
  };

  const steps = [
    { done: media.some((m) => m.quality?.ok !== false), label: t('quick.step_photo') },
    { done: !!location, label: t('quick.step_location') },
    { done: text.trim().length > 0, label: t('quick.step_text') },
  ];

  return (
    <PageTransition className="mx-auto max-w-xl space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold md:text-3xl">{t('quick.title')}</h1>
        <p className="text-muted-foreground">{t('quick.subtitle')}</p>
      </header>

      {phase === 'capture' && (
        <>
          <ol className="flex gap-2" aria-label={t('quick.steps')}>
            {steps.map((s, i) => (
              <li key={i} className={cn('flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium', s.done ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted-foreground')}>
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>

          {photo.inputEl}
          {media.length === 0 ? (
            <button
              type="button"
              onClick={photo.open}
              disabled={photo.busy}
              className="bg-primary text-primary-foreground shadow-glow-primary flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] text-lg font-semibold"
              data-testid="quick-photo"
            >
              {photo.busy ? <Loader2 className="size-12 animate-spin" aria-hidden /> : <Camera className="size-14" aria-hidden />}
              {t('quick.take_photo')}
            </button>
          ) : (
            <div className="space-y-2">
              <PhotoTray media={media} onRemove={(id) => setMedia((m) => m.filter((x) => x.id !== id))} onRetake={() => { setMedia((m) => m.filter((x) => x.quality?.ok !== false)); photo.open(); }} />
              <Button variant="ghost" size="sm" onClick={photo.open} disabled={photo.busy}>
                <ImagePlus className="size-4" aria-hidden />
                {t('quick.add_another')}
              </Button>
            </div>
          )}

          <button type="button" onClick={() => setLocOpen(true)} className="bg-surface flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-start" data-testid="quick-location">
            <MapPin className={cn('size-5 shrink-0', location ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            <span className="flex-1">{location ? locationLabel(location) : t('quick.add_location')}</span>
            <span className="text-primary text-sm font-medium">{location ? t('quick.change') : t('quick.add')}</span>
          </button>

          <div className="space-y-1.5">
            <Label htmlFor="quick-text">{t('quick.one_line')}</Label>
            <Input id="quick-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('quick.one_line_placeholder')} className="h-12" dir="auto" data-testid="quick-text" />
          </div>

          <Button
            className="touch-target h-14 w-full text-base"
            disabled={!media.length || analyze.isPending || photo.busy}
            onClick={() => analyze.mutate({ txt: text.trim() || t('quick.photo_only'), loc: location })}
            data-testid="quick-continue"
          >
            {analyze.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
            {t('quick.continue')}
          </Button>
        </>
      )}

      {phase === 'confirm' && draft && (
        <ConfirmationCard
          draft={draft}
          location={location}
          media={media}
          uiLang={uiLang}
          busy={create.isPending}
          onConfirm={submit}
          onEdit={(txt) => analyze.mutate({ txt, loc: location })}
          onCancel={() => setPhase('capture')}
          onAddLocation={() => setLocOpen(true)}
        />
      )}

      {phase === 'done' && <SubmittedScreen items={submitted} onReportAnother={restart} />}
      {phase === 'supported' && (
        <div className="space-y-3">
          <SupportCelebration count={supportCount} />
          <Button variant="ghost" className="touch-target mx-auto flex" onClick={restart}>
            {t('submitted.another')}
          </Button>
        </div>
      )}
      {phase === 'queued' && (
        <div className="bg-surface space-y-3 rounded-[var(--radius-xl)] border p-6 text-center" role="status" data-testid="queued-notice">
          <p className="font-display text-lg font-semibold">{t('outbox.queued_title')}</p>
          <p className="text-muted-foreground text-sm">{t('outbox.queued_body')}</p>
          <Button variant="ghost" onClick={restart}>
            {t('submitted.another')}
          </Button>
        </div>
      )}

      <DuplicateSheet
        open={dups.length > 0}
        onOpenChange={(o) => {
          if (!o) setDups([]);
        }}
        matches={dups}
        busy={support.isPending || create.isPending}
        onSupport={(m) => support.mutate(m)}
        onFileNew={() => {
          const o = pendingSubmit ?? { is_anonymous: prefs.anonymous_default, is_private: false };
          setDups([]);
          create.mutate(body(o));
        }}
      />
      <LocationSheet
        open={locOpen}
        onOpenChange={setLocOpen}
        onSelect={(l) => {
          setLocation(l);
          if (phase === 'confirm' && draft) analyze.mutate({ txt: draft.cleaned_original, loc: l });
        }}
        suggestion={draft?.location?.source === 'text' ? draft.location : undefined}
        current={location}
      />
    </PageTransition>
  );
}
