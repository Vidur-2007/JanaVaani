// Resolve flow (Spec C §5.2): proof photo + device GPS + note, then the AI verdict inline.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CheckCircle2, LocateFixed, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { GeoPoint, Grievance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Textarea } from '@/design/ui/textarea';
import { api } from '@/lib/api/endpoints';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { VerificationBadge } from '@/portals/gov-shared/components/VerificationBadge';
import { useCaseAction } from '../../hooks/useCaseAction';

const compress = async (file: File): Promise<File> => {
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    return await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
  } catch {
    return file;
  }
};

export function VerificationResult({ grievance: g }: { grievance: Grievance }) {
  const { t } = useTranslation('gov');
  if (!g.ai_verification) return null;
  return (
    <Panel ai title={t('resolve.result')}>
      {g.ai_verification.verdict === 'suspicious' && (
        <p
          role="alert"
          data-testid="suspicious-banner"
          className="bg-danger/12 text-danger flex items-center gap-2 rounded-[var(--radius-sm)] p-2 text-sm font-medium"
        >
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          {t('resolve.supervisor_notified')}
        </p>
      )}
      <VerificationBadge verification={g.ai_verification} detailed />
    </Panel>
  );
}

export function ResolveForm({ grievance: g }: { grievance: Grievance }) {
  const { t } = useTranslation('gov');
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<GeoPoint | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'busy' | 'denied'>('idle');

  const locate = () => {
    if (!navigator.geolocation) return setGpsState('denied');
    setGpsState('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGpsState('idle');
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = useCaseAction(
    g.id,
    async () => {
      const small = await compress(file!);
      const media = await api.upload({ file: small, purpose: 'resolution_proof', grievance_id: g.id, ...gps });
      return api.resolve(g.id, { media_ids: [media.id], note: note.trim(), ...gps });
    },
    () => toast.success(t('resolve.submitted')),
  );

  return (
    <Panel title={t('resolve.title')}>
      <div className="space-y-1">
        <Label>{t('resolve.proof')}</Label>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={t('resolve.proof')}
          data-testid="resolve-photo"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 w-full justify-start md:min-h-9"
          onClick={() => input.current?.click()}
        >
          <Camera className="size-4" aria-hidden />
          <span className="truncate">{file?.name ?? t('resolve.choose_photo')}</span>
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 w-full justify-start md:min-h-9"
        disabled={gpsState === 'busy'}
        onClick={locate}
      >
        {gps ? (
          <CheckCircle2 className="text-success size-4" aria-hidden />
        ) : (
          <LocateFixed className="size-4" aria-hidden />
        )}
        {gps ? t('resolve.gps_captured') : gpsState === 'denied' ? t('resolve.gps_denied') : t('resolve.capture_gps')}
      </Button>
      <div className="space-y-1">
        <Label htmlFor="resolve-note" className="text-xs">
          {t('resolve.note')}
        </Label>
        <Textarea id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>
      <Button
        className="min-h-11 w-full md:min-h-9"
        size="sm"
        disabled={!file || !note.trim() || submit.isPending}
        onClick={() => submit.mutate(undefined)}
        data-testid="resolve-submit"
      >
        {submit.isPending ? t('resolve.verifying') : t('resolve.submit')}
      </Button>
    </Panel>
  );
}
