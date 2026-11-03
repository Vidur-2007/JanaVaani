// One typed function per endpoint in master §9 (#1–#57) + the TanStack Query key factory `qk`.
import type {
  AIMetrics,
  Alert,
  Appeal,
  Asset,
  AuditVerification,
  BreakdownRow,
  ChatTurnRequest,
  ChatTurnResponse,
  DeepLang,
  DemoClock,
  Department,
  DepartmentId,
  DepartmentPerformance,
  DraftReply,
  DuplicateMatch,
  EmergencyContact,
  Grievance,
  GrievanceDetail,
  GrievanceDraft,
  Incident,
  InsightSummary,
  KPIs,
  Lang,
  Localized,
  Location,
  MapPoint,
  Media,
  Message,
  Notification,
  Officer,
  OfficerBrief,
  OfficerWorkload,
  Paged,
  Priority,
  PublicStats,
  ReplyIntent,
  Role,
  Status,
  TimelineEvent,
  TimelineEventType,
  TrendPoint,
  Ward,
} from '@contracts/types';
import { get, post, request } from './client';

// ---------------------------------------------------------------- request/response shapes from §9

export interface AnalyzeRequest {
  text: string;
  ui_lang: DeepLang;
  media_ids?: string[];
  location?: Location;
}
export interface CreateGrievanceRequest {
  draft: GrievanceDraft;
  location: Location;
  media_ids: string[];
  asset_id?: string;
  is_anonymous: boolean;
  is_private: boolean;
}
export interface CreateGrievanceResponse {
  grievance: Grievance;
  guest_pin?: string;
  duplicates?: DuplicateMatch[];
}
export interface CheckDuplicatesRequest {
  text: string;
  location: Location;
  category: DepartmentId;
}
export interface SupportResponse {
  support_count: number;
  incident_id?: string;
}
export interface MyGrievancesQuery {
  status?: Status | Status[];
  q?: string;
  page?: number;
  page_size?: number;
}
export interface FeedbackRequest {
  accepted: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  media_ids?: string[];
}
export interface UploadRequest {
  file: Blob;
  purpose: Media['purpose'];
  grievance_id?: string;
  lat?: number;
  lng?: number;
}
export interface TranscribeResponse {
  text: string;
  language: Lang;
  duration_s: number;
}
export interface TranslateResponse {
  text: string;
  source_lang: Lang;
}
export type SearchScope = 'mine' | 'public' | 'gov';
export interface SearchResponse {
  grievances: Grievance[];
  guide: { title: string; snippet: string; anchor: string }[];
}
export interface GuideAnswer {
  answer: Localized;
  sources: { title: string; anchor: string }[];
  department_id?: DepartmentId;
}
export interface WardsGeoJSON {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { id: string; name: string; zone: string };
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  }[];
}
export interface NearbyItem {
  title: Localized;
  category: DepartmentId;
  status: Status;
  distance_m: number;
  support_count: number;
  grievance_id: string;
}
export interface InboxQuery {
  status?: Status | Status[];
  priority?: Priority | Priority[];
  category?: DepartmentId | DepartmentId[];
  ward?: string;
  q?: string;
  sort?: 'priority' | 'newest' | 'sla';
  overdue?: boolean;
  page?: number;
  page_size?: number;
}
export type ReviewKind = 'routing' | 'emergency' | 'disputed' | 'appeal';
export interface BulkRequest {
  ids: string[];
  action: 'status' | 'assign' | 'merge';
  payload: Record<string, unknown>;
}
export interface Health {
  status: string;
  version: string;
  providers: { gemini: string; groq: string; db: string; embeddings: string };
}
/** Additive endpoint (requested in docs/contract-notes/A.md). */
export interface MeProfile {
  id: string;
  role: Role;
  name: string;
  email?: string;
  preferred_language: DeepLang;
  department_id?: DepartmentId;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- endpoints

export const api = {
  // Citizen intake
  /* 1 */ chatTurn: (req: ChatTurnRequest) => post<ChatTurnResponse>('/chat/turn', req),
  /* 2 */ analyzeGrievance: (body: AnalyzeRequest) => post<GrievanceDraft>('/grievances/analyze', body),
  /* 3 */ createGrievance: (body: CreateGrievanceRequest) =>
    post<CreateGrievanceResponse>('/grievances', body),
  /* 4 */ checkDuplicates: (body: CheckDuplicatesRequest) =>
    post<DuplicateMatch[]>('/grievances/check-duplicates', body),
  /* 5 */ supportGrievance: (id: string) => post<SupportResponse>(`/grievances/${enc(id)}/support`, {}),
  /* 6 */ getGrievance: (id: string, opts: { pin?: string; lang?: string } = {}, signal?: AbortSignal) =>
    get<GrievanceDetail>(`/grievances/${enc(id)}`, opts, signal),
  /* 7 */ myGrievances: (q: MyGrievancesQuery = {}, signal?: AbortSignal) =>
    get<Paged<Grievance>>('/me/grievances', { ...q }, signal),
  // Owner actions (#8–#11): `opts.pin` (added in P4, optional) lets a guest act with ticket + PIN (sent as ?pin=).
  /* 8 */ submitFeedback: (id: string, body: FeedbackRequest, opts: { pin?: string } = {}) =>
    post<GrievanceDetail>(`/grievances/${enc(id)}/feedback`, body, opts),
  /* 9 */ reopenGrievance: (id: string, body: { reason: string; media_ids?: string[] }, opts: { pin?: string } = {}) =>
    post<GrievanceDetail>(`/grievances/${enc(id)}/reopen`, body, opts),
  /* 10 */ fileAppeal: (id: string, body: { reason: string }, opts: { pin?: string } = {}) =>
    post<Appeal>(`/grievances/${enc(id)}/appeal`, body, opts),
  /* 11 */ sendMessage: (id: string, body: { text: string; ui_lang: DeepLang }, opts: { pin?: string } = {}) =>
    post<Message>(`/grievances/${enc(id)}/messages`, body, opts),
  /* 12 */ upload: ({ file, purpose, grievance_id, lat, lng }: UploadRequest) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', purpose);
    if (grievance_id) fd.append('grievance_id', grievance_id);
    if (lat != null) fd.append('lat', String(lat));
    if (lng != null) fd.append('lng', String(lng));
    return request<Media>('POST', '/uploads', { body: fd });
  },
  /* 13 */ transcribe: (audio: Blob, language?: Lang) => {
    const fd = new FormData();
    fd.append('audio', audio, 'speech.webm');
    if (language) fd.append('language', language);
    return request<TranscribeResponse>('POST', '/speech/transcribe', { body: fd });
  },
  /* 14 */ tts: (body: { text: string; lang: Lang }) =>
    request<Blob>('POST', '/speech/tts', { body, raw: true }),
  /* 15 */ translate: (body: { text: string; target_lang: Lang }) =>
    post<TranslateResponse>('/translate', body),
  /* 16 */ search: (q: { q: string; scope: SearchScope; lang?: string }, signal?: AbortSignal) =>
    get<SearchResponse>('/search', q, signal),
  /* 17 */ guideAsk: (body: { question: string; ui_lang: DeepLang }) => post<GuideAnswer>('/guide/ask', body),

