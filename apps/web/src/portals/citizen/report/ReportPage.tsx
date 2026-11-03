// Report assistant (Spec A §5.4) — the hero feature. Driven entirely by POST /chat/turn; the UI follows response.stage.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CloudOff, History, MapPin, QrCode, Users } from 'lucide-react';
import { Button } from '@/design/ui/button';
import type { DeepLang, Lang, Location, Media } from '@contracts/types';
import { PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { replyLang, usePrefs } from '@/lib/prefs/store';
import { Composer } from './Composer';
import { ConfirmationCard, type ConfirmOptions } from './ConfirmationCard';
import { SplitDrafts } from './SplitDrafts';
import { DuplicateSheet, SupportCelebration } from './DuplicateSheet';
import { EmergencyTakeover } from './EmergencyTakeover';
import { SubmittedScreen } from './SubmittedScreen';
import {
  CategoryTiles,
  LanguageChip,
  ProgressDots,
  QuickReplies,
  TILE_DEPTS,
  type QuickReply,
} from './ChatChrome';
import { MessageList } from './MessageList';
import { LocationButton, LocationSheet, locationLabel } from './LocationSheet';
import { PhotoButton, PhotoTray, usePhotoUpload } from './PhotoAttach';
import { isActionValue, useChatSession } from './useChatSession';
import { clearDraft, loadDraft, saveDraft, userText, type SavedDraft } from './drafts';
import { queueOutbox } from './outbox';
import { VoiceMode } from './voice/VoiceMode';
import { DEMO_KUKATPALLY, DEMO_MIYAPUR, DEMO_PHRASES, DemoChips, type DemoPhraseKey } from '../demo/demoKit';
import { DocButton, DocCard, useDocumentReader } from './DocumentExtract';

/** Quick-reply values that mean "share my location" (B's API sends `share_location`). */
const LOCATION_VALUES = new Set(['share_location', 'location', 'use_location']);

export default function ReportPage() {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const [params] = useSearchParams();
  const prefs = usePrefs();
  const uiLang = replyLang(prefs) as DeepLang;
  const assetId = params.get('asset') ?? undefined;
  // From the guide's "Report this issue": the department's phrase starts in the composer (editable).
  const deptHint = TILE_DEPTS.find((d) => d === params.get('dept'));
  const chat = useChatSession({ uiLang, greeting: t('report.greet') });
  const { response: res, stage, pending, send } = chat;

  // QR entry (/r/:assetId → /app/report?asset=…): the asset travels with every turn.
  const asset = useQuery({
    queryKey: qk.meta.asset(assetId ?? ''),
    queryFn: ({ signal }) => api.asset(assetId!, signal),
    enabled: !!assetId,
  });
  const { setAsset } = chat;
  useEffect(() => setAsset(assetId), [assetId, setAsset]);
  // …and its location is prefilled (the citizen can still move the pin).
  const { setLocation } = chat;
  const hasLocation = !!chat.snap.location;
  useEffect(() => {
    const a = asset.data;
    if (a && !hasLocation)
      setLocation({
        lat: a.location.lat,
        lng: a.location.lng,
        ward_id: a.ward_id,
        landmark: a.label_en,
        source: 'qr',
      });
  }, [asset.data, hasLocation, setLocation]);

  const photo = usePhotoUpload(chat.attachMedia, chat.snap.location);

  // Voice mode: mic button or ?mode=voice; voice-first users get it by default (?mode=text overrides).
  const [voiceOpen, setVoiceOpen] = useState(
    () => params.get('mode') === 'voice' || (prefs.voice_first && params.get('mode') !== 'text'),
  );
  const [editSignal, setEditSignal] = useState(0);
  const closeVoice = useCallback(() => setVoiceOpen(false), []);
  const voiceEdit = useCallback(() => {
    setVoiceOpen(false);
    setEditSignal((n) => n + 1);
  }, []);

  // ---- Drafts: offer to resume an unfinished conversation; save after every turn.
  const online = useOnline();
  const [resume, setResume] = useState<SavedDraft | null>(null);
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    if (assetId) return; // A QR scan starts a new report.
    let alive = true;
    loadDraft().then((d) => alive && setResume(d));
    return () => {
      alive = false;
    };
  }, [assetId]);
  const hasUserTurn = chat.snap.messages.some((m) => m.role === 'user');
  useEffect(() => {
    if (stage === 'submitted' || queued || (stage === 'answered' && res?.intent === 'smalltalk'))
      clearDraft();
    else if (hasUserTurn && !pending) saveDraft(chat.snap);
  }, [chat.snap, stage, pending, queued, hasUserTurn, res]);
  const continueDraft = (d: SavedDraft) => {
    setResume(null);
    // Restore what the citizen saw, then rebuild the server session from their own words.
    chat.setSnap({ ...d.snap, session_id: undefined, response: undefined, media: [] });
    const text = userText(d.snap);
    if (text) send({ text, silent: true, location: d.snap.location });
  };

  // P7 demo mode: a chip pre-fills the rehearsed phrase (and its place) — the presenter still presses Send.
  const [demoText, setDemoText] = useState<string>();
  const [composerKey, setComposerKey] = useState(0);
  // S5: read a photographed notice/bill; "Use this" pre-fills the composer and keeps the photo attached.
  const docReader = useDocumentReader(uiLang);
  const applyDoc = (text: string, media: Media) => {
    chat.attachMedia(media);
    setDemoText(text);
    setComposerKey((n) => n + 1);
    docReader.clear();
  };

  const pickDemo = (k: DemoPhraseKey) => {
    setDemoText(DEMO_PHRASES[k].text);
    setComposerKey((n) => n + 1);
    if (k === 'pothole') chat.setLocation(DEMO_MIYAPUR);
    if (k === 'live_wire') chat.setLocation(DEMO_KUKATPALLY);
  };

  const pick = (q: QuickReply) => {
    // P6: B offers a "share my location" reply; it opens the sheet instead of being sent back as text.
    if (LOCATION_VALUES.has(q.value)) return setLocOpen(true);
    if (isActionValue(q.value)) send({ action: q.value as never, display: q.label });
    else send({ text: q.value, display: q.label });
  };

  // Location: the citizen's choice, or an AI-extracted place offered as a suggestion.
  const [locOpen, setLocOpen] = useState(false);
  const aiPlace = res?.draft?.location ?? res?.drafts?.[0]?.location;
  const suggestion = !chat.snap.location && aiPlace?.source === 'text' ? aiPlace : undefined;
  const askingLocation =
    stage === 'collecting' &&
    (!!res?.missing_fields.some((f) => f === 'location_detail' || f === 'location') ||
      !!res?.quick_replies.some((q) => LOCATION_VALUES.has(q.value)));
  const onLocation = (l: Location) => {
    const label = locationLabel(l);
    if (stage === 'confirming') send({ action: 'edit', location: l, display: '📍 ' + label });
    else if (askingLocation) send({ text: label, display: '📍 ' + label, location: l });
    else chat.setLocation(l);
  };

  // Stages with their own UI replace the mock's action quick replies.
  const richStage = stage !== 'collecting' && stage !== 'answered';

  // Duplicate check: the sheet opens for each new duplicate_check response; closing it leaves a reopen card.
  const [dupClosedFor, setDupClosedFor] = useState<unknown>(null);
  const dupOpen = stage === 'duplicate_check' && !!res?.duplicates?.length && dupClosedFor !== res;
  const [supported, setSupported] = useState<{ count: number } | null>(null);
  // Location replies are rendered once, as our own translated "Share location" chip.
  const quickReplies = useMemo(
    () => (richStage ? [] : (res?.quick_replies ?? []).filter((q) => !LOCATION_VALUES.has(q.value))),
    [res, richStage],
  );
  const allMedia = useMemo(() => chat.snap.messages.flatMap((m) => m.media ?? []), [chat.snap.messages]);

  const confirm = async (o: ConfirmOptions) => {
    // Offline: queue the confirmed complaint and send it when the connection returns.
    if (!navigator.onLine && res?.draft) {
      await queueOutbox(
        {
          draft: res.draft,
          location: chat.snap.location ?? res.draft.location ?? { lat: 17.385, lng: 78.4867, source: 'text' },
          media_ids: allMedia.map((m) => m.id),
          asset_id: chat.snap.asset_id,
          is_anonymous: o.is_anonymous,
          is_private: o.is_private,
        },
        res.draft.title.original,
      );
      setQueued(true);
      return;
    }
    send({ action: 'confirm', submit_options: o, display: t('confirm.submit') });
  };

  let footer: ReactNode = null;
  if (queued)
    footer = (
      <div
        className="bg-surface mx-auto w-full max-w-xl space-y-2 rounded-[var(--radius-xl)] border p-5 text-center"
        role="status"
        data-testid="queued-notice"
      >
        <CloudOff className="text-warning mx-auto size-8" aria-hidden />
        <p className="font-display text-lg font-semibold">{t('outbox.queued_title')}</p>
        <p className="text-muted-foreground text-sm">{t('outbox.queued_body')}</p>
      </div>
    );
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
  const reportAnother = () => {
    setSupported(null);
    setQueued(false);
    clearDraft();
    chat.reset();
  };
  if (stage === 'submitted' && !pending && !queued)
    footer = supported ? (
      <div className="space-y-3">
        <SupportCelebration count={supported.count} />
        <Button variant="ghost" className="touch-target mx-auto flex" onClick={reportAnother}>
          {t('submitted.another')}
        </Button>
      </div>
    ) : res?.submitted?.length ? (
      <SubmittedScreen items={res.submitted} onReportAnother={reportAnother} />
    ) : null;
  if (stage === 'confirming' && res?.drafts && res.drafts.length > 1 && !pending && !queued)
    footer = (
      <SplitDrafts
        drafts={res.drafts}
        busy={pending}
        onConfirm={(draft_ids, o) =>
          send({
            action: 'split_confirm',
            action_payload: { draft_ids },
            submit_options: o,
            display: t('split.submit', { count: draft_ids.length }),
          })
        }
        onCancel={() => send({ action: 'cancel', display: tc('actions.cancel') })}
      />
    );
  if (stage === 'confirming' && res?.draft && !pending && !queued)
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
        editSignal={editSignal}
      />
    );
  const lang = (res?.detected_language ?? uiLang) as Lang;

  return (
    <PageTransition className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl flex-col">
      <header className="bg-bg/90 sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2 backdrop-blur md:static md:mx-0 md:px-0">
        <h1 className="font-display text-xl font-semibold md:text-2xl">{t('report.title')}</h1>
        <div className="flex items-center gap-3">
          {stage === 'collecting' && (
            <ProgressDots total={chat.maxMissing} remaining={res?.missing_fields.length ?? chat.maxMissing} />
          )}
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

      {voiceOpen && <VoiceMode chat={chat} uiLang={uiLang} onClose={closeVoice} onEdit={voiceEdit} />}

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
            send({
              action: 'support_existing',
              action_payload: { grievance_id: m.grievance_id, incident_id: m.incident_id },
              display: t('dup.support'),
            });
          }}
          onFileNew={() => send({ action: 'file_new_anyway', display: t('dup.file_new') })}
        />
      )}

      <LocationSheet
        open={locOpen}
        onOpenChange={setLocOpen}
        onSelect={onLocation}
        suggestion={suggestion}
        current={chat.snap.location}
      />

      {!online && (
        <p
          className="bg-warning/15 mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          role="status"
          data-testid="offline-banner"
        >
          <CloudOff className="size-4 shrink-0" aria-hidden />
          {t('outbox.offline_banner')}
        </p>
      )}

      {resume && (
        <div
          className="bg-surface mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-4"
          role="region"
          aria-label={t('drafts.title')}
          data-testid="resume-prompt"
        >
          <History className="text-primary size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 font-medium">{t('drafts.title')}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => continueDraft(resume)} data-testid="resume-continue">
              {t('drafts.continue')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setResume(null);
                clearDraft();
              }}
              data-testid="resume-discard"
            >
              {t('drafts.start_new')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 py-2">
        <MessageList
          messages={chat.snap.messages}
          pending={pending}
          onSettled={chat.settle}
          onRetry={chat.retry}
          footer={footer}
          muted={voiceOpen}
        />
        {prefs.low_literacy && !hasUserTurn && !resume && (
          <div className="mt-6">
            <CategoryTiles disabled={pending} onPick={(text, label) => send({ text, display: label })} />
          </div>
        )}
      </div>

      <div className="bg-bg/95 sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 space-y-2 px-4 pt-2 pb-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <QuickReplies
          items={quickReplies}
          onPick={pick}
          disabled={pending}
          onLocation={askingLocation ? () => setLocOpen(true) : undefined}
        />
        <PhotoTray
          media={chat.snap.media}
          onRemove={chat.removeMedia}
          onRetake={() => {
            chat.snap.media.filter((m) => m.quality?.ok === false).forEach((m) => chat.removeMedia(m.id));
            photo.open();
          }}
        />
        {photo.inputEl}
        {docReader.inputEl}
        {docReader.result && (
          <DocCard result={docReader.result} uiLang={uiLang} onUse={applyDoc} onDiscard={docReader.clear} />
        )}
        {stage !== 'submitted' && !queued && !hasUserTurn && (
          <DemoChips keys={['live_wire', 'pothole', 'water']} onPick={pickDemo} className="pb-1" />
        )}
        {stage !== 'submitted' && !queued && (
          <Composer
            key={composerKey}
            lang={uiLang}
            disabled={pending || photo.busy}
            hasAttachments={chat.snap.media.length > 0}
            onSend={(text, mode) => send({ text: text || undefined, input_mode: mode })}
            autoFocus={!voiceOpen}
            onVoice={() => setVoiceOpen(true)}
            initialText={demoText ?? (deptHint && !hasUserTurn ? t(`ll.tiles.${deptHint}`) : undefined)}
            tools={
              <>
                <PhotoButton onClick={photo.open} busy={photo.busy} />
                <DocButton onClick={docReader.open} busy={docReader.busy} />
                <LocationButton onClick={() => setLocOpen(true)} active={!!chat.snap.location} />
              </>
            }
          />
        )}
      </div>
    </PageTransition>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
