// Photo attach (Spec A §5.4, feature 31): compress (≤ 1600 px, ~200 KB) → POST /uploads (purpose 'evidence') →
// thumbnail with a quality badge; a friendly retake prompt when quality.ok is false.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CheckCircle2, ImageOff, Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GeoPoint, Media } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { errorMessage } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/api/client';

export async function compressImage(file: File): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression');
  try {
    return await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.2, useWebWorker: true, initialQuality: 0.82 });
  } catch {
    return file; // Compression is an optimization; never block the report on it.
  }
}

/** Hook: pick → compress → upload. `pickRef` opens the hidden file input (camera on mobile). */
export function usePhotoUpload(onUploaded: (m: Media) => void, where?: GeoPoint, purpose: Media['purpose'] = 'evidence') {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const handle = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const small = await compressImage(file);
      const media = await api.upload({ file: small, purpose, lat: where?.lat, lng: where?.lng });
      onUploaded(media);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const inputEl = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => handle(e.target.files?.[0])}
      data-testid="photo-input"
    />
  );
  return { busy, open: () => input.current?.click(), inputEl, handle };
}

export function PhotoButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslation('citizen');
  return (
    <Button type="button" variant="ghost" size="icon" className="touch-target rounded-full" onClick={onClick} disabled={busy} aria-label={t('report.photo_add')} data-testid="photo-button">
      {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
    </Button>
  );
}

/** Pending attachments above the composer, with quality feedback. */
export function PhotoTray({ media, onRemove, onRetake }: { media: Media[]; onRemove: (id: string) => void; onRetake: () => void }) {
  const { t } = useTranslation('citizen');
  if (!media.length) return null;
  const bad = media.find((m) => m.quality && !m.quality.ok);
  return (
    <div className="space-y-2" data-testid="photo-tray">
      <ul className="flex gap-2 overflow-x-auto">
        {media.map((m) => {
          const ok = m.quality?.ok !== false;
          return (
            <li key={m.id} className="relative shrink-0">
              <img src={mediaUrl(m.url)} alt={m.ai?.description_en ?? t('report.photo_alt')} className={cn('size-20 rounded-xl border-2 object-cover', ok ? 'border-transparent' : 'border-warning')} />
              <span
                className={cn('absolute start-1 bottom-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white', ok ? 'bg-success' : 'bg-warning')}
                data-testid={ok ? 'photo-ok' : 'photo-bad'}
              >
                {ok ? <CheckCircle2 className="size-3" aria-hidden /> : <ImageOff className="size-3" aria-hidden />}
                {ok ? t('report.photo_ok') : t(`report.photo_issue.${m.quality?.issue ?? 'none'}`)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                className="bg-text text-bg absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full"
                aria-label={t('report.photo_remove')}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {bad && (
        <div className="bg-warning/12 border-warning/40 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm" role="status" data-testid="retake-prompt">
          <p className="min-w-0 flex-1">{t('report.photo_retake_hint')}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetake}>
            <RotateCcw className="size-4" aria-hidden />
            {t('report.photo_retake')}
          </Button>
        </div>
      )}
    </div>
  );
}
