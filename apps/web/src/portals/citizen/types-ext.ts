// Laptop A additive contract types (move into packages/contracts at the next integration merge).
import type { DeepLang, DepartmentId, Localized } from '@contracts/types';

/** S5 (feature 29): POST /documents/extract — read a photographed notice/bill/letter with Gemini vision. */
export interface DocumentExtractRequest {
  media_id: string;
  ui_lang: DeepLang;
}
export interface DocumentExtractResponse {
  media_id: string;
  doc_type: 'bill' | 'notice' | 'letter' | 'receipt' | 'other';
  /** Plain-language summary of what the document says, in the citizen's language (+ English). */
  summary: Localized;
  /** Key facts read from the document, e.g. { consumer_no: 'HMW-…', amount: '₹ 640', due_date: '…' }. */
  fields: Record<string, string>;
  /** Suggested complaint text the citizen can edit before sending. */
  suggested_text: Localized;
  department_hint?: DepartmentId;
  confidence: number;
}
