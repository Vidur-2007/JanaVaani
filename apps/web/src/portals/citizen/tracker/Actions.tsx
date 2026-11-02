// State-dependent citizen actions on the tracker (Spec A §5.10, features 107–118):
// - resolved_pending_verification → "Is it fixed?": yes → stars + comment; no → reason chips + text/voice + photo → reopen;
// - closed → "Problem came back?" (reopen) and "File an appeal"; the appeal has its own status card.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Camera, Check, Gavel, Loader2, Mic, MicOff, RotateCcw, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import type { GrievanceDetail, Media } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { SPEECH_CODES } from '@/lib/i18n';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { PhotoTray, usePhotoUpload } from '../report/PhotoAttach';
import { RecognitionCtor, type Recognition } from '../report/voice/speech';

const REASONS = ['not_fixed', 'partly', 'wrong_place', 'came_back', 'poor_quality'] as const;

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.grievances.all });
    qc.invalidateQueries({ queryKey: qk.notifications.all });
  };
}

/** Text box with an optional dictation mic (Web Speech), for reasons in the citizen's own words. */
function ReasonText({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t, i18n } = useTranslation('citizen');
  const [rec, setRec] = useState<Recognition | null>(null);
  const toggle = () => {
    if (rec) {
      rec.stop();
      return;
    }
    if (!RecognitionCtor) return;
    const r = new RecognitionCtor();
    r.lang = SPEECH_CODES[(i18n.resolvedLanguage ?? 'en') as keyof typeof SPEECH_CODES] ?? 'en-IN';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => onChange([value, e.results[e.results.length - 1][0].transcript].filter(Boolean).join(' '));
    r.onend = () => setRec(null);
    r.onerror = () => setRec(null);
    r.start();
    setRec(r);
  };
  return (
    <div className="flex items-start gap-2">
      <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-bg min-h-12 flex-1 rounded-xl border p-3" dir="auto" />
      {RecognitionCtor && (
        <Button type="button" variant={rec ? 'destructive' : 'outline'} size="icon" className="touch-target shrink-0" onClick={toggle} aria-label={rec ? t('report.mic_stop') : t('fix.speak_reason')} aria-pressed={!!rec}>
          {rec ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
        </Button>
      )}
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation('citizen');
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={t('fix.rating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('fix.stars', { count: n })}
          onClick={() => onChange(n)}
          className="touch-target grid place-items-center"
          data-testid={`star-${n}`}
        >
          <motion.span whileTap={{ scale: 0.8 }} animate={{ scale: n <= value ? 1.1 : 1 }}>
            <Star className={cn('size-9', n <= value ? 'fill-warning text-warning' : 'text-muted-foreground')} aria-hidden />
          </motion.span>
        </button>
      ))}
    </div>
  );
}

