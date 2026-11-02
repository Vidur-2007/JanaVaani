// Report assistant (Spec A §5.4) — the hero feature. Driven entirely by POST /chat/turn; the UI follows response.stage.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { MapPin, QrCode, Users } from 'lucide-react';
import { Button } from '@/design/ui/button';
import type { DeepLang, Lang, Location } from '@contracts/types';
import { PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { replyLang, usePrefs } from '@/lib/prefs/store';
import { Composer } from './Composer';
import { ConfirmationCard, type ConfirmOptions } from './ConfirmationCard';
import { SplitDrafts } from './SplitDrafts';
import { DuplicateSheet, SupportCelebration } from './DuplicateSheet';
import { EmergencyTakeover } from './EmergencyTakeover';
import { LanguageChip, ProgressDots, QuickReplies, type QuickReply } from './ChatChrome';
import { MessageList } from './MessageList';
import { LocationButton, LocationSheet, locationLabel } from './LocationSheet';
import { PhotoButton, PhotoTray, usePhotoUpload } from './PhotoAttach';
import { isActionValue, useChatSession } from './useChatSession';

export default function ReportPage() {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
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

  const photo = usePhotoUpload(chat.attachMedia, chat.snap.location);

  const pick = (q: QuickReply) => {
    if (isActionValue(q.value)) send({ action: q.value as never, display: q.label });
    else send({ text: q.value, display: q.label });
  };

  // Location: the citizen's choice, or an AI-extracted place offered as a suggestion.
  const [locOpen, setLocOpen] = useState(false);
  const aiPlace = res?.draft?.location ?? res?.drafts?.[0]?.location;
  const suggestion = !chat.snap.location && aiPlace?.source === 'text' ? aiPlace : undefined;
  const askingLocation = stage === 'collecting' && !!res?.missing_fields.includes('location_detail');
  const onLocation = (l: Location) => {
    const label = locationLabel(l);
    if (stage === 'confirming') send({ action: 'edit', location: l, display: '📍 ' + label });
    else if (askingLocation) send({ text: label, display: '📍 ' + label, location: l });
    else chat.setLocation(l);
  };

  // Stages with their own UI replace the mock's action quick replies.
  const richStage = stage === 'confirming' || stage === 'duplicate_check' || stage === 'emergency';

  // Duplicate check: the sheet opens for each new duplicate_check response; closing it leaves a reopen card.
  const [dupClosedFor, setDupClosedFor] = useState<unknown>(null);
  const dupOpen = stage === 'duplicate_check' && !!res?.duplicates?.length && dupClosedFor !== res;
  const [supported, setSupported] = useState<{ count: number } | null>(null);
  const quickReplies = useMemo(() => (richStage ? [] : (res?.quick_replies ?? [])), [res, richStage]);
  const allMedia = useMemo(() => chat.snap.messages.flatMap((m) => m.media ?? []), [chat.snap.messages]);

  const confirm = (o: ConfirmOptions) => send({ action: 'confirm', submit_options: o, display: t('confirm.submit') });

  let footer: ReactNode = null;
  if (stage === 'duplicate_check' && res?.duplicates?.length && !pending)
    footer = (
      <div className="bg-surface mx-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-4">
        <Users className="text-primary size-5" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">{t('dup.title')}</p>
        <Button size="sm" onClick={() => setDupClosedFor(null)} data-testid="dup-reopen">
          {t('dup.review')}
        </Button>
      </div>
    );
  if (stage === 'submitted' && supported && !pending) footer = <SupportCelebration count={supported.count} />;
  if (stage === 'confirming' && res?.drafts && res.drafts.length > 1 && !pending)
    footer = (
      <SplitDrafts
        drafts={res.drafts}
        busy={pending}
        onConfirm={(draft_ids, o) => send({ action: 'split_confirm', action_payload: { draft_ids }, submit_options: o, display: t('split.submit', { count: draft_ids.length }) })}
        onCancel={() => send({ action: 'cancel', display: tc('actions.cancel') })}
      />
    );
  if (stage === 'confirming' && res?.draft && !pending)
    footer = (
      <ConfirmationCard
        key={res.draft.draft_id + res.session_id + chat.snap.messages.length}
        draft={res.draft}
        location={chat.snap.location}
        media={allMedia}
        uiLang={uiLang}
        busy={pending}
        onConfirm={confirm}
        onEdit={(text) => send({ action: 'edit', action_payload: { text }, display: text })}
        onCancel={() => send({ action: 'cancel', display: tc('actions.cancel') })}
        onAddLocation={() => setLocOpen(true)}
      />
    );
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

      {chat.snap.location && (
        <button
          type="button"
          onClick={() => setLocOpen(true)}
          className="bg-surface-2 mb-3 inline-flex max-w-full items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm"
          data-testid="location-chip"
        >
          <MapPin className="text-primary size-4 shrink-0" aria-hidden />
          <span className="truncate">{locationLabel(chat.snap.location)}</span>
        </button>
      )}

      {stage === 'emergency' && res?.emergency && (
        <EmergencyTakeover
          info={res.emergency}
          uiLang={uiLang}
          busy={pending}
          onContinue={() => send({ action: 'continue_after_emergency', display: t('emergency.continue') })}
        />
      )}

      {res?.duplicates && (
        <DuplicateSheet
          open={dupOpen}
          onOpenChange={(o) => !o && setDupClosedFor(res)}
          matches={res.duplicates}
          busy={pending}
          onSupport={(m) => {
            setSupported({ count: m.support_count + 2 });
            send({ action: 'support_existing', action_payload: { grievance_id: m.grievance_id, incident_id: m.incident_id }, display: t('dup.support') });
          }}
          onFileNew={() => send({ action: 'file_new_anyway', display: t('dup.file_new') })}
        />
      )}

      <LocationSheet open={locOpen} onOpenChange={setLocOpen} onSelect={onLocation} suggestion={suggestion} current={chat.snap.location} />

      <div className="flex-1 py-2">
        <MessageList messages={chat.snap.messages} pending={pending} onSettled={chat.settle} onRetry={chat.retry} footer={footer} />
      </div>

      <div className="bg-bg/95 sticky bottom-16 z-10 -mx-4 space-y-2 px-4 pt-2 pb-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <QuickReplies items={quickReplies} onPick={pick} disabled={pending} onLocation={askingLocation ? () => setLocOpen(true) : undefined} />
        <PhotoTray
          media={chat.snap.media}
          onRemove={chat.removeMedia}
          onRetake={() => {
            chat.snap.media.filter((m) => m.quality?.ok === false).forEach((m) => chat.removeMedia(m.id));
            photo.open();
          }}
        />
        {photo.inputEl}
        {stage !== 'submitted' && (
          <Composer
            lang={uiLang}
            disabled={pending || photo.busy}
            hasAttachments={chat.snap.media.length > 0}
            onSend={(text, mode) => send({ text: text || undefined, input_mode: mode })}
            autoFocus={params.get('mode') !== 'voice'}
            tools={
              <>
                <PhotoButton onClick={photo.open} busy={photo.busy} />
                <LocationButton onClick={() => setLocOpen(true)} active={!!chat.snap.location} />
              </>
            }
          />
        )}
      </div>
    </PageTransition>
  );
}
