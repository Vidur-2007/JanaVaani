// Laptop A additive endpoints (not yet in lib/api/endpoints; hybrid falls back to mocks-ext on 404/501).
import { post } from '@/lib/api/client';
import { registerCitizenMocks } from './mocks-ext';
import type { DocumentExtractRequest, DocumentExtractResponse } from './types-ext';

export const apiExt = {
  extractDocument: async (body: DocumentExtractRequest) => {
    await registerCitizenMocks(); // so mock mode and the hybrid fallback can answer
    return post<DocumentExtractResponse>('/documents/extract', body);
  },
};