function IsItFixed({ g, pin }: { g: GrievanceDetail; pin?: string }) {
  const { t } = useTranslation('citizen');
  const easy = usePrefs((s) => s.low_literacy);
  const invalidate = useInvalidate();
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const photo = usePhotoUpload((m) => setMedia((cur) => [...cur, m]), g.location, 'verification');
  const submit = useMutation({
    mutationFn: () =>
      answer === 'yes'
        ? api.submitFeedback(g.id, { accepted: true, rating: rating ? (rating as 1 | 2 | 3 | 4 | 5) : undefined, comment: comment.trim() || undefined }, { pin })
        : api.submitFeedback(
            g.id,
            { accepted: false, comment: [...reasons.map((r) => t(`fix.reasons.${r}`, { lng: 'en' })), comment.trim()].filter(Boolean).join('. ') || undefined, media_ids: media.map((m) => m.id) },
            { pin },
          ),
    onSuccess: () => {
      toast.success(answer === 'yes' ? t('fix.thanks_yes') : t('fix.thanks_no'));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="bg-ai/8 border-ai/30 space-y-4 rounded-[var(--radius-xl)] border-2 p-5" aria-labelledby="fix-title" data-testid="is-it-fixed">
      <div>
        <h2 id="fix-title" className="font-display text-xl font-semibold">
          {t('fix.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('fix.subtitle')}</p>
        {g.ai_verification?.verdict === 'suspicious' && <p className="text-danger mt-1 text-sm font-medium">{t('fix.ai_warning')}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('fix.title')}>
        <Button
          role="radio"
          aria-checked={answer === 'yes'}
          variant="outline"
          className={cn('touch-target rounded-2xl text-base', easy ? 'h-20' : 'h-14', answer === 'yes' && 'border-success bg-success/12 text-success')}
          onClick={() => setAnswer('yes')}
          data-testid="fixed-yes"
        >
          <ThumbsUp className={easy ? 'size-8' : 'size-5'} aria-hidden />
          {t('fix.yes')}
        </Button>
        <Button
          role="radio"
          aria-checked={answer === 'no'}
          variant="outline"
          className={cn('touch-target rounded-2xl text-base', easy ? 'h-20' : 'h-14', answer === 'no' && 'border-danger bg-danger/10 text-danger')}
          onClick={() => setAnswer('no')}
          data-testid="fixed-no"
        >
          <ThumbsDown className={easy ? 'size-8' : 'size-5'} aria-hidden />
          {t('fix.no')}
        </Button>
      </div>

      {answer === 'yes' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <Label className="text-base">{t('fix.rating')}</Label>
          <Stars value={rating} onChange={setRating} />
          <Label htmlFor="fix-comment">{t('fix.comment')}</Label>
          <ReasonText id="fix-comment" value={comment} onChange={setComment} placeholder={t('fix.comment_placeholder')} />
        </motion.div>
      )}

      {answer === 'no' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <p className="font-medium">{t('fix.what_wrong')}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('fix.what_wrong')}>
            {REASONS.map((r) => {
              const on = reasons.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReasons((cur) => (on ? cur.filter((x) => x !== r) : [...cur, r]))}
                  className={cn('touch-target rounded-full border px-4 text-sm font-medium', on ? 'border-danger bg-danger/10 text-danger' : 'bg-surface')}
                  data-testid={`reason-${r}`}
                >
                  {t(`fix.reasons.${r}`)}
                </button>
              );
            })}
          </div>
          <ReasonText id="fix-reason" value={comment} onChange={setComment} placeholder={t('fix.reason_placeholder')} />
          {photo.inputEl}
          <PhotoTray media={media} onRemove={(id) => setMedia((m) => m.filter((x) => x.id !== id))} onRetake={photo.open} />
          <Button type="button" variant="outline" size="sm" onClick={photo.open} disabled={photo.busy}>
            {photo.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {t('fix.add_photo')}
          </Button>
        </motion.div>
      )}

      {answer && (
        <Button
          className={cn('touch-target h-12 w-full text-base', answer === 'no' && 'bg-danger hover:bg-danger/90 text-white')}
          disabled={submit.isPending || (answer === 'no' && !reasons.length && !comment.trim())}
          onClick={() => submit.mutate()}
          data-testid="fix-submit"
        >
          {submit.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : answer === 'yes' ? <Check className="size-5" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />}
          {answer === 'yes' ? t('fix.submit_yes') : t('fix.submit_no')}
        </Button>
      )}
    </section>
  );
}

