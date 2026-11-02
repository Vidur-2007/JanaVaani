// Public-service guide (Spec A §5.15, feature 264): chat-like Q&A over POST /guide/ask. Answers come back in the
// citizen's language with source chips; when a department is suggested, "Report this issue" opens the assistant
// with that department's phrase prefilled. Suggested questions in the UI language, plus samples in the others.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowRight, BookOpen, Loader2, RotateCw, Send } from 'lucide-react';
import type { DeepLang, Lang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { AIBadge, DepartmentBadge, ListenButton, PageTransition } from '@/design/components';
import { easeOutExpo } from '@/design/motion';
import { errorMessage } from '@/lib/api/client';
import { api, type GuideAnswer } from '@/lib/api/endpoints';
import { DEEP_LANGS, LANGUAGE_NAMES, isRtl } from '@/lib/i18n';
import { pickLocalized } from '@/lib/localized';
import { useReducedMotion } from '@/lib/prefs/store';

const SUGGESTIONS = ['mosquito', 'water', 'garbage', 'appeal', 'privacy', 'emergency'] as const;

type Turn = { id: number; question: string } & (
  { state: 'pending' } | { state: 'answered'; answer: GuideAnswer } | { state: 'error'; error: string }
);

function Answer({ answer }: { answer: GuideAnswer }) {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const [showEn, setShowEn] = useState(false);
  const shown = pickLocalized(answer.answer, i18n.language);
  const text = showEn ? answer.answer.en : shown.text;
  const lang = (showEn ? 'en' : shown.lang) as Lang;
  return (
    <div className="space-y-3">
      <p
        className="leading-relaxed"
        lang={lang}
        dir={isRtl(lang) ? 'rtl' : 'ltr'}
        data-testid="guide-answer-text"
      >
        {text}
      </p>
      {answer.sources.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-semibold">{t('guide.sources')}</p>
          <ul className="flex flex-wrap gap-1.5" data-testid="guide-sources">
            {answer.sources.map((s) => (
              <li
                key={s.anchor}
                className="bg-surface-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                lang="en"
              >
                <BookOpen className="text-muted-foreground size-3.5" aria-hidden />
                {s.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AIBadge />
        <ListenButton text={text} lang={lang} />
        {answer.answer.lang !== 'en' && (
          <Button
            variant="ghost"
            size="sm"
            className="touch-target"
            onClick={() => setShowEn((v) => !v)}
            aria-pressed={showEn}
          >
            {showEn ? t('complaints.show_original') : t('tracker.see_english')}
          </Button>
        )}
      </div>
      {answer.department_id && (
        <div className="border-primary/30 bg-primary/6 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-3">
          <DepartmentBadge department={answer.department_id} />
          <Button asChild className="touch-target ms-auto">
            <Link to={`/app/report?dept=${answer.department_id}`} data-testid="guide-report">
              {t('guide.report_this')}
              <ArrowRight className="rtl-flip size-4" aria-hidden />
            </Link>
          </Button>
          <span className="sr-only">{tc(`departments.${answer.department_id}`)}</span>
        </div>
      )}
    </div>
  );
}

export default function Guide() {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const reduced = useReducedMotion();
  const ui = (DEEP_LANGS.includes(i18n.language as DeepLang) ? i18n.language : 'en') as DeepLang;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [otherLangsReady, setOtherLangsReady] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const others = DEEP_LANGS.filter((l) => l !== ui);

  // Sample questions in the other languages come from those languages' bundles.
  useEffect(() => {
    let alive = true;
    i18n.loadLanguages(DEEP_LANGS).then(() => alive && setOtherLangsReady(true));
    return () => {
      alive = false;
    };
  }, [i18n]);

  const ask = useMutation({
    mutationFn: ({ question }: { id: number; question: string }) => api.guideAsk({ question, ui_lang: ui }),
    onSuccess: (answer, { id }) =>
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, state: 'answered', answer } : x))),
    onError: (e, { id }) =>
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, state: 'error', error: errorMessage(e) } : x))),
  });
  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, question: q, state: 'pending' }]);
    setText('');
    ask.mutate({ id, question: q });
  };
  const retry = (turn: Turn) => {
    setTurns((ts) =>
      ts.map((x) => (x.id === turn.id ? { id: x.id, question: x.question, state: 'pending' } : x)),
    );
    ask.mutate({ id: turn.id, question: turn.question });
  };
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [turns, reduced]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <header className="space-y-1" data-testid="page-guide">
        <h1 className="font-display text-2xl font-semibold">{t('guide.title')}</h1>
        <p className="text-muted-foreground">{t('guide.subtitle')}</p>
      </header>

      <section aria-labelledby="guide-suggest" className="space-y-2">
        <h2 id="guide-suggest" className="text-muted-foreground text-sm font-semibold">
          {t('guide.try')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((k) => (
            <Button
              key={k}
              variant="outline"
              size="sm"
              className="touch-target h-auto rounded-full py-2 text-start whitespace-normal"
              onClick={() => send(t(`guide.suggest.${k}`))}
              disabled={ask.isPending}
              data-testid={`guide-suggest-${k}`}
            >
              {t(`guide.suggest.${k}`)}
            </Button>
          ))}
        </div>
        {otherLangsReady && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-muted-foreground text-xs">{t('guide.any_language')}</span>
            {others.map((l) => {
              const q = t('guide.suggest.mosquito', { lng: l });
              return (
                <Button
                  key={l}
                  variant="ghost"
                  size="sm"
                  className="touch-target bg-surface-2 h-auto rounded-full py-1.5 whitespace-normal"
                  onClick={() => send(q)}
                  disabled={ask.isPending}
                  lang={l}
                  dir={isRtl(l) ? 'rtl' : 'ltr'}
                  aria-label={`${LANGUAGE_NAMES[l].native}: ${q}`}
                  data-testid={`guide-sample-${l}`}
                >
                  {q}
                </Button>
              );
            })}
          </div>
        )}
      </section>

      <ol
        className="space-y-4"
        aria-live="polite"
        aria-label={t('guide.conversation')}
        data-testid="guide-thread"
      >
        <AnimatePresence initial={false}>
          {turns.map((turn) => (
            <motion.li
              key={turn.id}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: easeOutExpo }}
              className="space-y-2"
            >
              <p
                className="bg-primary text-primary-foreground ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md px-4 py-2.5"
                dir="auto"
              >
                <span className="sr-only">{t('guide.you_asked')} </span>
                {turn.question}
              </p>
              <div
                className="bg-surface max-w-[92%] rounded-2xl rounded-es-md border p-4"
                data-testid="guide-answer"
              >
                {turn.state === 'pending' ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('guide.thinking')}
                  </p>
                ) : turn.state === 'error' ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
                    <AlertTriangle className="text-danger size-4" aria-hidden />
                    <span className="flex-1">{turn.error}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="touch-target"
                      onClick={() => retry(turn)}
                      disabled={ask.isPending}
                    >
                      <RotateCw className="size-4" aria-hidden />
                      {tc('actions.retry')}
                    </Button>
                  </div>
                ) : (
                  <Answer answer={turn.answer} />
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {turns.length === 0 && <p className="text-muted-foreground text-center text-sm">{t('guide.empty')}</p>}
      <div ref={endRef} />

      <form
        onSubmit={onSubmit}
        className="bg-surface focus-within:ring-ring/60 sticky bottom-4 flex items-end gap-2 rounded-[var(--radius-xl)] border p-2 shadow-lg focus-within:ring-2"
      >
        <label htmlFor="guide-input" className="sr-only">
          {t('guide.placeholder')}
        </label>
        <textarea
          id="guide-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder={t('guide.placeholder')}
          dir="auto"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 outline-none"
          data-testid="guide-input"
        />
        <Button
          type="submit"
          size="icon"
          className="touch-target shrink-0 rounded-full"
          disabled={!text.trim() || ask.isPending}
          aria-label={t('guide.ask')}
        >
          {ask.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Send className="rtl-flip size-5" aria-hidden />
          )}
        </Button>
      </form>
    </PageTransition>
  );
}
