// Brand. To rename the product, change this file, README.md and the FastAPI title (master spec header).
import type { DeepLang } from '@contracts/types';

export const BRAND = {
  name: 'JanaVaani',
  nativeName: { en: 'JanaVaani', te: 'జనవాణి', hi: 'जनवाणी', ur: 'جن وانی' } satisfies Record<
    DeepLang,
    string
  >,
  tagline: {
    en: 'Every complaint, in every language.',
    te: 'ప్రతి ఫిర్యాదు, ప్రతి భాషలో.',
    hi: 'हर शिकायत, हर भाषा में।',
    ur: 'ہر شکایت، ہر زبان میں۔',
  } satisfies Record<DeepLang, string>,
  meaning_en: 'Voice of the people',
  event: 'Neural Storm · JNTUH · HI-02',
} as const;
