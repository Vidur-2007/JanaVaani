// Evidence gallery with lightbox, AI description and quality badge; before/after once proof exists (Spec C §5.2).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, TriangleAlert } from 'lucide-react';
import type { Media } from '@contracts/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design/ui/dialog';
import { AIBadge, BeforeAfterSlider, EmptyState } from '@/design/components';
import { mediaUrl } from '../lib/inbox';

export const beforeAfter = (media: Media[]) => ({
  before: media.find((m) => m.purpose === 'evidence'),
  after: media.findLast((m) => m.purpose === 'resolution_proof'),
});

export function EvidenceViewer({ media }: { media: Media[] }) {
  const { t } = useTranslation('gov');
  const [open, setOpen] = useState<Media | null>(null);
  const { before, after } = beforeAfter(media);
  if (media.length === 0) return <EmptyState icon={ImageOff} title={t('case.no_evidence')} className="py-6" />;
  return (
    <div className="space-y-3">
      {before && after && (
        <BeforeAfterSlider
          before={mediaUrl(before.url)}
          after={mediaUrl(after.url)}
          beforeAlt={before.ai?.description_en}
          afterAlt={after.ai?.description_en}
        />
      )}
      <ul className="grid grid-cols-3 gap-2">
        {media.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpen(m)}
              aria-label={t('case.open_photo', { description: m.ai?.description_en ?? t(`case.purpose.${m.purpose}`) })}
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-sm)] border"
            >
              <img src={mediaUrl(m.url)} alt="" className="size-full object-cover" loading="lazy" />
              {m.quality && !m.quality.ok && (
                <span className="bg-warning/90 absolute end-1 top-1 grid size-5 place-items-center rounded-full text-black">
                  <TriangleAlert className="size-3" aria-label={t('case.low_quality')} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>{open && t(`case.purpose.${open.purpose}`)}</DialogTitle>
          <DialogDescription className="sr-only">{t('case.photo_detail')}</DialogDescription>
          {open && (
            <div className="space-y-2">
              <img
                src={mediaUrl(open.url)}
                alt={open.ai?.description_en ?? t(`case.purpose.${open.purpose}`)}
                className="max-h-[65dvh] w-full rounded-[var(--radius-sm)] object-contain"
              />
              {open.ai?.description_en && (
                <p className="text-sm">
                  <AIBadge variant="generated" className="me-2" />
                  {open.ai.description_en}
                </p>
              )}
              {open.quality && !open.quality.ok && (
                <p className="text-warning text-xs">{t('case.low_quality')}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
