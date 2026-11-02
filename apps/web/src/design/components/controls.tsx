// Controls: ListenButton (TTS), LanguageSwitcher, ThemeToggle, PageTransition, Logo.
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Languages, Loader2, Moon, Square, Sun, Volume2, VolumeX } from 'lucide-react';
import type { DeepLang, Lang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design/ui/dropdown-menu';
import { DEEP_LANGS, LANGUAGE_NAMES, setLanguage } from '@/lib/i18n';
import { effectiveTheme, usePrefs, useReducedMotion } from '@/lib/prefs/store';
import { useSpeak } from '@/lib/tts/useSpeak';
import { cn } from '@/lib/utils';
import { pageTransition, pageTransitionReduced } from '@/design/motion';
import { BRAND_MARK } from './brandMark';

// ---------------------------------------------------------------- ListenButton

export interface ListenButtonProps {
  text: string;
  lang: Lang;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'ghost' | 'outline' | 'secondary';
  className?: string;
}

export function ListenButton({ text, lang, size = 'sm', variant = 'ghost', className }: ListenButtonProps) {
  const { t } = useTranslation('common');
  const { speak, stop, status } = useSpeak();
  const busy = status === 'speaking' || status === 'loading';
  const unavailable = status === 'unavailable';
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn('touch-target', className)}
      onClick={() => (busy ? stop() : speak(text, lang))}
      aria-label={busy ? t('tts.stop') : t('tts.listen')}
      title={unavailable ? t('tts.unavailable') : undefined}
      aria-pressed={busy}
    >
      {status === 'loading' ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : busy ? (
        <Square className="size-4" aria-hidden />
      ) : unavailable ? (
        <VolumeX className="size-4" aria-hidden />
      ) : (
        <Volume2 className="size-4" aria-hidden />
      )}
      {size !== 'icon' && (
        <span>{busy ? t('tts.stop') : unavailable ? t('tts.unavailable_short') : t('tts.listen')}</span>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------- LanguageSwitcher

export interface LanguageSwitcherProps {
  /** 'menu' = compact dropdown (default); 'inline' = row of buttons (onboarding, footer). */
  variant?: 'menu' | 'inline';
  langs?: DeepLang[];
  className?: string;
  onChange?: (lang: DeepLang) => void;
}

export function LanguageSwitcher({
  variant = 'menu',
  langs = DEEP_LANGS,
  className,
  onChange,
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation('common');
  const current = (i18n.resolvedLanguage ?? 'en') as DeepLang;
  const choose = async (l: DeepLang) => {
    await setLanguage(l);
    onChange?.(l);
  };
  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup" aria-label={t('lang.choose')}>
        {langs.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={current === l}
            onClick={() => choose(l)}
            lang={l}
            className={cn(
              'touch-target rounded-full border px-4 text-sm font-medium transition-colors',
              current === l
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-surface hover:bg-surface-2',
            )}
          >
            {LANGUAGE_NAMES[l].native}
          </button>
        ))}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('touch-target gap-1.5', className)}
          aria-label={`${t('lang.choose')}: ${LANGUAGE_NAMES[current].native}`}
        >
          <Languages className="size-4" aria-hidden />
          {/* Icon-only below 390px so the header fits large text; the name stays in the accessible label. */}
          <span lang={current} className="max-sm:hidden">
            {LANGUAGE_NAMES[current].native}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {langs.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => choose(l)} className="min-h-11 justify-between gap-6">
            <span lang={l}>{LANGUAGE_NAMES[l].native}</span>
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              {LANGUAGE_NAMES[l].en}
              {current === l && <Check className="text-primary size-4" aria-hidden />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------- ThemeToggle

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const state = usePrefs();
  const theme = effectiveTheme(state);
  const next = theme === 'ink' ? 'paper' : 'ink';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('touch-target', className)}
      onClick={() => state.set({ theme: next })}
      aria-label={t(`theme.switch_to_${next}`)}
      title={t(`theme.switch_to_${next}`)}
    >
      {theme === 'ink' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </Button>
  );
}

// ---------------------------------------------------------------- PageTransition

/** Wrap each routed page. Pair with `<AnimatePresence mode="wait">` keyed by location (done in the app router). */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  // P6: the first page replaces the static boot shell (index.html) — show it as-is instead of fading in from
  // blank, so the screen never dims between the shell and the app.
  const [firstPaint] = useState(() => typeof document !== 'undefined' && !!document.getElementById('boot'));
  return (
    <motion.div
      variants={reduced ? pageTransitionReduced : pageTransition}
      initial={firstPaint ? false : 'initial'}
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence };

// ---------------------------------------------------------------- Logo

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="size-8 shrink-0" aria-hidden dangerouslySetInnerHTML={{ __html: BRAND_MARK }} />
      {showName && <span className="font-display text-lg font-semibold tracking-tight">JanaVaani</span>}
    </span>
  );
}
