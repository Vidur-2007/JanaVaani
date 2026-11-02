// i18next with per-language bundles loaded by dynamic import.
// Namespaces: common, landing, citizen (A) and gov (C). Fallback: en. Sets <html lang dir>.
import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { DeepLang, Lang } from '@contracts/types';
import { usePrefs } from '@/lib/prefs/store';

export const DEEP_LANGS: DeepLang[] = ['en', 'te', 'hi', 'ur'];
export const NAMESPACES = ['common', 'landing', 'citizen', 'gov'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Native names, used by LanguageSwitcher and onboarding tiles. */
export const LANGUAGE_NAMES: Record<Lang, { native: string; en: string; deep: boolean }> = {
  en: { native: 'English', en: 'English', deep: true },
  te: { native: 'తెలుగు', en: 'Telugu', deep: true },
  hi: { native: 'हिन्दी', en: 'Hindi', deep: true },
  ur: { native: 'اردو', en: 'Urdu', deep: true },
  ta: { native: 'தமிழ்', en: 'Tamil', deep: false },
  kn: { native: 'ಕನ್ನಡ', en: 'Kannada', deep: false },
  ml: { native: 'മലയാളം', en: 'Malayalam', deep: false },
  mr: { native: 'मराठी', en: 'Marathi', deep: false },
  bn: { native: 'বাংলা', en: 'Bengali', deep: false },
  gu: { native: 'ગુજરાતી', en: 'Gujarati', deep: false },
  other: { native: 'Other', en: 'Other', deep: false },
};

/** Web Speech / BCP-47 codes. */
export const SPEECH_CODES: Record<Exclude<Lang, 'other'>, string> = {
  en: 'en-IN', te: 'te-IN', hi: 'hi-IN', ur: 'ur-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN',
};

export const isRtl = (lang: string) => lang.startsWith('ur');

const bundles = import.meta.glob<{ default: Record<string, unknown> }>('../../i18n/locales/*/*.json');

const backend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    const load = bundles[`../../i18n/locales/${language}/${namespace}.json`];
    if (!load) return callback(null, {});
    load()
      .then((m) => callback(null, m.default))
      .catch((e: Error) => callback(e, null));
  },
};

function applyDocumentLang(lng: string) {
  const el = document.documentElement;
  el.lang = lng;
  el.dir = isRtl(lng) ? 'rtl' : 'ltr';
}

let ready: Promise<unknown> | null = null;

export function initI18n() {
  if (ready) return ready;
  const lng = usePrefs.getState().ui_lang;
  i18n.on('languageChanged', applyDocumentLang);
  ready = i18n
    .use(backend)
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      supportedLngs: DEEP_LANGS,
      ns: ['common'],
      defaultNS: 'common',
      fallbackNS: 'common',
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
      returnNull: false,
    });
  applyDocumentLang(lng);
  return ready;
}

/** Switch UI language (persists the preference and flips dir for Urdu). */
export async function setLanguage(lang: DeepLang) {
  usePrefs.getState().set({ ui_lang: lang });
  await i18n.changeLanguage(lang);
}

export { i18n };
