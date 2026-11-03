// Citizen conversation: English for the officer, original one click away (Spec C §5.2).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessagesSquare } from 'lucide-react';
import type { Message } from '@contracts/types';
import { EmptyState } from '@/design/components';
import { isRtl } from '@/lib/i18n';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';

function Bubble({ m }: { m: Message }) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const [original, setOriginal] = useState(false);
  const mine = m.sender === 'officer';
  const hasOther = m.text.lang !== 'en' && m.text.original !== m.text.en;
  const lang = original ? m.text.lang : 'en';
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')} data-testid="message">
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--radius-md)] px-3 py-2',
          mine ? 'bg-primary/12' : 'bg-surface-2',
        )}
      >
        <p className="text-sm break-words" lang={lang} dir={isRtl(lang) ? 'rtl' : 'ltr'}>
          {original ? m.text.original : m.text.en}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
          <span>{m.sender_name ?? t(`case.sender.${m.sender}`)}</span>
          <time dateTime={m.created_at}>{fmt.dateTime(m.created_at)}</time>
          {hasOther && (
            <button type="button" className="underline" onClick={() => setOriginal((v) => !v)}>
              {original ? t('case.show_english') : t('case.show_original')}
            </button>
          )}
        </p>
      </div>
    </li>
  );
}

export function MessageThread({ messages }: { messages: Message[] }) {
  const { t } = useTranslation('gov');
  if (messages.length === 0) {
    return <EmptyState icon={MessagesSquare} title={t('case.no_messages')} className="py-6" />;
  }
  return (
    <ol className="space-y-2" aria-live="polite" aria-label={t('case.messages')}>
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
    </ol>
  );
}
