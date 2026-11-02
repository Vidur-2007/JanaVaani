// Unicode-range script detection for instant UI hints (font, direction, "Detected: Telugu" chip).
// The backend does the real language detection; this only looks at characters.
import type { Lang } from '@contracts/types';

export type Script = 'telugu' | 'devanagari' | 'arabic' | 'tamil' | 'kannada' | 'malayalam' | 'bengali' | 'gujarati' | 'latin' | 'unknown';

const RANGES: [Script, number, number][] = [
  ['telugu', 0x0c00, 0x0c7f],
  ['devanagari', 0x0900, 0x097f],
  ['arabic', 0x0600, 0x06ff],
  ['tamil', 0x0b80, 0x0bff],
  ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f],
  ['bengali', 0x0980, 0x09ff],
  ['gujarati', 0x0a80, 0x0aff],
];

/** Likely language per script. Devanagari → Hindi and Arabic script → Urdu in this product's context. */
export const SCRIPT_LANG: Record<Script, Lang> = {
  telugu: 'te', devanagari: 'hi', arabic: 'ur', tamil: 'ta', kannada: 'kn', malayalam: 'ml', bengali: 'bn', gujarati: 'gu', latin: 'en', unknown: 'other',
};

export interface ScriptInfo {
  /** Dominant script by letter count. */
  script: Script;
  /** Best-guess language for the dominant script. */
  lang: Lang;
  /** Letter counts per script present. */
  counts: Partial<Record<Script, number>>;
  /** True when both an Indic/Arabic script and Latin letters appear. */
  mixed: boolean;
  rtl: boolean;
}

export function detectScript(text: string): ScriptInfo {
  const counts: Partial<Record<Script, number>> = {};
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
      counts.latin = (counts.latin ?? 0) + 1;
      continue;
    }
    for (const [s, lo, hi] of RANGES) {
      if (cp >= lo && cp <= hi) {
        counts[s] = (counts[s] ?? 0) + 1;
        break;
      }
    }
  }
  let script: Script = 'unknown';
  let best = 0;
  for (const [s, n] of Object.entries(counts) as [Script, number][]) {
    if (n > best) {
      best = n;
      script = s;
    }
  }
  const native = Object.keys(counts).some((s) => s !== 'latin');
  return { script, lang: SCRIPT_LANG[script], counts, mixed: native && (counts.latin ?? 0) >= 3, rtl: script === 'arabic' };
}
