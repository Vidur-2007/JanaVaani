// Helpers for contract `Localized` values and per-language records.
import type { DeepLang, Localized } from '@contracts/types';
import { isRtl } from '@/lib/i18n';

export interface PickedText {
  text: string;
  lang: string;
  /** True when showing the citizen's original words (not the English translation). */
  isOriginal: boolean;
  /** True when an original in another language exists (offer a "Show original"/"Translate" affordance). */
  hasOther: boolean;
  dir: 'ltr' | 'rtl';
}

/** Spec A §6: show `original` when its language matches the UI, else `en`. */
export function pickLocalized(l: Localized | undefined | null, uiLang: string, preferOriginal = false): PickedText {
  if (!l) return { text: '', lang: uiLang, isOriginal: false, hasOther: false, dir: 'ltr' };
  const showOriginal = preferOriginal || l.lang === uiLang || !l.en;
  const lang = showOriginal ? l.lang : 'en';
  return {
    text: showOriginal ? l.original : l.en,
    lang,
    isOriginal: showOriginal,
    hasOther: l.lang !== 'en' && l.original !== l.en,
    dir: isRtl(lang) ? 'rtl' : 'ltr',
  };
}

/** Pick from a `Record<DeepLang, string>` (department names, questions, contact labels). */
export function pickRecord(r: Partial<Record<DeepLang, string>> | undefined, uiLang: string): string {
  if (!r) return '';
  return r[uiLang as DeepLang] ?? r.en ?? '';
}
