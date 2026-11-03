"""Pydantic v2 mirror of master §8 (packages/contracts/src/types.ts), identical snake_case names."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Lang = Literal['en', 'te', 'hi', 'ur', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'other']
DeepLang = Literal['en', 'te', 'hi', 'ur']
Role = Literal['citizen', 'guest', 'officer', 'supervisor', 'admin']
DepartmentId = Literal['roads', 'sanitation', 'water', 'streetlights', 'power', 'drainage', 'traffic', 'health',
                       'education', 'town_planning', 'other']
Priority = Literal['critical', 'high', 'medium', 'low']
Status = Literal['registered', 'needs_review', 'assigned', 'in_progress', 'resolved_pending_verification', 'closed',
                 'reopened', 'rejected', 'merged']
ClosureType = Optional[Literal['citizen_verified', 'auto_closed_unverified', 'rejected']]
LocationSource = Literal['gps', 'pin', 'text', 'qr']
Hazard = Literal['live_wire', 'fire', 'gas_leak', 'collapse_risk', 'flooding', 'open_manhole', 'contaminated_water',
                 'sewage_overflow', 'traffic_danger', 'disease_risk', 'near_school', 'near_hospital']
Vulnerable = Literal['children', 'elderly', 'disabled', 'pregnant']
Sentiment = Literal['calm', 'concerned', 'frustrated', 'angry', 'distressed']
ISODate = str


class Localized(BaseModel):
    original: str
    en: str
    lang: Lang


class GeoPoint(BaseModel):
    lat: float
    lng: float


class Location(GeoPoint):
    address: Optional[str] = None
    landmark: Optional[str] = None
    ward_id: Optional[str] = None
    ward_name: Optional[str] = None
    zone: Optional[str] = None
    source: LocationSource
    accuracy_m: Optional[float] = None


class Paged(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


class ApiErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ApiError(BaseModel):
    error: ApiErrorBody


class RequiredField(BaseModel):
    key: str
    label_en: str
    question: dict[DeepLang, str]


class Department(BaseModel):
    id: DepartmentId
    name: dict[DeepLang, str]
    agency_en: str
    icon: str
    color: str
    sub_departments: list[str]
    required_fields: list[RequiredField]


class Ward(BaseModel):
    id: str
    name: str
    zone: str
    centroid: GeoPoint


class EmergencyContact(BaseModel):
    number: str
    label_en: str
    label: dict[DeepLang, str]


class Officer(BaseModel):
    id: str
    name: str
    designation: str
    department_id: DepartmentId
    ward_ids: list[str]
    office_name: str
    office_phone: Optional[str] = None
    open_cases: Optional[int] = None
    overdue_cases: Optional[int] = None


class AssetHistory(BaseModel):
    grievance_id: str
    category: DepartmentId
    created_at: ISODate
    closed_at: Optional[ISODate] = None


class Asset(BaseModel):
    id: str
    type: Literal['streetlight', 'drain', 'water_pipe', 'bin', 'road_segment', 'signal']
    label_en: str
    ward_id: str
    location: GeoPoint
    open_grievance_ids: list[str]
    history: list[AssetHistory]


class MediaQuality(BaseModel):
    ok: bool
    issue: Optional[Literal['blurry', 'dark', 'too_small', 'none']] = None


class MediaAI(BaseModel):
    category: Optional[DepartmentId] = None
    severity: Optional[Priority] = None
    description_en: Optional[str] = None
    matches_text: Optional[bool] = None


class Media(BaseModel):
    id: str
    url: str
    kind: Literal['image']
    uploaded_by: Literal['citizen', 'officer']
    purpose: Literal['evidence', 'resolution_proof', 'verification']
    quality: Optional[MediaQuality] = None
    ai: Optional[MediaAI] = None
    geo: Optional[GeoPoint] = None
    created_at: ISODate


class PriorityFactor(BaseModel):
    key: str
    label_en: str
    points: int


class RoutingVote(BaseModel):
    source: Literal['classifier', 'gemini', 'groq', 'rule', 'human']
    department: DepartmentId
    confidence: Optional[float] = None


class Routing(BaseModel):
    department: DepartmentId
    sub_department: Optional[str] = None
    secondary_departments: list[DepartmentId] = []
    confidence: float
    votes: list[RoutingVote]
    explanation_en: str
    needs_review: bool
    method: Literal['auto', 'auto_flagged', 'human']


class SLA(BaseModel):
    hours: int
    due_at: ISODate
    breached: bool
    remaining_minutes: int
    eta_at: Optional[ISODate] = None
    delay_risk: Literal['low', 'medium', 'high']
    delay_reason: Optional[Localized] = None


TimelineEventType = Literal['registered', 'classified', 'routing_review', 'assigned', 'reassigned', 'status_changed',
                            'note', 'message', 'evidence_added', 'priority_changed', 'escalated', 'emergency_flagged',
                            'emergency_confirmed', 'resolution_submitted', 'ai_verification', 'citizen_verified',
                            'citizen_rejected', 'reopened', 'appeal_filed', 'appeal_decided', 'merged', 'support_added',
                            'closed']


class TimelineEvent(BaseModel):
    id: str
    grievance_id: str
    type: TimelineEventType
    actor_role: Literal['citizen', 'guest', 'officer', 'supervisor', 'admin', 'system', 'ai']
    actor_name: Optional[str] = None
    message_en: str
    message: Optional[Localized] = None
    internal: bool
    payload: Optional[dict[str, Any]] = None
    created_at: ISODate
    hash: str
    prev_hash: Optional[str] = None


class Appeal(BaseModel):
    id: str
    grievance_id: str
    reason: Localized
    status: Literal['filed', 'under_review', 'upheld', 'dismissed']
    decision_note: Optional[Localized] = None
    created_at: ISODate
    decided_at: Optional[ISODate] = None


class AIVerificationChecks(BaseModel):
    same_location: Optional[bool] = None
    issue_resolved_visible: Optional[bool] = None
    duplicate_photo: bool
    distance_m: Optional[float] = None


class AIVerification(BaseModel):
    verdict: Literal['verified', 'suspicious', 'unclear']
    confidence: float
    reasons_en: list[str]
    checks: AIVerificationChecks
    created_at: ISODate
    assessment: Optional[Literal['verified', 'likely_resolved', 'needs_human_review', 'rejected_evidence']] = None  # additive


class Grievance(BaseModel):
    id: str
    title: Localized
    summary_en: str
    description: Localized
    formal_text: Localized
    language: Lang
    script: Literal['native', 'latin', 'mixed']
    is_code_mixed: bool
    category: DepartmentId
    routing: Routing
    status: Status
    closure_type: ClosureType = None
    priority: Priority
    priority_score: int
    priority_factors: list[PriorityFactor]
    is_emergency: bool
    emergency_confirmed: Optional[bool] = None
    hazards: list[Hazard]
    vulnerable: list[Vulnerable]
    sentiment: Sentiment
    distress_score: float
    location: Location
    asset_id: Optional[str] = None
    media: list[Media]
    assigned_officer: Optional[Officer] = None
    escalation_level: Literal[0, 1, 2, 3]
    sla: SLA
    incident_id: Optional[str] = None
    support_count: int
    related_ids: list[str]
    is_anonymous: bool
    is_private: bool
    citizen_display_name: Optional[str] = None
    rating: Optional[int] = None
    feedback_comment: Optional[str] = None
    reopen_count: int
    appeal: Optional[Appeal] = None
    ai_verification: Optional[AIVerification] = None
    created_at: ISODate
    updated_at: ISODate
    resolved_at: Optional[ISODate] = None
    closed_at: Optional[ISODate] = None


class Message(BaseModel):
    id: str
    grievance_id: Optional[str] = None
    session_id: Optional[str] = None
    sender: Literal['citizen', 'bot', 'officer', 'system']
    sender_name: Optional[str] = None
    text: Localized
    created_at: ISODate


class GrievanceDetail(Grievance):
    timeline: list[TimelineEvent]
    messages: list[Message]


class Incident(BaseModel):
    id: str
    title_en: str
    category: DepartmentId
    ward_id: str
    centroid: GeoPoint
    grievance_ids: list[str]
    support_count: int
    languages: list[Lang]
    status: Status
    created_at: ISODate


class PriorityPreview(BaseModel):
    score: int
    level: Priority
    factors: list[PriorityFactor]
    sla_hours: int


class RoutingPreview(Routing):
    officer_name: Optional[str] = None
    office_name: Optional[str] = None


class GrievanceDraft(BaseModel):
    draft_id: str
    title: Localized
    formal_text: Localized
    summary_en: str
    cleaned_original: str
    category: DepartmentId
    sub_department: Optional[str] = None
    urgency: Priority
    hazards: list[Hazard]
    location: Optional[Location] = None
    media_ids: list[str]
    fields: dict[str, str]
    missing_fields: list[str]
    routing_preview: Optional[RoutingPreview] = None
    priority_preview: Optional[PriorityPreview] = None


class DuplicateMatch(BaseModel):
    grievance_id: Optional[str] = None
    incident_id: Optional[str] = None
    title: Localized
    similarity: float
    distance_m: float
    support_count: int
    status: Status
    created_at: ISODate
    language: Lang
    signals: Optional[dict[str, Any]] = None   # additive: explainable matching signals


class EmergencyInfo(BaseModel):
    matched_terms: list[str]
    contacts: list[EmergencyContact]
    message: Localized


class QuickReply(BaseModel):
    label: str
    value: str


class SubmitOptions(BaseModel):
    is_anonymous: Optional[bool] = None
    is_private: Optional[bool] = None


class ChatTurnRequest(BaseModel):
    session_id: Optional[str] = None
    text: Optional[str] = Field(None, max_length=4000)
    input_mode: Literal['text', 'voice'] = 'text'
    lang_hint: Optional[Lang] = None
    ui_lang: DeepLang = 'en'
    media_ids: list[str] = []
    location: Optional[Location] = None
    asset_id: Optional[str] = None
    action: Optional[Literal['confirm', 'edit', 'cancel', 'split_confirm', 'support_existing', 'file_new_anyway',
                             'continue_after_emergency']] = None
    action_payload: dict[str, Any] = {}
    submit_options: SubmitOptions = SubmitOptions()


class Submitted(BaseModel):
    grievance_id: str
    guest_pin: Optional[str] = None


class ChatTurnResponse(BaseModel):
    session_id: str
    intent: Literal['new_complaint', 'track_status', 'ask_info', 'smalltalk', 'emergency']
    stage: Literal['collecting', 'confirming', 'duplicate_check', 'submitted', 'emergency', 'answered']
    detected_language: Lang
    is_code_mixed: bool
    reply: Localized
    quick_replies: list[QuickReply]
    missing_fields: list[str]
    draft: Optional[GrievanceDraft] = None
    drafts: Optional[list[GrievanceDraft]] = None
    duplicates: Optional[list[DuplicateMatch]] = None
    emergency: Optional[EmergencyInfo] = None
    submitted: Optional[list[Submitted]] = None
    tracked: Optional[list[Grievance]] = None


class Notification(BaseModel):
    id: str
    grievance_id: Optional[str] = None
    type: Literal['status', 'message', 'escalation', 'community_update', 'verification_request', 'alert']
    title: Localized
    body: Localized
    read: bool
    created_at: ISODate


class LiveEvent(BaseModel):
    id: str
    audience: str
    kind: Literal['grievance_created', 'grievance_updated', 'notification', 'alert']
    grievance_id: Optional[str] = None
    created_at: ISODate


class SimilarResolved(BaseModel):
    grievance_id: str
    title_en: str
    resolution_note: str


class OfficerBrief(BaseModel):
    situation: str
    evidence: list[str]
    risks: list[str]
    suggested_next_steps: list[str]
    missing_info: list[str]
    similar_resolved: list[SimilarResolved]
    generated_by: Literal['groq', 'gemini', 'fallback']
    created_at: ISODate


ReplyIntent = Literal['acknowledge', 'request_info', 'schedule_visit', 'work_started', 'resolved', 'delay_update', 'transfer']


class DraftReply(BaseModel):
    intent: ReplyIntent
    draft_en: str
    draft_citizen: Localized


class KPIs(BaseModel):
    total: int
    open: int
    resolved: int
    overdue: int
    critical_open: int
    avg_resolution_hours: float
    avg_first_response_hours: float
    sla_compliance_pct: float
    satisfaction_avg: float
    reopened_pct: float
    needs_review: int
    deltas: dict[str, float]


class DepartmentPerformance(BaseModel):
    department_id: DepartmentId
    total: int
    open: int
    resolved: int
    overdue: int
    avg_resolution_hours: float
    sla_compliance_pct: float
    satisfaction_avg: float
    reopen_rate: float
    score: float
    rank: int


class OfficerWorkload(BaseModel):
    officer: Officer
    open: int
    critical: int
    overdue: int
    resolved_7d: int


class TrendPoint(BaseModel):
    date: str
    created: int
    resolved: int
    by_category: Optional[dict[str, int]] = None


class BreakdownRow(BaseModel):
    key: str
    label: str
    total: int
    open: int
    overdue: int
    avg_resolution_hours: float


class Alert(BaseModel):
    id: str
    kind: Literal['spike', 'overdue_critical', 'repeated_reopen', 'suspicious_closure', 'routing_review_backlog',
                  'emergency_unconfirmed']
    severity: Literal['info', 'warning', 'critical']
    title_en: str
    detail_en: str
    ward_id: Optional[str] = None
    category: Optional[DepartmentId] = None
    grievance_ids: list[str]
    languages: Optional[list[Lang]] = None
    created_at: ISODate


class MapPoint(BaseModel):
    id: Optional[str] = None
    lat: float
    lng: float
    category: DepartmentId
    priority: Priority
    status: Status
    incident_id: Optional[str] = None


class LangAcc(BaseModel):
    accuracy: float
    n: int


class HumanTest(BaseModel):
    accuracy: float
    n: int
    per_language: dict[str, LangAcc]


class Confusion(BaseModel):
    labels: list[DepartmentId]
    matrix: list[list[int]]


class LiveOps(BaseModel):
    auto_routed_pct: float
    needs_review_pct: float
    agreement_rate: float
    avg_pipeline_ms: float
    fallback_rate: float
    calls_24h: int


class ModelHistory(BaseModel):
    model_version: str
    accuracy: float
    macro_f1: float
    trained_at: ISODate
    corrections_used: int


class AIMetrics(BaseModel):
    model_version: str
    trained_at: ISODate
    embedding_model: str
    n_train: int
    n_test: int
    accuracy: float
    macro_f1: float
    per_language: dict[str, LangAcc]
    human_test: Optional[HumanTest] = None
    confusion: Confusion
    live: LiveOps
    history: list[ModelHistory]


class AuditVerification(BaseModel):
    grievance_id: Optional[str] = None
    events_checked: int
    valid: bool
    first_broken_event_id: Optional[str] = None


class InsightSummary(BaseModel):
    bullets_en: list[str]
    generated_by: Literal['groq', 'gemini', 'template']
    numbers_verified: bool
    created_at: ISODate


class PublicDept(BaseModel):
    department_id: DepartmentId
    total: int
    resolved_pct: float
    avg_resolution_hours: float


class PublicZone(BaseModel):
    zone: str
    total: int
    resolved_pct: float


class RecentResolved(BaseModel):
    title_en: str
    category: DepartmentId
    zone: str
    before_url: Optional[str] = None
    after_url: Optional[str] = None
    resolved_at: ISODate


class PublicStats(BaseModel):
    total: int
    resolved: int
    resolution_rate_pct: float
    avg_resolution_hours: float
    by_department: list[PublicDept]
    by_zone: list[PublicZone]
    trend: list[TrendPoint]
    recent_resolved: list[RecentResolved]


class DemoClock(BaseModel):
    now: ISODate
    offset_minutes: int