  // Notifications
  /* 18 */ notifications: (q: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    get<Paged<Notification>>('/notifications', q, signal),
  /* 19 */ markNotificationRead: (id: string | 'all') =>
    post<{ ok: true }>(`/notifications/${enc(id)}/read`, {}),

  // Reference data
  /* 20 */ departments: (signal?: AbortSignal) => get<Department[]>('/meta/departments', undefined, signal),
  /* 21 */ wards: (signal?: AbortSignal) => get<Ward[]>('/meta/wards', undefined, signal),
  /* 22 */ wardsGeoJSON: (signal?: AbortSignal) =>
    get<WardsGeoJSON>('/meta/wards.geojson', undefined, signal),
  /* 23 */ emergencyContacts: (signal?: AbortSignal) =>
    get<EmergencyContact[]>('/meta/emergency-contacts', undefined, signal),
  /* 24 */ asset: (id: string, signal?: AbortSignal) =>
    get<Asset>(`/meta/assets/${enc(id)}`, undefined, signal),

  // Public
  /* 25 */ publicStats: (signal?: AbortSignal) => get<PublicStats>('/public/stats', undefined, signal),
  /* 26 */ publicMap: (q: { category?: DepartmentId; days?: number } = {}, signal?: AbortSignal) =>
    get<MapPoint[]>('/public/map', q, signal),
  /* 27 */ publicNearby: (q: { lat: number; lng: number; radius_m?: number }, signal?: AbortSignal) =>
    get<NearbyItem[]>('/public/nearby', { ...q }, signal),

  // Officer / supervisor
  /* 28 */ officerInbox: (q: InboxQuery = {}, signal?: AbortSignal) =>
    get<Paged<Grievance>>('/officer/inbox', { ...q }, signal),
  /* 29 */ reviewQueue: (q: { kind: ReviewKind; page?: number }, signal?: AbortSignal) =>
    get<Paged<Grievance>>('/officer/review-queue', q, signal),
  /* 30 */ setStatus: (id: string, body: { status: Status; note?: string; delay_reason?: string }) =>
    post<GrievanceDetail>(`/officer/grievances/${enc(id)}/status`, body),
  /* 31 */ addNote: (id: string, body: { text: string }) =>
    post<TimelineEvent>(`/officer/grievances/${enc(id)}/notes`, body),
  /* 32 */ reassign: (
    id: string,
    body: { department_id?: DepartmentId; officer_id?: string; reason: string },
  ) => post<GrievanceDetail>(`/officer/grievances/${enc(id)}/reassign`, body),
  /* 33 */ routeDecision: (id: string, body: { department_id: DepartmentId; sub_department?: string }) =>
    post<GrievanceDetail>(`/officer/grievances/${enc(id)}/route-decision`, body),
  /* 34 */ emergencyDecision: (id: string, body: { confirmed: boolean; note?: string }) =>
    post<GrievanceDetail>(`/officer/grievances/${enc(id)}/emergency`, body),
  /* 35 */ officerBrief: (id: string, body: { refresh?: boolean } = {}) =>
    post<OfficerBrief>(`/officer/grievances/${enc(id)}/brief`, body),
  /* 36 */ draftReply: (id: string, body: { intent: ReplyIntent; extra_en?: string }) =>
    post<DraftReply>(`/officer/grievances/${enc(id)}/draft-reply`, body),
  /* 37 */ officerMessage: (id: string, body: { text_en: string }) =>
    post<Message>(`/officer/grievances/${enc(id)}/message`, body),
  /* 38 */ resolve: (id: string, body: { media_ids: string[]; note: string; lat?: number; lng?: number }) =>
    post<GrievanceDetail>(`/officer/grievances/${enc(id)}/resolve`, body),
  /* 39 */ appealDecision: (id: string, body: { decision: 'upheld' | 'dismissed'; note: string }) =>
    post<GrievanceDetail>(`/officer/grievances/${enc(id)}/appeal-decision`, body),
  /* 40 */ bulk: (body: BulkRequest) => post<{ updated: number }>('/officer/bulk', body),
  /* 41 */ officers: (q: { department?: DepartmentId } = {}, signal?: AbortSignal) =>
    get<Officer[]>('/officer/officers', q, signal),
  /* 42 */ incidents: (q: { ward?: string; category?: DepartmentId } = {}, signal?: AbortSignal) =>
    get<Incident[]>('/officer/incidents', q, signal),

  // Admin
  /* 43 */ adminKpis: (q: { days?: number } = {}, signal?: AbortSignal) =>
    get<KPIs>('/admin/kpis', q, signal),
  /* 44 */ departmentPerformance: (q: { days?: number } = {}, signal?: AbortSignal) =>
    get<DepartmentPerformance[]>('/admin/departments/performance', q, signal),
  /* 45 */ officerWorkload: (q: { department?: DepartmentId } = {}, signal?: AbortSignal) =>
    get<OfficerWorkload[]>('/admin/officers/workload', q, signal),
  /* 46 */ trends: (q: { days?: number; group?: 'day' | 'week' } = {}, signal?: AbortSignal) =>
    get<TrendPoint[]>('/admin/analytics/trends', q, signal),
  /* 47 */ breakdown: (q: { by: 'ward' | 'zone' | 'category'; days?: number }, signal?: AbortSignal) =>
    get<BreakdownRow[]>('/admin/analytics/breakdown', q, signal),
  /* 48 */ adminMap: (
    q: { category?: DepartmentId; status?: Status; priority?: Priority; days?: number } = {},
    signal?: AbortSignal,
  ) => get<MapPoint[]>('/admin/map', q, signal),
  /* 49 */ alerts: (signal?: AbortSignal) => get<Alert[]>('/admin/alerts', undefined, signal),
  /* 50 */ insights: (q: { days?: number; refresh?: boolean } = {}, signal?: AbortSignal) =>
    get<InsightSummary>('/admin/insights', q, signal),
  /* 51 */ audit: (
    q: { grievance_id?: string; type?: TimelineEventType; page?: number } = {},
    signal?: AbortSignal,
  ) => get<Paged<TimelineEvent>>('/admin/audit', q, signal),
  /* 52 */ auditVerify: (q: { grievance_id?: string } = {}, signal?: AbortSignal) =>
    get<AuditVerification>('/admin/audit/verify', q, signal),
  /* 53 */ aiMetrics: (signal?: AbortSignal) => get<AIMetrics>('/admin/ai/metrics', undefined, signal),
  /* 54 */ retrain: () => post<AIMetrics>('/admin/ai/retrain', {}),
  /* 55 */ demoClock: (signal?: AbortSignal) => get<DemoClock>('/admin/demo/clock', undefined, signal),
  /* 55 */ advanceDemoClock: (advance_hours: number) =>
    post<DemoClock>('/admin/demo/clock', { advance_hours }),
  /* 56 */ demoReset: () => post<{ ok: true }>('/admin/demo/reset', {}),
  /* 57 */ health: (signal?: AbortSignal) => get<Health>('/health', undefined, signal),

  /** Additive: current user's profile (mock implements it; live falls back to auth metadata). */
  me: (signal?: AbortSignal) => get<MeProfile>('/me', undefined, signal),
};

export type Api = typeof api;

// ---------------------------------------------------------------- query keys
// Hierarchical: invalidating a prefix (e.g. qk.grievances.all) refreshes every key below it.

export const qk = {
  all: ['jv'] as const,
  grievances: {
    all: ['jv', 'grievances'] as const,
    mine: (q: MyGrievancesQuery = {}) => ['jv', 'grievances', 'mine', q] as const,
    detail: (id: string, pin?: string) => ['jv', 'grievances', 'detail', id, pin ?? null] as const,
    details: ['jv', 'grievances', 'detail'] as const,
  },
  search: (q: string, scope: SearchScope) => ['jv', 'search', scope, q] as const,
  notifications: {
    all: ['jv', 'notifications'] as const,
    list: (q: { page?: number } = {}) => ['jv', 'notifications', 'list', q] as const,
  },
  meta: {
    all: ['jv', 'meta'] as const,
    departments: ['jv', 'meta', 'departments'] as const,
    wards: ['jv', 'meta', 'wards'] as const,
    wardsGeoJSON: ['jv', 'meta', 'wards.geojson'] as const,
    emergencyContacts: ['jv', 'meta', 'emergency-contacts'] as const,
    asset: (id: string) => ['jv', 'meta', 'asset', id] as const,
  },
  public: {
    all: ['jv', 'public'] as const,
    stats: ['jv', 'public', 'stats'] as const,
    map: (q: object = {}) => ['jv', 'public', 'map', q] as const,
    nearby: (q: object) => ['jv', 'public', 'nearby', q] as const,
  },
  officer: {
    all: ['jv', 'officer'] as const,
    inbox: (q: InboxQuery = {}) => ['jv', 'officer', 'inbox', q] as const,
    reviewQueue: (kind: ReviewKind, page = 1) => ['jv', 'officer', 'review', kind, page] as const,
    brief: (id: string) => ['jv', 'officer', 'brief', id] as const,
    officers: (department?: DepartmentId) => ['jv', 'officer', 'officers', department ?? null] as const,
    incidents: (q: object = {}) => ['jv', 'officer', 'incidents', q] as const,
  },
  admin: {
    all: ['jv', 'admin'] as const,
    kpis: (days = 30) => ['jv', 'admin', 'kpis', days] as const,
    performance: (days = 30) => ['jv', 'admin', 'performance', days] as const,
    workload: (department?: DepartmentId) => ['jv', 'admin', 'workload', department ?? null] as const,
    trends: (q: object = {}) => ['jv', 'admin', 'trends', q] as const,
    breakdown: (q: object) => ['jv', 'admin', 'breakdown', q] as const,
    map: (q: object = {}) => ['jv', 'admin', 'map', q] as const,
    alerts: ['jv', 'admin', 'alerts'] as const,
    insights: (days = 30) => ['jv', 'admin', 'insights', days] as const,
    audit: (q: object = {}) => ['jv', 'admin', 'audit', q] as const,
    auditVerify: (grievance_id?: string) => ['jv', 'admin', 'audit-verify', grievance_id ?? null] as const,
    aiMetrics: ['jv', 'admin', 'ai-metrics'] as const,
    demoClock: ['jv', 'admin', 'demo-clock'] as const,
  },
  health: ['jv', 'health'] as const,
  me: ['jv', 'me'] as const,
};
