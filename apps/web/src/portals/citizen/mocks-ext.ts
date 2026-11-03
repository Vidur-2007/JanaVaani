// Laptop A mock handlers for additive endpoints (registered lazily so live builds don't ship them up front).
import type { DeepLang, Localized } from '@contracts/types';
import { API_MODE } from '@/lib/api/client';
import type { DocumentExtractResponse } from './types-ext';

const L = (original: string, en: string, lang: DeepLang): Localized => ({ original, en, lang });

/** A synthetic water bill + complaint, in the citizen's language (mock only — no real OCR). */
const DOC: Record<DeepLang, { summary: string; text: string }> = {
  en: {
    summary:
      'HMWSSB water bill for March: ₹ 640 due on 15 Apr. The bill says supply was normal, but you were billed for full usage.',
    text: 'I was billed ₹ 640 (consumer no. HMW-23-118842) for March, but we had no water supply for most of the month.',
  },
  te: {
    summary:
      'మార్చి నెల HMWSSB నీటి బిల్లు: ₹ 640, ఏప్రిల్ 15 లోపు చెల్లించాలి. సరఫరా సాధారణంగా ఉందని బిల్లులో ఉంది.',
    text: 'మార్చి నెలకు ₹ 640 బిల్లు వచ్చింది (కన్స్యూమర్ నం. HMW-23-118842), కానీ నెలలో చాలా రోజులు నీటి సరఫరా లేదు.',
  },
  hi: {
    summary: 'मार्च का HMWSSB पानी का बिल: ₹ 640, 15 अप्रैल तक देय। बिल में आपूर्ति सामान्य बताई गई है।',
    text: 'मार्च के लिए ₹ 640 का बिल आया है (उपभोक्ता सं. HMW-23-118842), लेकिन महीने के ज़्यादातर दिन पानी नहीं आया।',
  },
  ur: {
    summary:
      'مارچ کا HMWSSB پانی کا بل: ₹ 640، 15 اپریل تک ادا کرنا ہے۔ بل میں فراہمی معمول کے مطابق بتائی گئی ہے۔',
    text: 'مارچ کے لیے ₹ 640 کا بل آیا ہے (صارف نمبر HMW-23-118842)، لیکن مہینے کے زیادہ تر دن پانی نہیں آیا۔',
  },
};

let registered: Promise<void> | null = null;

export function registerCitizenMocks(): Promise<void> {
  if (API_MODE === 'live') return Promise.resolve();
  return (registered ??= import('@mocks/index').then(({ registerMockHandler }) => {
    registerMockHandler('POST', '/documents/extract', ({ body }): DocumentExtractResponse => {
      const b = (body ?? {}) as { media_id?: string; ui_lang?: DeepLang };
      const lang: DeepLang = b.ui_lang && b.ui_lang in DOC ? b.ui_lang : 'en';
      return {
        media_id: b.media_id ?? '',
        doc_type: 'bill',
        summary: L(DOC[lang].summary, DOC.en.summary, lang),
        fields: { consumer_no: 'HMW-23-118842', amount: '₹ 640', period: 'March', due_date: '15 Apr' },
        suggested_text: L(DOC[lang].text, DOC.en.text, lang),
        department_hint: 'water',
        confidence: 0.82,
      };
    });
  }));
}
