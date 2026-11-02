// EmergencyTakeover (features 58, 59, 63, 68). Emergency mode never blocks calling:
// the tel: call buttons are plain links in the first paint; the red pulse is added only after mount.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Phone, Siren } from 'lucide-react';
import type { EmergencyInfo } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { isRtl } from '@/lib/i18n';
import { pickRecord } from '@/lib/localized';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

export function EmergencyTakeover({ info, uiLang, onContinue, busy }: { info: EmergencyInfo; uiLang: string; onContinue: () => void; busy?: boolean }) {
  const { t } = useTranslation('citizen');
  const reduced = useReducedMotion();
  const [animate, setAnimate] = useState(false);
  const firstCall = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    firstCall.current?.focus();
    // Animation only after the call buttons are on screen.
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="em-title"
      aria-describedby="em-message"
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#2a0408] text-white"
      data-testid="emergency-takeover"
    >
      {animate && !reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="emergency-pulse">
          <span className="absolute top-1/3 left-1/2 size-[60vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff4d5e]/30 motion-safe:animate-ping" />
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,77,94,0.45),transparent_60%)]" />
        </div>
      )}
      <div className="relative mx-auto flex min-h-full max-w-lg flex-col gap-5 px-5 py-8">
        {/* Call buttons first, before anything else. */}
        <ul className="grid gap-3" aria-label={t('emergency.call_now')}>
          {info.contacts.map((c, i) => (
            <li key={c.number}>
              <a
                ref={i === 0 ? firstCall : undefined}
                href={`tel:${c.number}`}
                className={cn(
                  'flex min-h-20 items-center gap-4 rounded-2xl px-5 text-start shadow-lg outline-offset-4 focus-visible:outline-3 focus-visible:outline-white',
                  i === 0 ? 'bg-white text-[#b3122a]' : 'bg-white/12 text-white ring-1 ring-white/30',
                )}
                data-testid={`call-${c.number}`}
              >
                <Phone className="size-7 shrink-0" aria-hidden />
                <span className="flex-1">
                  <span className="block font-mono text-3xl leading-none font-bold tracking-wider">{c.number}</span>
                  <span className="mt-1 block text-sm opacity-90">{pickRecord(c.label, uiLang) || c.label_en}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          <h2 id="em-title" className="font-display flex items-center gap-2 text-2xl font-bold">
            <Siren className="size-7" aria-hidden />
            {t('emergency.title')}
          </h2>
          <p id="em-message" className="text-lg leading-relaxed" lang={info.message.lang} dir={isRtl(info.message.lang) ? 'rtl' : 'ltr'}>
            {info.message.original}
          </p>
          {info.matched_terms.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="opacity-80">{t('emergency.matched')}</span>
              {info.matched_terms.map((term) => (
                <span key={term} className="rounded-full bg-white/15 px-2.5 py-1 font-medium" dir="auto">
                  {term}
                </span>
              ))}
            </div>
          )}
          <p className="rounded-xl bg-white/10 p-3 text-sm">{t('emergency.critical_note')}</p>
        </div>

        <Button
          onClick={onContinue}
          disabled={busy}
          variant="outline"
          className="mt-auto h-14 border-white/50 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
          data-testid="emergency-continue"
        >
          {t('emergency.continue')}
          <ArrowRight className="rtl-flip size-5" aria-hidden />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
