// The citizen's own words beside the English translation (Spec C §5.2). Script and direction follow the text, not the UI.
import { useTranslation } from 'react-i18next';
import type { Localized } from '@contracts/types';
import { LangBadge } from '@/design/components';
import { isRtl } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function TranslationSplit({
  text,
  codeMixed,
  className,
}: {
  text: Localized;
  codeMixed?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('gov');
  const same = text.lang === 'en' || text.original === text.en;
  return (
    <div className={cn('grid gap-3', !same && 'sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2', className)}>
      <figure className="min-w-0 space-y-1">
        <figcaption className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {t('case.original')}
          <LangBadge lang={text.lang} codeMixed={codeMixed} />
        </figcaption>
        <blockquote
          lang={text.lang}
          dir={isRtl(text.lang) ? 'rtl' : 'ltr'}
          data-testid="citizen-original"
          className="text-[15px] leading-[1.8] break-words whitespace-pre-wrap"
        >
          {text.original}
        </blockquote>
      </figure>
      {!same && (
        <figure className="min-w-0 space-y-1">
          <figcaption className="text-muted-foreground text-xs">{t('case.english')}</figcaption>
          <blockquote lang="en" dir="ltr" className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {text.en}
          </blockquote>
        </figure>
      )}
    </div>
  );
}
