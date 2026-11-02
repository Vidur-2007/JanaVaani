// Shared contract — master spec §8, copied verbatim. FROZEN until the H30 integration merge.
// Changes must be additive and logged in docs/contract-notes/<A|B|C>.md.

// ===== Primitives =====
export type Lang = 'en' | 'te' | 'hi' | 'ur' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn' | 'gu' | 'other';
export type DeepLang = 'en' | 'te' | 'hi' | 'ur';
export type Role = 'citizen' | 'guest' | 'officer' | 'supervisor' | 'admin';
export type DepartmentId =
  | 'roads'
  | 'sanitation'
  | 'water'
  | 'streetlights'
  | 'power'
  | 'drainage'
  | 'traffic'
  | 'health'
  | 'education'
  | 'town_planning'
  | 'other';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Status =
  | 'registered'
  | 'needs_review'
  | 'assigned'
  | 'in_progress'
  | 'resolved_pending_verification'
  | 'closed'
  | 'reopened'
  | 'rejected'
  | 'merged';
export type ClosureType = 'citizen_verified' | 'auto_closed_unverified' | 'rejected' | null;
export type LocationSource = 'gps' | 'pin' | 'text' | 'qr';
export type Hazard =
  | 'live_wire'
  | 'fire'
  | 'gas_leak'
  | 'collapse_risk'
  | 'flooding'
  | 'open_manhole'
  | 'contaminated_water'
  | 'sewage_overflow'
  | 'traffic_danger'
  | 'disease_risk'
  | 'near_school'
  | 'near_hospital';
export type Vulnerable = 'children' | 'elderly' | 'disabled' | 'pregnant';
export type Sentiment = 'calm' | 'concerned' | 'frustrated' | 'angry' | 'distressed';
export type ISODate = string; // UTC ISO-8601

