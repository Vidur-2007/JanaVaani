// Report assistant (Spec A §5.4) — the hero feature. Driven entirely by POST /chat/turn; the UI follows response.stage.
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import type { DeepLang, Lang } from '@contracts/types';
import { PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { replyLang, usePrefs } from '@/lib/prefs/store';
import { Composer } from './Composer';
import { LanguageChip, ProgressDots, QuickReplies, type QuickReply } from './ChatChrome';
import { MessageList } from './MessageList';
import { isActionValue, useChatSession } from './useChatSession';

export default function ReportPage() {
  const { t } = useTranslation('citizen');
  const [params] = useSearchParams();
  const prefs = usePrefs();
  const uiLang = replyLang(prefs) as DeepLang;
  const assetId = params.get('asset') ?? undefined;
  const chat = useChatSession({ uiLang, greeting: t('report.greet') });
  const { response: res, stage, pending, send } = chat;

  // QR entry (/r/:assetId → /app/report?asset=…): the asset travels with every turn.
  const asset = useQuery({ queryKey: qk.meta.asset(assetId ?? ''), queryFn: ({ signal }) => api.asset(assetId!, signal), enabled: !!assetId });
  const { setAsset } = chat;
  useEffect(() => setAsset(assetId), [assetId, setAsset]);

  const pick = (q: QuickReply) => {
    if (isActionValue(q.value)) send({ action: q.value as never, display: q.label });
    else send({ text: q.value, display: q.label });
  };

  const quickReplies = useMemo(() => res?.quick_replies ?? [], [res]);
  const lang = (res?.detected_language ?? uiLang) as Lang;

  return (
    <PageTransition className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl flex-col">
      <header className="bg-bg/90 sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2 backdrop-blur md:static md:mx-0 md:px-0">
        <h1 className="font-display text-xl font-semibold md:text-2xl">{t('report.title')}</h1>
        <div className="flex items-center gap-3">
          {stage === 'collecting' && <ProgressDots total={chat.maxMissing} remaining={res?.missing_fields.length ?? chat.maxMissing} />}
          {res && <LanguageChip lang={lang} mixed={res.is_code_mixed} />}
        </div>
      </header>

      {asset.data && (
        <p className="bg-surface-2 mb-3 inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm">
          <QrCode className="text-primary size-4" aria-hidden />
          {t('report.asset', { label: asset.data.label_en })}
        </p>
      )}

      <div className="flex-1 py-2">
        <MessageList messages={chat.snap.messages} pending={pending} onSettled={chat.settle} onRetry={chat.retry} />
      </div>

      <div className="bg-bg/95 sticky bottom-16 z-10 -mx-4 space-y-2 px-4 pt-2 pb-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <QuickReplies items={quickReplies} onPick={pick} disabled={pending} />
        {stage !== 'submitted' && (
          <Composer lang={uiLang} disabled={pending} onSend={(text, mode) => send({ text, input_mode: mode })} autoFocus={params.get('mode') !== 'voice'} />
        )}
      </div>
    </PageTransition>
  );
}