function AfterClosure({ g, pin }: { g: GrievanceDetail; pin?: string }) {
  const { t } = useTranslation('citizen');
  const invalidate = useInvalidate();
  const [mode, setMode] = useState<'reopen' | 'appeal' | null>(null);
  const [reason, setReason] = useState('');
  const canAppeal = !g.appeal || g.appeal.status === 'dismissed';
  const act = useMutation({
    mutationFn: async () => {
      if (mode === 'reopen') await api.reopenGrievance(g.id, { reason: reason.trim() }, { pin });
      else await api.fileAppeal(g.id, { reason: reason.trim() }, { pin });
    },
    onSuccess: () => {
      toast.success(mode === 'reopen' ? t('fix.reopened') : t('appeal.filed_toast'));
      setMode(null);
      setReason('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4" data-testid="after-closure">
      <div className="flex flex-wrap gap-2">
        {g.status === 'closed' && (
          <Button variant={mode === 'reopen' ? 'secondary' : 'outline'} className="touch-target" onClick={() => setMode(mode === 'reopen' ? null : 'reopen')} data-testid="reopen-open">
            <RotateCcw className="size-4" aria-hidden />
            {t('fix.came_back')}
          </Button>
        )}
        {canAppeal && (
          <Button variant={mode === 'appeal' ? 'secondary' : 'outline'} className="touch-target" onClick={() => setMode(mode === 'appeal' ? null : 'appeal')} data-testid="appeal-open">
            <Gavel className="size-4" aria-hidden />
            {t('appeal.file')}
          </Button>
        )}
      </div>
      {mode && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <Label htmlFor="closure-reason">{mode === 'reopen' ? t('fix.reopen_reason') : t('appeal.reason')}</Label>
          <ReasonText id="closure-reason" value={reason} onChange={setReason} placeholder={mode === 'reopen' ? t('fix.reason_placeholder') : t('appeal.reason_placeholder')} />
          {mode === 'appeal' && <p className="text-muted-foreground text-xs">{t('appeal.hint')}</p>}
          <Button className="touch-target w-full" disabled={reason.trim().length < 5 || act.isPending} onClick={() => act.mutate()} data-testid="closure-submit">
            {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mode === 'reopen' ? t('fix.reopen') : t('appeal.submit')}
          </Button>
        </motion.div>
      )}
    </section>
  );
}

const APPEAL_TONE: Record<string, string> = {
  filed: 'bg-ai/12 text-ai',
  under_review: 'bg-warning/15 text-warning',
  upheld: 'bg-success/12 text-success',
  dismissed: 'bg-surface-2 text-muted-foreground',
};

/** Separate appeal status tracking (features 113, 114). */
function AppealStatus({ g }: { g: GrievanceDetail }) {
  const { t, i18n } = useTranslation('citizen');
  const fmt = useLangFormat();
  const a = g.appeal!;
  const reason = pickLocalized(a.reason, i18n.language);
  const note = a.decision_note ? pickLocalized(a.decision_note, i18n.language) : null;
  return (
    <section className="bg-surface space-y-2 rounded-[var(--radius-lg)] border p-4" data-testid="appeal-status" data-appeal={a.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display flex items-center gap-2 font-semibold">
          <Gavel className="text-primary size-5" aria-hidden />
          {t('appeal.title')}
        </h2>
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', APPEAL_TONE[a.status])}>{t(`appeal.status.${a.status}`)}</span>
      </div>
      <p className="text-sm" lang={reason.lang} dir={reason.dir}>
        {reason.text}
      </p>
      <p className="text-muted-foreground text-xs">
        {t('appeal.filed_on', { date: fmt.dateTime(a.created_at) })}
        {a.decided_at && ` · ${t('appeal.decided_on', { date: fmt.dateTime(a.decided_at) })}`}
      </p>
      {note && (
        <p className="bg-surface-2 rounded-lg p-2 text-sm" lang={note.lang} dir={note.dir}>
          {note.text}
        </p>
      )}
    </section>
  );
}

export function ActionsPanel({ g, pin, isOwner }: { g: GrievanceDetail; pin?: string; isOwner: boolean }) {
  if (!isOwner) return null;
  return (
    <div className="space-y-3">
      {g.status === 'resolved_pending_verification' && <IsItFixed g={g} pin={pin} />}
      {(g.status === 'closed' || g.status === 'rejected') && <AfterClosure g={g} pin={pin} />}
      {g.appeal && <AppealStatus g={g} />}
    </div>
  );
}