export interface Localized {
  original: string;
  en: string;
  lang: Lang;
}
export interface GeoPoint {
  lat: number;
  lng: number;
}
export interface Location extends GeoPoint {
  address?: string;
  landmark?: string;
  ward_id?: string;
  ward_name?: string;
  zone?: string;
  source: LocationSource;
  accuracy_m?: number;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ===== Reference data =====
export interface RequiredField {
  key: string;
  label_en: string;
  question: Record<DeepLang, string>;
}
export interface Department {
  id: DepartmentId;
  name: Record<DeepLang, string>;
  agency_en: string;
  icon: string;
  color: string;
  sub_departments: string[];
  required_fields: RequiredField[];
}
export interface Ward {
  id: string;
  name: string;
  zone: string;
  centroid: GeoPoint;
}
export interface EmergencyContact {
  number: string;
  label_en: string;
  label: Record<DeepLang, string>;
}
export interface Officer {
  id: string;
  name: string;
  designation: string;
  department_id: DepartmentId;
  ward_ids: string[];
  office_name: string;
  office_phone?: string;
  open_cases?: number;
  overdue_cases?: number;
}
export interface Asset {
  id: string;
  type: 'streetlight' | 'drain' | 'water_pipe' | 'bin' | 'road_segment' | 'signal';
  label_en: string;
  ward_id: string;
  location: GeoPoint;
  open_grievance_ids: string[];
  history: { grievance_id: string; category: DepartmentId; created_at: ISODate; closed_at?: ISODate }[];
}

// ===== Grievance =====
export interface Media {
  id: string;
  url: string;
  kind: 'image';
  uploaded_by: 'citizen' | 'officer';
  purpose: 'evidence' | 'resolution_proof' | 'verification';
  quality?: { ok: boolean; issue?: 'blurry' | 'dark' | 'too_small' | 'none' };
  ai?: { category?: DepartmentId; severity?: Priority; description_en?: string; matches_text?: boolean };
  geo?: GeoPoint;
  created_at: ISODate;
}
export interface PriorityFactor {
  key: string;
  label_en: string;
  points: number;
}
export interface RoutingVote {
  source: 'classifier' | 'gemini' | 'groq' | 'rule' | 'human';
  department: DepartmentId;
  confidence?: number;
}
export interface Routing {
  department: DepartmentId;
  sub_department?: string;
  secondary_departments: DepartmentId[];
  confidence: number;
  votes: RoutingVote[];
  explanation_en: string;
  needs_review: boolean;
  method: 'auto' | 'auto_flagged' | 'human';
}
export interface SLA {
  hours: number;
  due_at: ISODate;
  breached: boolean;
  remaining_minutes: number;
  eta_at?: ISODate;
  delay_risk: 'low' | 'medium' | 'high';
  delay_reason?: Localized;
}
export type TimelineEventType =
  | 'registered'
  | 'classified'
  | 'routing_review'
  | 'assigned'
  | 'reassigned'
  | 'status_changed'
  | 'note'
  | 'message'
  | 'evidence_added'
  | 'priority_changed'
  | 'escalated'
  | 'emergency_flagged'
  | 'emergency_confirmed'
  | 'resolution_submitted'
  | 'ai_verification'
  | 'citizen_verified'
  | 'citizen_rejected'
  | 'reopened'
  | 'appeal_filed'
  | 'appeal_decided'
  | 'merged'
  | 'support_added'
  | 'closed';
export interface TimelineEvent {
  id: string;
  grievance_id: string;
  type: TimelineEventType;
  actor_role: Role | 'system' | 'ai';
  actor_name?: string;
  message_en: string;
  message?: Localized;
  internal: boolean; // internal = officer-only (notes)
  payload?: Record<string, unknown>;
  created_at: ISODate;
  hash: string;
  prev_hash: string | null;
}
export interface Appeal {
  id: string;
  grievance_id: string;
  reason: Localized;
  status: 'filed' | 'under_review' | 'upheld' | 'dismissed';
  decision_note?: Localized;
  created_at: ISODate;
  decided_at?: ISODate;
}
export interface AIVerification {
  verdict: 'verified' | 'suspicious' | 'unclear';
  confidence: number;
  reasons_en: string[];
  checks: {
    same_location: boolean | null;
    issue_resolved_visible: boolean | null;
    duplicate_photo: boolean;
    distance_m: number | null;
  };
  created_at: ISODate;
}
export interface Grievance {
  id: string; // e.g. GRV-2026-000123
  title: Localized;
  summary_en: string;
  description: Localized;
  formal_text: Localized;
  language: Lang;
  script: 'native' | 'latin' | 'mixed';
  is_code_mixed: boolean;
  category: DepartmentId;
  routing: Routing;
  status: Status;
  closure_type: ClosureType;
  priority: Priority;
  priority_score: number;
  priority_factors: PriorityFactor[];
  is_emergency: boolean;
  emergency_confirmed: boolean | null;
  hazards: Hazard[];
  vulnerable: Vulnerable[];
  sentiment: Sentiment;
  distress_score: number;
  location: Location;
  asset_id?: string;
  media: Media[];
  assigned_officer?: Officer;
  escalation_level: 0 | 1 | 2 | 3;
  sla: SLA;
  incident_id?: string;
  support_count: number;
  related_ids: string[];
  is_anonymous: boolean;
  is_private: boolean;
  citizen_display_name?: string;
  rating?: number;
  feedback_comment?: string;
  reopen_count: number;
  appeal?: Appeal;
  ai_verification?: AIVerification;
  created_at: ISODate;
  updated_at: ISODate;
  resolved_at?: ISODate;
  closed_at?: ISODate;
}
export interface Message {
  id: string;
  grievance_id?: string;
  session_id?: string;
  sender: 'citizen' | 'bot' | 'officer' | 'system';
  sender_name?: string;
  text: Localized;
  created_at: ISODate;
}
export interface GrievanceDetail extends Grievance {
  timeline: TimelineEvent[];
  messages: Message[];
}
export interface Incident {
  id: string;
  title_en: string;
  category: DepartmentId;
  ward_id: string;
  centroid: GeoPoint;
  grievance_ids: string[];
  support_count: number;
  languages: Lang[];
  status: Status;
  created_at: ISODate;
}

// ===== Chat intake =====
export interface GrievanceDraft {
  draft_id: string;
  title: Localized;
  formal_text: Localized;
  summary_en: string;
  cleaned_original: string;
  category: DepartmentId;
  sub_department?: string;
  urgency: Priority;
  hazards: Hazard[];
  location?: Location;
  media_ids: string[];
  fields: Record<string, string>;
  missing_fields: string[];
  routing_preview?: Routing & { officer_name?: string; office_name?: string };
  priority_preview?: { score: number; level: Priority; factors: PriorityFactor[]; sla_hours: number };
}
export interface DuplicateMatch {
  grievance_id?: string;
  incident_id?: string;
  title: Localized;
  similarity: number;
  distance_m: number;
  support_count: number;
  status: Status;
  created_at: ISODate;
  language: Lang;
}
export interface EmergencyInfo {
  matched_terms: string[];
  contacts: EmergencyContact[];
  message: Localized;
}
export interface ChatTurnRequest {
  session_id?: string;
  text?: string;
  input_mode: 'text' | 'voice';
  lang_hint?: Lang;
  ui_lang: DeepLang;
  media_ids?: string[];
  location?: Location;
  asset_id?: string;
  action?:
    | 'confirm'
    | 'edit'
    | 'cancel'
    | 'split_confirm'
    | 'support_existing'
    | 'file_new_anyway'
    | 'continue_after_emergency';
  action_payload?: Record<string, unknown>;
  submit_options?: { is_anonymous?: boolean; is_private?: boolean };
}
export interface ChatTurnResponse {
  session_id: string;
  intent: 'new_complaint' | 'track_status' | 'ask_info' | 'smalltalk' | 'emergency';
  stage: 'collecting' | 'confirming' | 'duplicate_check' | 'submitted' | 'emergency' | 'answered';
  detected_language: Lang;
  is_code_mixed: boolean;
  reply: Localized;
  quick_replies: { label: string; value: string }[];
  missing_fields: string[];
  draft?: GrievanceDraft;
  drafts?: GrievanceDraft[]; // drafts[] when multiple issues
  duplicates?: DuplicateMatch[];
  emergency?: EmergencyInfo;
  submitted?: { grievance_id: string; guest_pin?: string }[];
  tracked?: Grievance[];
}

// ===== Notifications & live events =====
export interface Notification {
  id: string;
  grievance_id?: string;
  type: 'status' | 'message' | 'escalation' | 'community_update' | 'verification_request' | 'alert';
  title: Localized;
  body: Localized;
  read: boolean;
  created_at: ISODate;
}
export interface LiveEvent {
  id: string;
  audience: string; // 'user:<uuid>' | 'dept:<id>' | 'role:admin' | 'public'
  kind: 'grievance_created' | 'grievance_updated' | 'notification' | 'alert';
  grievance_id?: string;
  created_at: ISODate;
}

// ===== Officer =====
export interface OfficerBrief {
  situation: string;
  evidence: string[];
  risks: string[];
  suggested_next_steps: string[];
  missing_info: string[];
  similar_resolved: { grievance_id: string; title_en: string; resolution_note: string }[];
  generated_by: 'groq' | 'gemini' | 'fallback';
  created_at: ISODate;
}
export type ReplyIntent =
  | 'acknowledge'
  | 'request_info'
  | 'schedule_visit'
  | 'work_started'
  | 'resolved'
  | 'delay_update'
  | 'transfer';
export interface DraftReply {
  intent: ReplyIntent;
  draft_en: string;
  draft_citizen: Localized;
}

// ===== Admin & analytics =====
export interface KPIs {
  total: number;
  open: number;
  resolved: number;
  overdue: number;
  critical_open: number;
  avg_resolution_hours: number;
  avg_first_response_hours: number;
  sla_compliance_pct: number;
  satisfaction_avg: number;
  reopened_pct: number;
  needs_review: number;
  deltas: Partial<
    Record<'total' | 'open' | 'resolved' | 'overdue' | 'sla_compliance_pct' | 'avg_resolution_hours', number>
  >;
}
export interface DepartmentPerformance {
  department_id: DepartmentId;
  total: number;
  open: number;
  resolved: number;
  overdue: number;
  avg_resolution_hours: number;
  sla_compliance_pct: number;
  satisfaction_avg: number;
  reopen_rate: number;
  score: number;
  rank: number;
}
export interface OfficerWorkload {
  officer: Officer;
  open: number;
  critical: number;
  overdue: number;
  resolved_7d: number;
}
export interface TrendPoint {
  date: string;
  created: number;
  resolved: number;
  by_category?: Partial<Record<DepartmentId, number>>;
}
export interface BreakdownRow {
  key: string;
  label: string;
  total: number;
  open: number;
  overdue: number;
  avg_resolution_hours: number;
}
export interface Alert {
  id: string;
  kind:
    | 'spike'
    | 'overdue_critical'
    | 'repeated_reopen'
    | 'suspicious_closure'
    | 'routing_review_backlog'
    | 'emergency_unconfirmed';
  severity: 'info' | 'warning' | 'critical';
  title_en: string;
  detail_en: string;
  ward_id?: string;
  category?: DepartmentId;
  grievance_ids: string[];
  languages?: Lang[];
  created_at: ISODate;
}
export interface MapPoint {
  id?: string; // omitted on public endpoints
  lat: number;
  lng: number;
  category: DepartmentId;
  priority: Priority;
  status: Status;
  incident_id?: string;
}
export interface AIMetrics {
  model_version: string;
  trained_at: ISODate;
  embedding_model: string;
  n_train: number;
  n_test: number;
  accuracy: number;
  macro_f1: number;
  per_language: Partial<Record<Lang | 'code_mixed', { accuracy: number; n: number }>>;
  human_test?: {
    accuracy: number;
    n: number;
    per_language: Partial<Record<Lang | 'code_mixed', { accuracy: number; n: number }>>;
  };
  confusion: { labels: DepartmentId[]; matrix: number[][] };
  live: {
    auto_routed_pct: number;
    needs_review_pct: number;
    agreement_rate: number;
    avg_pipeline_ms: number;
    fallback_rate: number;
    calls_24h: number;
  };
  history: {
    model_version: string;
    accuracy: number;
    macro_f1: number;
    trained_at: ISODate;
    corrections_used: number;
  }[];
}
export interface AuditVerification {
  grievance_id?: string;
  events_checked: number;
  valid: boolean;
  first_broken_event_id?: string;
}
export interface InsightSummary {
  bullets_en: string[];
  generated_by: 'groq' | 'gemini' | 'template';
  numbers_verified: boolean;
  created_at: ISODate;
}
export interface PublicStats {
  total: number;
  resolved: number;
  resolution_rate_pct: number;
  avg_resolution_hours: number;
  by_department: {
    department_id: DepartmentId;
    total: number;
    resolved_pct: number;
    avg_resolution_hours: number;
  }[];
  by_zone: { zone: string; total: number; resolved_pct: number }[];
  trend: TrendPoint[];
  recent_resolved: {
    title_en: string;
    category: DepartmentId;
    zone: string;
    before_url?: string;
    after_url?: string;
    resolved_at: ISODate;
  }[];
}
export interface DemoClock {
  now: ISODate;
  offset_minutes: number;
}
