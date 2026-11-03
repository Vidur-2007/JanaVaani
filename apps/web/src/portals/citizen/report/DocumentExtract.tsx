// S5 (feature 29): "Read a notice or bill" — photograph a document; AI reads it and drafts the complaint.
// The citizen sees what was read (AI badge), can use it as the starting text, and the photo stays attached.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, X } from 'lucide-react';
import type { DeepLang, Media } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { AIBadge } from '@/design/components';
import { errorMessage, mediaUrl } from '@/lib/api/client';
import { pickLocalized } from '@/lib/localized';
import { toast } from 'sonner';
import { apiExt } from '../api-ext';
import type { DocumentExtractResponse } from '../types-ext';
import { usePhotoUpload } from './PhotoAttach';

export interface DocResult {
  media: Media;
  doc: DocumentExtractResponse;
}

export function useDocumentReader(uiLang: DeepLang) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DocResult | null>(null);
  const upload = usePhotoUpload(async (media) => {
    setBusy(true);
    try {
      const doc = await apiExt.extractDocument({ media_id: media.id, ui_lang: uiLang });
      setResult({ media, doc });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  });
  return {
    busy: busy || upload.busy,
    open: upload.open,
    inputEl: upload.inputEl,
    result,
    clear: () => setResult(null),
  };
}

export function DocButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslation('citizen');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="touch-target rounded-full"
      onClick={onClick}
      disabled={busy}
      aria-label={t('doc.read')}
      data-testid="doc-button"
    >
      {busy ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <FileText className="size-5" aria-hidden />
      )}
    </Button>
  );
}

export function DocCard({
  result,
  uiLang,
  onUse,
  onDiscard,
}: {
  result: DocResult;
  uiLang: DeepLang;
  onUse: (text: string, media: Media) => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation('citizen');
  const { doc, media } = result;
  const summary = pickLocalized(doc.summary, uiLang);
  const suggestion = pickLocalized(doc.suggested_text, uiLang);
  return (
    <section
      className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4"
      aria-labelledby="doc-title"
      data-testid="doc-card"
    >
      <div className="flex items-start gap-3">
        <img
          src={mediaUrl(media.url)}
          alt={t('doc.photo_alt')}
          className="size-16 shrink-0 rounded-lg border object-cover"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="doc-title" className="font-medium">
              {t(`doc.type.${doc.doc_type}`)}
            </h3>
            <AIBadge />
          </div>
          <p className="text-muted-foreground text-sm" lang={summary.lang} dir={summary.dir}>
            {summary.text}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="touch-target -me-2 -mt-2 shrink-0"
          onClick={onDiscard}
          aria-label={t('doc.discard')}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {Object.keys(doc.fields).length > 0 && (
        <dl className="bg-surface-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg p-3 text-sm">
          {Object.entries(doc.fields).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-muted-foreground text-xs">
                {t(`doc.fields.${k}`, { defaultValue: k.replace(/_/g, ' ') })}
              </dt>
              <dd className="tabular truncate font-medium" dir="auto">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-muted-foreground text-xs">{t('doc.check_note')}</p>
      <Button
        type="button"
        className="touch-target w-full"
        onClick={() => onUse(suggestion.text, media)}
        data-testid="doc-use"
      >
        {t('doc.use')}
      </Button>
    </section>
  );
}
