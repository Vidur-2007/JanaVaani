// Voice confirmation words (Spec A §5.5): case-insensitive, also in Latin script.
export const YES_WORDS = ['yes', 'ok', 'okay', 'confirm', 'అవును', 'సరే', 'avunu', 'sare', 'हाँ', 'हां', 'haan', 'han', 'ji haan', 'theek hai', 'جی ہاں', 'ہاں', 'ji'];
export const NO_WORDS = ['no', 'edit', 'change', 'కాదు', 'మార్చు', 'kaadu', 'nahi', 'nahin', 'नहीं', 'badlo', 'نہیں'];

/** Lowercase, strip punctuation (Latin + Indic/Urdu sentence marks), collapse spaces. */
export function normalizeSpoken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'“”‘’()[\]{}।॥۔،؟]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const matches = (text: string, words: string[]) => {
  const t = normalizeSpoken(text);
  if (!t) return false;
  const padded = ` ${t} `;
  return words.some((w) => padded.includes(` ${normalizeSpoken(w)} `));
};

/** 'yes' | 'no' | null. "No" wins when both appear ("no, change it" / "nahi, theek hai nahi"). */
export function matchConfirmWord(text: string): 'yes' | 'no' | null {
  if (matches(text, NO_WORDS)) return 'no';
  if (matches(text, YES_WORDS)) return 'yes';
  return null;
}
