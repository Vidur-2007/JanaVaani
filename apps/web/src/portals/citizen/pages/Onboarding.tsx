// First-run onboarding (Spec A §5.2): language → consent → accessibility quick choices.
import { useState, type ComponentType, type SVGProps } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Contrast,
  Languages,
  MapPin,
  Mic,
  ShieldCheck,
  Sparkles,
  Type,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { DeepLang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Switch } from '@/design/ui/switch';
import { PageTransition } from '@/design/components';
import { easeOutExpo } from '@/design/motion';
import { DEEP_LANGS, LANGUAGE_NAMES, setLanguage } from '@/lib/i18n';
import { usePrefs, useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { OnboardingArt } from '../components/OnboardingArt';

const MORE: (keyof typeof LANGUAGE_NAMES)[] = ['ta', 'kn', 'ml', 'mr', 'bn', 'gu'];

function Steps({ step }: { step: number }) {
  const { t } = useTranslation('citizen');
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={t('onboarding.progress', { step: step + 1, total: 3 })}
    >
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            i <= step ? 'bg-primary' : 'bg-surface-2',
          )}
          aria-current={i === step ? 'step' : undefined}
        />
      ))}
    </ol>
  );
}

function LanguageStep() {
  const { t, i18n } = useTranslation('citizen');
  const current = (i18n.resolvedLanguage ?? 'en') as DeepLang;
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <OnboardingArt kind="language" className="-ms-2 mb-2" />
        <h1 className="font-display text-2xl font-semibold md:text-3xl">{t('onboarding.title')}</h1>
        <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
      </header>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('onboarding.title')}>
        {DEEP_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={current === l}
            onClick={() => setLanguage(l)}
            className={cn(
              'jv-press relative flex min-h-28 flex-col items-start justify-between rounded-[var(--radius-xl)] border-2 p-4 text-start transition-colors',
              current === l
                ? 'border-primary bg-primary/8'
                : 'bg-surface hover:border-primary/40 border-transparent',
            )}
            data-testid={`onb-lang-${l}`}
          >
            <span lang={l} className="font-display text-3xl font-semibold">
              {LANGUAGE_NAMES[l].native}
            </span>
            <span className="text-muted-foreground text-sm">{LANGUAGE_NAMES[l].en}</span>
            {current === l && (
              <span className="bg-primary text-primary-foreground absolute end-3 top-3 grid size-6 place-items-center rounded-full">
                <Check className="size-4" aria-hidden />
              </span>
            )}
          </button>
        ))}
      </div>
      <details className="bg-surface rounded-[var(--radius-lg)] border p-4">
        <summary className="cursor-pointer font-medium">{t('onboarding.more_languages')}</summary>
        <p className="text-muted-foreground mt-2 text-sm">{t('onboarding.more_languages_body')}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {MORE.map((l) => (
            <li key={l} lang={l} className="bg-surface-2 rounded-full px-3 py-1 text-sm">
              {LANGUAGE_NAMES[l].native}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ConsentStep() {
  const { t } = useTranslation('citizen');
  const p = usePrefs();
  const points: { icon: ComponentType<SVGProps<SVGSVGElement>>; key: string }[] = [
    { icon: ShieldCheck, key: 'store' },
    { icon: Sparkles, key: 'ai' },
    { icon: Check, key: 'humans' },
  ];
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <OnboardingArt kind="consent" className="-ms-2 mb-2" />
        <h1 className="font-display text-2xl font-semibold md:text-3xl">{t('onboarding.consent_title')}</h1>
        <p className="text-muted-foreground">{t('onboarding.consent_subtitle')}</p>
      </header>
      <ul className="space-y-3">
        {points.map(({ icon: Icon, key }) => (
          <li key={key} className="bg-surface flex gap-3 rounded-[var(--radius-lg)] border p-4">
            <Icon
              className={cn('mt-0.5 size-5 shrink-0', key === 'ai' ? 'text-ai' : 'text-signal')}
              aria-hidden
            />
            <p className="text-sm leading-relaxed">{t(`onboarding.consent.${key}`)}</p>
          </li>
        ))}
      </ul>
      <div className="bg-surface divide-y rounded-[var(--radius-lg)] border">
        {(
          [
            { id: 'consent_location', icon: MapPin },
            { id: 'consent_microphone', icon: Mic },
          ] as const
        ).map(({ id, icon: Icon }) => (
          <label key={id} htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 px-4">
            <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block font-medium">{t(`onboarding.${id}`)}</span>
              <span className="text-muted-foreground block text-xs">{t('onboarding.optional')}</span>
            </span>
            <Switch id={id} checked={p[id] === true} onCheckedChange={(v) => p.set({ [id]: v })} />
          </label>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t('onboarding.synthetic_note')}</p>
    </div>
  );
}

function AccessibilityStep() {
  const { t } = useTranslation('citizen');
  const p = usePrefs();
  const options: {
    key: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    on: boolean;
    toggle: () => void;
  }[] = [
    {
      key: 'large_text',
      icon: Type,
      on: p.font === 'large',
      toggle: () => p.set({ font: p.font === 'large' ? 'normal' : 'large' }),
    },
    {
      key: 'high_contrast',
      icon: Contrast,
      on: p.contrast === 'high',
      toggle: () => p.set({ contrast: p.contrast === 'high' ? 'normal' : 'high' }),
    },
    {
      key: 'simple_mode',
      icon: Wand2,
      on: p.simple_mode,
      toggle: () => p.set({ simple_mode: !p.simple_mode }),
    },
    {
      key: 'voice_first',
      icon: Volume2,
      on: p.voice_first,
      toggle: () => p.set({ voice_first: !p.voice_first, voice_autoplay: !p.voice_first }),
    },
  ];
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <OnboardingArt kind="access" className="-ms-2 mb-2" />
        <h1 className="font-display text-2xl font-semibold md:text-3xl">{t('onboarding.a11y_title')}</h1>
        <p className="text-muted-foreground">{t('onboarding.a11y_subtitle')}</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {options.map(({ key, icon: Icon, on, toggle }) => (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={toggle}
            className={cn(
              'jv-press flex min-h-28 flex-col items-start justify-between rounded-[var(--radius-xl)] border-2 p-4 text-start transition-colors',
              on ? 'border-primary bg-primary/8' : 'bg-surface hover:border-primary/40 border-transparent',
            )}
            data-testid={`onb-a11y-${key}`}
          >
            <Icon className={cn('size-7', on && 'text-primary')} aria-hidden />
            <span className="font-medium">{t(`settings.${key}`)}</span>
            <span className="text-muted-foreground text-xs">{t(`onboarding.a11y.${key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const set = usePrefs((s) => s.set);
  const reduced = useReducedMotion();
  const dx = i18n.dir() === 'rtl' ? -24 : 24; // next step enters from the reading-end side
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);

  const finish = () => {
    set({ onboarded: true });
    const next = params.get('next');
    navigate(next && next.startsWith('/') ? next : '/app', { replace: true });
  };
  const next = () => {
    if (step === 1) set({ consent_privacy: true });
    if (step === 2) finish();
    else setStep((s) => s + 1);
  };

  return (
    <PageTransition className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Languages className="text-primary size-5 shrink-0" aria-hidden />
        <Steps step={step} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: dx }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -dx }}
          transition={{ duration: 0.3, ease: easeOutExpo }}
          aria-live="polite"
        >
          {step === 0 ? <LanguageStep /> : step === 1 ? <ConsentStep /> : <AccessibilityStep />}
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" className="touch-target h-12" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="rtl-flip size-4" aria-hidden />
            {tc('actions.back')}
          </Button>
        )}
        <Button className="touch-target h-12 flex-1 text-base" onClick={next} data-testid="onb-next">
          {step === 0 ? tc('actions.continue') : step === 1 ? t('onboarding.agree') : t('onboarding.start')}
          {step < 2 && <ArrowRight className="rtl-flip size-4" aria-hidden />}
        </Button>
      </div>
    </PageTransition>
  );
}
