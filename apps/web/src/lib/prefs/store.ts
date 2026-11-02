// User preferences, persisted to localStorage and mirrored onto <html> data-* attributes.
import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeepLang } from '@contracts/types';

export type ThemePref = 'auto' | 'ink' | 'paper';
export type Theme = 'ink' | 'paper';
export type MotionPref = 'system' | 'reduced' | 'full';

export interface Prefs {
  ui_lang: DeepLang;
  /** 'auto' follows the current surface default (landing/gov = ink, citizen = paper). */
  theme: ThemePref;
  contrast: 'normal' | 'high';
  font: 'normal' | 'large';
  motion: MotionPref;
  simple_mode: boolean;
  low_literacy: boolean;
  voice_autoplay: boolean;
  tts_rate: number;
  onboarded: boolean;
  consent_location: boolean | null;
  consent_microphone: boolean | null;
  // ---- added in P1 (additive)
  /** Language the bot/officers reply in; 'ui' = same as ui_lang. */
  reply_lang: DeepLang | 'ui';
  /** Voice-first: start reports in voice mode. */
  voice_first: boolean;
  /** Default for the "report anonymously" toggle. */
  anonymous_default: boolean;
  /** Consent screen accepted (what we store, how AI is used). */
  consent_privacy: boolean;
}

interface PrefsState extends Prefs {
  /** Not persisted: default theme of the surface currently on screen. */
  surface_theme: Theme;
  set: (patch: Partial<Prefs>) => void;
  setSurfaceTheme: (t: Theme) => void;
  reset: () => void;
}

const detectInitialLang = (): DeepLang => {
  if (typeof navigator === 'undefined') return 'en';
  const l = (navigator.language || 'en').slice(0, 2);
  return (['en', 'te', 'hi', 'ur'] as const).includes(l as DeepLang) ? (l as DeepLang) : 'en';
};

/**
 * P7: the surface the current URL starts on (mirrors the boot script in index.html): the landing and gov portals
 * are Ink, the citizen app is Paper. Starting from 'paper' everywhere flashed the landing light before it set Ink.
 */
function initialSurface(): Theme {
  if (typeof window === 'undefined') return 'paper';
  const path = window.location.pathname;
  return path === '/' || path === '' || /^\/(officer|supervisor|admin|public)(\/|$)/.test(path) ? 'ink' : 'paper';
}

export const DEFAULT_PREFS: Prefs = {
  ui_lang: detectInitialLang(),
  theme: 'auto',
  contrast: 'normal',
  font: 'normal',
  motion: 'system',
  simple_mode: false,
  low_literacy: false,
  voice_autoplay: false,
  tts_rate: 1,
  onboarded: false,
  consent_location: null,
  consent_microphone: null,
  reply_lang: 'ui',
  voice_first: false,
  anonymous_default: false,
  consent_privacy: false,
};

/** Effective reply language. */
export const replyLang = (p: Pick<Prefs, 'reply_lang' | 'ui_lang'>): DeepLang => (p.reply_lang === 'ui' ? p.ui_lang : p.reply_lang);

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      surface_theme: initialSurface(),
      set: (patch) => set(patch),
      setSurfaceTheme: (surface_theme) => set({ surface_theme }),
      reset: () => set({ ...DEFAULT_PREFS, onboarded: true }),
    }),
    {
      name: 'jv.prefs',
      version: 1,
      partialize: ({ surface_theme: _s, set: _set, setSurfaceTheme: _st, reset: _r, ...rest }) => rest,
    },
  ),
);

export const effectiveTheme = (p: Pick<PrefsState, 'theme' | 'surface_theme'>): Theme =>
  p.theme === 'auto' ? p.surface_theme : p.theme;

export function useTheme(): Theme {
  return usePrefs((s) => effectiveTheme(s));
}

const mql =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
const subscribeOS = (cb: () => void) => {
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
};

/** True when the OS asks for reduced motion or the in-app toggle is on (and not explicitly overridden to full). */
export function useReducedMotion(): boolean {
  const pref = usePrefs((s) => s.motion);
  const os = useSyncExternalStore(
    subscribeOS,
    () => !!mql?.matches,
    () => false,
  );
  return pref === 'reduced' || (pref === 'system' && os);
}

/** Writes prefs onto <html>. Mounted once in providers. */
export function usePrefsToDocument() {
  const theme = useTheme();
  const { contrast, font } = usePrefs();
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    if (contrast === 'high') el.dataset.contrast = 'high';
    else delete el.dataset.contrast;
    if (font === 'large') el.dataset.font = 'large';
    else delete el.dataset.font;
    if (reduced) el.dataset.motion = 'reduced';
    else delete el.dataset.motion;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'ink' ? '#070A12' : '#F7F5F0');
  }, [theme, contrast, font, reduced]);
}

/** Layouts call this to set their default theme (used while the user's theme pref is 'auto'). */
export function useSurfaceTheme(t: Theme) {
  const setSurfaceTheme = usePrefs((s) => s.setSurfaceTheme);
  useEffect(() => setSurfaceTheme(t), [t, setSurfaceTheme]);
}
