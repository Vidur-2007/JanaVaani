// One mock handler per endpoint in master §9 (#1–#57). Pure TS, no browser globals required
// (except URL.createObjectURL for uploads, used only when available).
import type {
  AIMetrics,
  Alert,
  Appeal,
  AuditVerification,
  BreakdownRow,
  ChatTurnRequest,
  ChatTurnResponse,
  DeepLang,
  DemoClock,
  DepartmentId,
  DepartmentPerformance,
  DraftReply,
  DuplicateMatch,
  EmergencyInfo,
  Grievance,
  GrievanceDetail,
  GrievanceDraft,
  Hazard,
  InsightSummary,
  KPIs,
  Lang,
  Localized,
  Location,
  MapPoint,
  Media,
  Message,
  Notification,
  OfficerBrief,
  OfficerWorkload,
  Paged,
  Priority,
  PublicStats,
  ReplyIntent,
  Status,
  TimelineEvent,
  TrendPoint,
} from '../src/types';
import {
  addMessage,
  buildDb,
  buildSla,
  computePriority,
  eventHash,
  findGrievance,
  getDb,
  isOpen,
  iso,
  levelForScore,
  mockImage,
  nearbyOpen,
  nextGrievanceId,
  notify,
  nowIso,
  nowMs,
  officerById,
  pushEvent,
  pushLiveEvent,
  refresh,
  verification,
  SLA_HOURS,
  type ChatSession,
} from './db';
import { DEPARTMENTS, DEPT_KEYWORDS, deptById } from './data/departments';
import { WARDS, nearestWard, wardById, wardsGeoJSON } from './data/wards';
import { OFFICERS, OFFICER_FOR_USER, pickOfficer, type MockProfile } from './data/people';
import { EMERGENCY_CONTACTS, scanEmergency } from './data/emergency';
import { PHRASES } from './data/phrases';
import { DAY, HOUR, createRng, distanceM, fakeHash } from './seed';

// ---------------------------------------------------------------- plumbing

export interface MockCtx {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  user: MockProfile | null;
}

export class MockHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type MockHandlerFn = (ctx: MockCtx) => unknown | Promise<unknown>;
export interface MockHandler {
  method: 'GET' | 'POST';
  pattern: string;
  fn: MockHandlerFn;
}

const rng = createRng(777);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B = (ctx: MockCtx) => (ctx.body ?? {}) as any;
const isGov = (u: MockProfile | null) => !!u && ['officer', 'supervisor', 'admin'].includes(u.role);
const L = (text: string, lang: Lang, en = text): Localized => ({ original: text, en, lang });

function requireUser(ctx: MockCtx) {
  if (!ctx.user) throw new MockHttpError(401, 'unauthorized', 'Sign in required');
  return ctx.user;
}
function requireRole(ctx: MockCtx, roles: string[]) {
  const u = requireUser(ctx);
  if (!roles.includes(u.role)) throw new MockHttpError(403, 'forbidden', `Requires role: ${roles.join(', ')}`);
  return u;
}
function getG(id: string) {
  const g = findGrievance(id);
  if (!g) throw new MockHttpError(404, 'not_found', `Grievance ${id} not found`);
  return refresh(g);
}
export function pinFor(id: string) {
  const db = getDb();
  return (db.pins[id] ??= String((parseInt(fakeHash(id).slice(0, 8), 16) % 900000) + 100000));
}
function requireOwner(ctx: MockCtx, id: string) {
  const g = getG(id);
  const u = ctx.user;
  const pin = ctx.query.get('pin') ?? B(ctx).pin;
  if (isGov(u) || (u && getDb().owners[id] === u.id) || (pin && pin === pinFor(id))) return g;
  throw new MockHttpError(403, 'forbidden', 'You can only act on your own complaints');
}
function paged<T>(items: T[], q: URLSearchParams): Paged<T> {
  const page = Math.max(1, Number(q.get('page') ?? 1));
  const page_size = Math.max(1, Math.min(100, Number(q.get('page_size') ?? 20)));
  return { items: items.slice((page - 1) * page_size, page * page_size), total: items.length, page, page_size };
}
const strip = (g: GrievanceDetail): Grievance => {
  const { timeline: _t, messages: _m, ...rest } = g;
  return rest;
};
function viewFor(ctx: MockCtx, g: GrievanceDetail): GrievanceDetail {
  if (isGov(ctx.user)) return g;
  return { ...g, timeline: g.timeline.filter((e) => !e.internal) };
}
const audienceForDept = (d: DepartmentId) => `dept:${d}`;
function touch(g: GrievanceDetail) {
  pushLiveEvent('grievance_updated', audienceForDept(g.category), g.id);
  const owner = getDb().owners[g.id];
  if (owner) pushLiveEvent('grievance_updated', `user:${owner}`, g.id);
  pushLiveEvent('grievance_updated', 'role:admin', g.id);
}
function scopeForOfficer(ctx: MockCtx, list: GrievanceDetail[]) {
  const u = ctx.user;
  if (!u || u.role !== 'officer') return list;
  const oid = OFFICER_FOR_USER[u.id];
  const officer = oid ? officerById(oid) : undefined;
  if (!officer) return list.filter((g) => g.category === u.department_id);
  const depts: DepartmentId[] = officer.department_id === 'streetlights' ? ['streetlights', 'power'] : [officer.department_id];
  return list.filter((g) => depts.includes(g.category) && (!g.location.ward_id || officer.ward_ids.includes(g.location.ward_id)));
}

// ---------------------------------------------------------------- mock "AI"

const SCRIPT_RANGES: [Lang, RegExp][] = [
  ['te', /[ఀ-౿]/],
  ['hi', /[ऀ-ॿ]/],
  ['ur', /[؀-ۿ]/],
  ['ta', /[஀-௿]/],
  ['kn', /[ಀ-೿]/],
  ['ml', /[ഀ-ൿ]/],
  ['bn', /[ঀ-৿]/],
  ['gu', /[઀-૿]/],
];
const TENGLISH = /\b(lo|undi|ledu|raavatledu|chesaru|cheyyandi|gunta|neellu|maa|chala|ekkada|ga|avtundi|avtunnayi)\b/i;
const HINGLISH = /\b(hai|nahi|kya|bahut|paani|karo|gaddha|raha|rahi|hain|mein|jaldi)\b/i;

export function detectLang(text: string, hint?: Lang): { lang: Lang; script: 'native' | 'latin' | 'mixed'; mixed: boolean } {
  for (const [lang, re] of SCRIPT_RANGES) {
    if (re.test(text)) return { lang, script: /[A-Za-z]{3,}/.test(text) ? 'mixed' : 'native', mixed: /[A-Za-z]{3,}/.test(text) };
  }
  if (TENGLISH.test(text)) return { lang: 'te', script: 'latin', mixed: true };
  if (HINGLISH.test(text)) return { lang: 'hi', script: 'latin', mixed: true };
  return { lang: hint && hint !== 'other' ? hint : 'en', script: 'latin', mixed: false };
}

export function classify(text: string): { dept: DepartmentId; confidence: number } {
  const lower = text.toLowerCase();
  let best: DepartmentId = 'other';
  let bestN = 0;
  for (const d of DEPARTMENTS) {
    const n = DEPT_KEYWORDS[d.id].filter((k) => lower.includes(k.toLowerCase())).length;
    if (n > bestN) {
      bestN = n;
      best = d.id;
    }
  }
  return { dept: best, confidence: bestN === 0 ? 0.41 : Math.min(0.97, 0.72 + bestN * 0.08) };
}

function englishFor(text: string, dept: DepartmentId, lang: Lang): string {
  const known = PHRASES.find((p) => p.text === text.trim() || p.title === text.trim());
  if (known) return known.text_en;
  if (lang === 'en') return text;
  return `[Mock translation] ${deptById(dept).name.en} complaint reported in ${lang.toUpperCase()}: "${text.slice(0, 160)}"`;
}

export function analyze(
  text: string,
  ui_lang: DeepLang,
  opts: { location?: Location; media_ids?: string[]; fields?: Record<string, string>; asset_id?: string; draft_id?: string } = {},
): GrievanceDraft {
  const db = getDb();
  const asset = opts.asset_id ? db.assets.find((a) => a.id === opts.asset_id) : undefined;
  const assetDept: Partial<Record<string, DepartmentId>> = { streetlight: 'streetlights', drain: 'drainage', water_pipe: 'water', bin: 'sanitation', road_segment: 'roads', signal: 'traffic' };
  const det = detectLang(text, ui_lang);
  const cls = asset ? { dept: assetDept[asset.type] ?? 'other', confidence: 0.95 } : classify(text);
  const dept = cls.dept;
  const em = scanEmergency(text);
  const hazards: Hazard[] = em.hazards;
  const urgency: Priority = em.terms.length ? 'critical' : /urgent|danger|accident|sick|ప్రమాదం|खतरा|خطرہ/i.test(text) ? 'high' : 'medium';
  const en = englishFor(text, dept, det.lang);
  const fields = { ...(opts.fields ?? {}) };
  const location = opts.location ?? (asset ? { ...asset.location, source: 'qr' as const } : undefined);
  if (location && !location.ward_id) {
    const w = nearestWard(location.lat, location.lng);
    Object.assign(location, { ward_id: w.id, ward_name: w.name, zone: w.zone });
  }
  if (location && !fields.location_detail) fields.location_detail = location.landmark ?? location.address ?? location.ward_name ?? 'Shared on map';
  const required = deptById(dept).required_fields.filter((f) => f.key !== 'pole_number');
  const missing = required.filter((f) => !fields[f.key]).map((f) => f.key);
  const pr = computePriority({ urgency, hazards, emergency: em.terms.length > 0, distress: urgency === 'critical' ? 0.8 : 0.3, vulnerable: [], supporters: 0 });
  const ward = location?.ward_id ?? WARDS[0].id;
  const officer = pickOfficer(dept, ward);
  const confident = cls.confidence >= 0.6;
  const title = text.length > 64 ? `${text.slice(0, 61)}…` : text;
  const draft: GrievanceDraft = {
    draft_id: opts.draft_id ?? `DR-${Date.now().toString(36)}-${rng.int(100, 999)}`,
    title: L(title, det.lang, en.length > 64 ? `${en.slice(0, 61)}…` : en),
    formal_text: L(text, det.lang, `Respected Sir/Madam, ${en} Kindly take action at the earliest.`),
    summary_en: en,
    cleaned_original: text.trim(),
    category: dept,
    sub_department: deptById(dept).sub_departments[0],
    urgency,
    hazards,
    location,
    media_ids: opts.media_ids ?? [],
    fields,
    missing_fields: missing,
    routing_preview: {
      department: dept,
      sub_department: deptById(dept).sub_departments[0],
      secondary_departments: [],
      confidence: +cls.confidence.toFixed(2),
      votes: [
        { source: 'classifier', department: dept, confidence: +cls.confidence.toFixed(2) },
        { source: 'gemini', department: dept, confidence: +Math.min(0.99, cls.confidence + 0.04).toFixed(2) },
        { source: 'rule', department: dept },
      ],
      explanation_en: confident ? `Keywords and models point to ${deptById(dept).name.en}.` : 'Low confidence — a supervisor will confirm the department.',
      needs_review: !confident,
      method: confident ? 'auto' : 'auto_flagged',
      officer_name: officer.name,
      office_name: officer.office_name,
    },
    priority_preview: { score: pr.score, level: pr.level, factors: pr.factors, sla_hours: SLA_HOURS[pr.level] },
  };
  db.drafts[draft.draft_id] = draft;
  return draft;
}

function duplicatesFor(text: string, location: Location | undefined, category: DepartmentId): DuplicateMatch[] {
  if (!location) return [];
  const db = getDb();
  const out: DuplicateMatch[] = [];
  for (const inc of db.incidents) {
    if (inc.category !== category) continue;
    const d = distanceM(location, inc.centroid);
    if (d <= 500) {
      const lead = findGrievance(inc.grievance_ids[0])!;
      out.push({ incident_id: inc.id, grievance_id: lead.id, title: lead.title, similarity: 0.91, distance_m: d, support_count: inc.support_count, status: inc.status, created_at: inc.created_at, language: lead.language });
    }
  }
  for (const { g, d } of nearbyOpen(location, 300, category).slice(0, 3)) {
    if (g.incident_id && out.some((o) => o.incident_id === g.incident_id)) continue;
    out.push({ grievance_id: g.id, title: g.title, similarity: +(0.7 + rng.next() * 0.2).toFixed(2), distance_m: d, support_count: g.support_count, status: g.status, created_at: g.created_at, language: g.language });
  }
  void text;
  return out.slice(0, 3);
}

function emergencyInfo(terms: string[], ui: DeepLang): EmergencyInfo {
  return { matched_terms: terms, contacts: EMERGENCY_CONTACTS, message: L(BOT.emergency[ui], ui, BOT.emergency.en) };
}

function createFromDraft(
  ctx: MockCtx,
  draft: GrievanceDraft,
  opts: { location?: Location; media_ids?: string[]; asset_id?: string; is_anonymous?: boolean; is_private?: boolean },
): { grievance: GrievanceDetail; guest_pin?: string } {
  const db = getDb();
  const location: Location = opts.location ?? draft.location ?? { ...WARDS[0].centroid, source: 'text' };
  if (!location.ward_id) {
    const w = nearestWard(location.lat, location.lng);
    Object.assign(location, { ward_id: w.id, ward_name: w.name, zone: w.zone });
  }
  const em = draft.hazards.length > 0 && draft.urgency === 'critical';
  const pr = computePriority({ urgency: draft.urgency, hazards: draft.hazards, emergency: em, distress: 0.5, vulnerable: [], supporters: 0 });
  const routing = draft.routing_preview!;
  const needsReview = routing.needs_review;
  const officer = pickOfficer(draft.category, location.ward_id!);
  const id = nextGrievanceId();
  const now = nowMs();
  const media = (opts.media_ids ?? draft.media_ids).map((mid) => db.media[mid]).filter(Boolean) as Media[];
  const g: GrievanceDetail = {
    id,
    title: draft.title,
    summary_en: draft.summary_en,
    description: { original: draft.cleaned_original, en: draft.summary_en, lang: draft.title.lang },
    formal_text: draft.formal_text,
    language: draft.title.lang,
    script: detectLang(draft.cleaned_original).script,
    is_code_mixed: detectLang(draft.cleaned_original).mixed,
    category: draft.category,
    routing: { ...routing },
    status: needsReview ? 'needs_review' : 'assigned',
    closure_type: null,
    priority: pr.level,
    priority_score: pr.score,
    priority_factors: pr.factors,
    is_emergency: em,
    emergency_confirmed: em ? null : null,
    hazards: draft.hazards,
    vulnerable: [],
    sentiment: em ? 'distressed' : 'concerned',
    distress_score: em ? 0.8 : 0.3,
    location,
    asset_id: opts.asset_id,
    media,
    assigned_officer: needsReview ? undefined : officer,
    escalation_level: 0,
    sla: buildSla(now, pr.level, null, false),
    support_count: 0,
    related_ids: [],
    is_anonymous: !!opts.is_anonymous,
    is_private: !!opts.is_private,
    citizen_display_name: opts.is_anonymous ? undefined : ctx.user?.name,
    reopen_count: 0,
    created_at: iso(now),
    updated_at: iso(now),
    timeline: [],
    messages: [],
  };
  pushEvent(g, 'registered', ctx.user?.role === 'guest' ? 'guest' : 'citizen', 'Complaint registered', { message: draft.title });
  pushEvent(g, 'classified', 'ai', `Classified as ${deptById(g.category).name.en} · priority ${pr.level} (${pr.score})`);
  if (em) pushEvent(g, 'emergency_flagged', 'system', 'Emergency keywords detected — awaiting supervisor confirmation');
  if (needsReview) pushEvent(g, 'routing_review', 'system', 'Low routing confidence — sent to supervisor review');
  else pushEvent(g, 'assigned', 'system', `Assigned to ${officer.name}, ${officer.designation}`, { payload: { officer_id: officer.id } });
  addMessage(g, { sender: 'bot', text: L(BOT.submitted[uiOf(ctx)].replace('{id}', id), uiOf(ctx), BOT.submitted.en.replace('{id}', id)) });
  db.grievances.unshift(g);
  if (opts.asset_id) db.assets.find((a) => a.id === opts.asset_id)?.open_grievance_ids.push(id);
  let guest_pin: string | undefined;
  if (ctx.user) db.owners[id] = ctx.user.id;
  if (!ctx.user || ctx.user.role === 'guest') guest_pin = pinFor(id);
  pushLiveEvent('grievance_created', audienceForDept(g.category), id);
  pushLiveEvent('grievance_created', 'role:admin', id);
  pushLiveEvent('grievance_created', 'public', id);
  if (ctx.user) notify(ctx.user.id, { grievance_id: id, type: 'status', title: g.title, body: L(BOT.submitted[uiOf(ctx)].replace('{id}', id), uiOf(ctx)) });
  return { grievance: g, guest_pin };
}

const uiOf = (ctx: MockCtx): DeepLang => (B(ctx).ui_lang as DeepLang) ?? ctx.user?.preferred_language ?? 'en';

const BOT = {
  greet: {
    en: 'Tell me what the problem is. You can type or speak in any language.',
    te: 'సమస్య ఏమిటో చెప్పండి. మీరు ఏ భాషలోనైనా టైప్ చేయవచ్చు లేదా మాట్లాడవచ్చు.',
    hi: 'समस्या बताइए। आप किसी भी भाषा में लिख या बोल सकते हैं।',
    ur: 'مسئلہ بتائیں۔ آپ کسی بھی زبان میں لکھ یا بول سکتے ہیں۔',
  },
  confirm: {
    en: 'Here is your complaint. Please check it and confirm.',
    te: 'ఇది మీ ఫిర్యాదు. దయచేసి పరిశీలించి నిర్ధారించండి.',
    hi: 'यह आपकी शिकायत है। कृपया जाँच कर पुष्टि करें।',
    ur: 'یہ آپ کی شکایت ہے۔ براہ کرم جانچ کر تصدیق کریں۔',
  },
  duplicates: {
    en: 'People nearby have already reported something similar. You can add your support or file a new complaint.',
    te: 'దగ్గరలో ఇతరులు ఇలాంటి సమస్యను ఇప్పటికే నివేదించారు. మీరు మద్దతు తెలపవచ్చు లేదా కొత్త ఫిర్యాదు చేయవచ్చు.',
    hi: 'आस-पास के लोगों ने ऐसी ही शिकायत पहले ही की है। आप समर्थन जोड़ सकते हैं या नई शिकायत कर सकते हैं।',
    ur: 'قریب کے لوگوں نے پہلے ہی ایسی شکایت کی ہے۔ آپ حمایت شامل کر سکتے ہیں یا نئی شکایت درج کر سکتے ہیں۔',
  },
  submitted: {
    en: 'Your complaint {id} is registered. We will keep you updated.',
    te: 'మీ ఫిర్యాదు {id} నమోదైంది. మేము మీకు సమాచారం ఇస్తూ ఉంటాము.',
    hi: 'आपकी शिकायत {id} दर्ज हो गई है। हम आपको अपडेट देते रहेंगे।',
    ur: 'آپ کی شکایت {id} درج ہو گئی ہے۔ ہم آپ کو اطلاع دیتے رہیں گے۔',
  },
  supported: {
    en: 'Thank you. Your support has been added to the existing complaint.',
    te: 'ధన్యవాదాలు. మీ మద్దతు ఇప్పటికే ఉన్న ఫిర్యాదుకు జోడించబడింది.',
    hi: 'धन्यवाद। आपका समर्थन मौजूदा शिकायत में जोड़ दिया गया है।',
    ur: 'شکریہ۔ آپ کی حمایت موجودہ شکایت میں شامل کر دی گئی ہے۔',
  },
  emergency: {
    en: 'This sounds like an emergency. Please call the numbers below now. You can still register the complaint after.',
    te: 'ఇది అత్యవసర పరిస్థితిలా ఉంది. దయచేసి వెంటనే కింది నంబర్లకు కాల్ చేయండి. ఆ తర్వాత ఫిర్యాదు నమోదు చేయవచ్చు.',
    hi: 'यह आपात स्थिति लगती है। कृपया अभी नीचे दिए नंबरों पर कॉल करें। इसके बाद भी आप शिकायत दर्ज कर सकते हैं।',
    ur: 'یہ ہنگامی صورتحال لگتی ہے۔ براہ کرم ابھی نیچے دیے گئے نمبروں پر کال کریں۔ اس کے بعد بھی آپ شکایت درج کر سکتے ہیں۔',
  },
  cancelled: {
    en: 'Okay, I have cancelled this complaint.',
    te: 'సరే, ఈ ఫిర్యాదును రద్దు చేశాను.',
    hi: 'ठीक है, मैंने यह शिकायत रद्द कर दी है।',
    ur: 'ٹھیک ہے، میں نے یہ شکایت منسوخ کر دی ہے۔',
  },
  track: {
    en: 'Here is the latest status of your complaint.',
    te: 'మీ ఫిర్యాదు తాజా స్థితి ఇది.',
    hi: 'आपकी शिकायत की ताज़ा स्थिति यह है।',
    ur: 'آپ کی شکایت کی تازہ صورتحال یہ ہے۔',
  },
  info: {
    en: 'You can report any civic problem here: roads, water, garbage, streetlights, power, drains and more. Each complaint gets a ticket and a deadline.',
    te: 'ఇక్కడ మీరు ఏ పౌర సమస్యనైనా నివేదించవచ్చు: రోడ్లు, నీరు, చెత్త, వీధి దీపాలు, కరెంటు, డ్రైనేజీ మరియు మరిన్ని. ప్రతి ఫిర్యాదుకు టికెట్ మరియు గడువు ఉంటుంది.',
    hi: 'यहाँ आप कोई भी नागरिक समस्या दर्ज कर सकते हैं: सड़क, पानी, कचरा, स्ट्रीट लाइट, बिजली, नाली और बहुत कुछ। हर शिकायत को टिकट और समय-सीमा मिलती है।',
    ur: 'یہاں آپ کوئی بھی شہری مسئلہ درج کر سکتے ہیں: سڑک، پانی، کچرا، اسٹریٹ لائٹ، بجلی، نالی اور بہت کچھ۔ ہر شکایت کو ٹکٹ اور مدت ملتی ہے۔',
  },
} satisfies Record<string, Record<DeepLang, string>>;

const QUICK = {
  confirm: { en: ['Confirm', 'Edit', 'Cancel'], te: ['నిర్ధారించు', 'మార్చు', 'రద్దు'], hi: ['पुष्टि करें', 'बदलें', 'रद्द करें'], ur: ['تصدیق کریں', 'ترمیم', 'منسوخ'] },
  dup: { en: ['Add my support', 'File new anyway'], te: ['నా మద్దతు జోడించు', 'కొత్తది నమోదు చేయి'], hi: ['मेरा समर्थन जोड़ें', 'फिर भी नई दर्ज करें'], ur: ['میری حمایت شامل کریں', 'پھر بھی نئی درج کریں'] },
  emergency: { en: ['Continue to register'], te: ['ఫిర్యాదు నమోదు కొనసాగించు'], hi: ['शिकायत दर्ज करना जारी रखें'], ur: ['شکایت درج کرنا جاری رکھیں'] },
};

function chatTurn(ctx: MockCtx): ChatTurnResponse {
  const db = getDb();
  const req = B(ctx) as ChatTurnRequest;
  const ui = req.ui_lang ?? 'en';
  let s: ChatSession | undefined = req.session_id ? db.sessions[req.session_id] : undefined;
  if (!s) {
    s = { id: `CS-${Object.keys(db.sessions).length + 1}-${rng.int(1000, 9999)}`, user_id: ctx.user?.id ?? 'anon', stage: 'collecting', lang: ui, ui_lang: ui, text: '', fields: {}, asked: [], emergency_acked: false, media_ids: [], duplicates_shown: false };
    db.sessions[s.id] = s;
  }
  s.ui_lang = ui;
  if (req.location) s.location = req.location;
  if (req.media_ids?.length) s.media_ids = [...new Set([...s.media_ids, ...req.media_ids])];
  if (req.asset_id) s.asset_id = req.asset_id;
  const base = (over: Partial<ChatTurnResponse>): ChatTurnResponse => ({
    session_id: s!.id,
    intent: 'new_complaint',
    stage: s!.stage,
    detected_language: s!.lang,
    is_code_mixed: detectLang(s!.text || req.text || '').mixed,
    reply: L(BOT.greet[ui], ui, BOT.greet.en),
    quick_replies: [],
    missing_fields: s!.draft?.missing_fields ?? [],
    draft: s!.draft,
    ...over,
  });
  const qr = (labels: string[], values: string[]) => labels.map((label, i) => ({ label, value: values[i] }));
  const confirmStage = () => {
    s!.stage = 'confirming';
    return base({ stage: 'confirming', reply: L(BOT.confirm[ui], ui, BOT.confirm.en), quick_replies: qr(QUICK.confirm[ui], ['confirm', 'edit', 'cancel']), missing_fields: [] });
  };
  const submit = () => {
    const { grievance, guest_pin } = createFromDraft(ctx, s!.draft!, { location: s!.location, media_ids: s!.media_ids, asset_id: s!.asset_id, is_anonymous: req.submit_options?.is_anonymous, is_private: req.submit_options?.is_private });
    s!.stage = 'submitted';
    return base({ stage: 'submitted', reply: L(BOT.submitted[ui].replace('{id}', grievance.id), ui, BOT.submitted.en.replace('{id}', grievance.id)), submitted: [{ grievance_id: grievance.id, guest_pin }] });
  };

  // ---- actions
  switch (req.action) {
    case 'cancel':
      s.stage = 'answered';
      s.draft = undefined;
      return base({ stage: 'answered', intent: 'smalltalk', reply: L(BOT.cancelled[ui], ui, BOT.cancelled.en), draft: undefined });
    case 'edit': {
      const fields = (req.action_payload?.fields as Record<string, string>) ?? {};
      const text = (req.action_payload?.text as string) ?? s.text;
      s.text = text;
      s.fields = { ...s.fields, ...fields };
      s.draft = analyze(s.text, ui, { location: s.location, media_ids: s.media_ids, fields: s.fields, asset_id: s.asset_id, draft_id: s.draft?.draft_id });
      return confirmStage();
    }
    case 'continue_after_emergency':
      s.emergency_acked = true;
      if (!s.draft) s.draft = analyze(s.text, ui, { location: s.location, media_ids: s.media_ids, fields: s.fields, asset_id: s.asset_id });
      return confirmStage();
    case 'support_existing': {
      const target = (req.action_payload?.grievance_id as string) ?? (req.action_payload?.incident_id as string);
      const res = support(ctx, target);
      s.stage = 'submitted';
      return base({ stage: 'submitted', reply: L(BOT.supported[ui], ui, BOT.supported.en), submitted: [{ grievance_id: res.grievance_id }] });
    }
    case 'file_new_anyway':
      return submit();
    case 'split_confirm':
    case 'confirm': {
      if (!s.draft) break;
      if (!s.duplicates_shown) {
        s.duplicates_shown = true;
        const dups = duplicatesFor(s.text, s.location ?? s.draft.location, s.draft.category);
        if (dups.length) {
          s.stage = 'duplicate_check';
          return base({ stage: 'duplicate_check', reply: L(BOT.duplicates[ui], ui, BOT.duplicates.en), duplicates: dups, quick_replies: qr(QUICK.dup[ui], ['support_existing', 'file_new_anyway']) });
        }
      }
      return submit();
    }
  }

  // ---- free text
  const text = (req.text ?? '').trim();
  if (!text) return base({});
  const ticket = text.match(/GRV-\d{4}-\d{6}/i);
  if (ticket) {
    const g = findGrievance(ticket[0].toUpperCase());
    s.stage = 'answered';
    return base({ intent: 'track_status', stage: 'answered', reply: L(BOT.track[ui], ui, BOT.track.en), tracked: g ? [strip(refresh(g))] : [] });
  }
  const det = detectLang(text, req.lang_hint);
  if (s.stage === 'collecting' && s.draft && s.draft.missing_fields.length) {
    // Answer to the previous question fills the first missing field.
    s.fields[s.draft.missing_fields[0]] = text;
  } else {
    s.text = s.text ? `${s.text} ${text}` : text;
    s.lang = det.lang;
  }
  const em = scanEmergency(s.text);
  if (em.terms.length && !s.emergency_acked) {
    s.stage = 'emergency';
    s.draft = analyze(s.text, ui, { location: s.location, media_ids: s.media_ids, fields: s.fields, asset_id: s.asset_id });
    return base({ intent: 'emergency', stage: 'emergency', detected_language: det.lang, emergency: emergencyInfo(em.terms, ui), reply: L(BOT.emergency[ui], ui, BOT.emergency.en), quick_replies: qr(QUICK.emergency[ui], ['continue_after_emergency']) });
  }
  if (/\?$|^(how|what|when|where|why)\b/i.test(text) && classify(text).dept === 'other') {
    s.stage = 'answered';
    return base({ intent: 'ask_info', stage: 'answered', reply: L(BOT.info[ui], ui, BOT.info.en) });
  }
  s.draft = analyze(s.text, ui, { location: s.location, media_ids: s.media_ids, fields: s.fields, asset_id: s.asset_id, draft_id: s.draft?.draft_id });
  const next = s.draft.missing_fields.find((k) => !s!.asked.includes(k));
  // The mock asks at most two follow-up questions, then moves to confirmation.
  if (next && s.asked.length < 2) {
    s.asked.push(next);
    s.stage = 'collecting';
    const q = deptById(s.draft.category).required_fields.find((f) => f.key === next)!;
    return base({ stage: 'collecting', detected_language: det.lang, reply: L(q.question[ui], ui, q.question.en), missing_fields: s.draft.missing_fields });
  }
  return confirmStage();
}

// ---------------------------------------------------------------- grievance actions

function support(ctx: MockCtx, id: string) {
  const db = getDb();
  const inc = db.incidents.find((i) => i.id === id);
  const g = inc ? findGrievance(inc.grievance_ids[0]) : findGrievance(id);
  if (!g) throw new MockHttpError(404, 'not_found', `${id} not found`);
  g.support_count += 1;
  const incident = g.incident_id ? db.incidents.find((i) => i.id === g.incident_id) : undefined;
  if (incident) incident.support_count += 1;
  pushEvent(g, 'support_added', ctx.user?.role === 'guest' ? 'guest' : 'citizen', `Support added (${incident?.support_count ?? g.support_count} total)`);
  const pr = computePriority({ urgency: g.priority, hazards: g.hazards, emergency: g.is_emergency, distress: g.distress_score, vulnerable: g.vulnerable, supporters: incident?.support_count ?? g.support_count });
  if (pr.score > g.priority_score) {
    g.priority_score = pr.score;
    g.priority = pr.level;
    g.priority_factors = pr.factors;
  }
  touch(g);
  return { support_count: incident?.support_count ?? g.support_count, incident_id: g.incident_id, grievance_id: g.id };
}

function feedback(ctx: MockCtx) {
  const g = requireOwner(ctx, ctx.params.id);
  const b = B(ctx);
  if (g.status !== 'resolved_pending_verification') throw new MockHttpError(409, 'invalid_state', 'Complaint is not awaiting verification');
  if (b.accepted) {
    g.status = 'closed';
    g.closure_type = 'citizen_verified';
    g.rating = b.rating;
    g.feedback_comment = b.comment;
    g.closed_at = nowIso();
    pushEvent(g, 'citizen_verified', 'citizen', `Citizen confirmed the fix${b.rating ? ` · rated ${b.rating}/5` : ''}`);
    pushEvent(g, 'closed', 'system', 'Closed — citizen verified');
  } else {
    g.status = 'reopened';
    g.reopen_count += 1;
    pushEvent(g, 'citizen_rejected', 'citizen', b.comment ? `Citizen says not fixed: ${b.comment}` : 'Citizen says the issue is not fixed');
    pushEvent(g, 'reopened', 'citizen', `Reopened (${g.reopen_count})`);
  }
  touch(g);
  return viewFor(ctx, g);
}

function reopen(ctx: MockCtx) {
  const g = requireOwner(ctx, ctx.params.id);
  if (!['resolved_pending_verification', 'closed'].includes(g.status)) throw new MockHttpError(409, 'invalid_state', 'Only resolved or closed complaints can be reopened');
  g.status = 'reopened';
  g.reopen_count += 1;
  g.closed_at = undefined;
  g.closure_type = null;
  pushEvent(g, 'reopened', 'citizen', `Reopened: ${B(ctx).reason ?? 'not fixed'}`);
  touch(g);
  return viewFor(ctx, g);
}

function appeal(ctx: MockCtx): Appeal {
  const g = requireOwner(ctx, ctx.params.id);
  const reason = String(B(ctx).reason ?? '');
  const det = detectLang(reason);
  g.appeal = { id: `AP-${g.id.slice(-6)}`, grievance_id: g.id, reason: L(reason, det.lang, det.lang === 'en' ? reason : `[Mock translation] ${reason}`), status: 'filed', created_at: nowIso() };
  pushEvent(g, 'appeal_filed', 'citizen', 'Appeal filed');
  touch(g);
  return g.appeal;
}

function citizenMessage(ctx: MockCtx): Message {
  const g = requireOwner(ctx, ctx.params.id);
  const text = String(B(ctx).text ?? '');
  const det = detectLang(text);
  const msg = addMessage(g, { sender: 'citizen', sender_name: g.citizen_display_name, text: L(text, det.lang, det.lang === 'en' ? text : `[Mock translation] ${text}`) });
  pushEvent(g, 'message', 'citizen', 'Citizen sent a message');
  touch(g);
  return msg;
}

function upload(ctx: MockCtx): Media {
  const db = getDb();
  const body = ctx.body;
  let url = mockImage('Uploaded photo', '#22D3C5');
  let purpose: Media['purpose'] = 'evidence';
  let lat: number | undefined;
  let lng: number | undefined;
  let uploaded_by: Media['uploaded_by'] = 'citizen';
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const file = body.get('file');
    if (file && typeof file !== 'string' && typeof URL !== 'undefined' && 'createObjectURL' in URL) url = URL.createObjectURL(file);
    purpose = (body.get('purpose') as Media['purpose']) ?? purpose;
    lat = body.get('lat') ? Number(body.get('lat')) : undefined;
    lng = body.get('lng') ? Number(body.get('lng')) : undefined;
  }
  if (isGov(ctx.user)) uploaded_by = 'officer';
  const m: Media = {
    id: `M-UP-${Object.keys(db.media).length + 1}`,
    url,
    kind: 'image',
    uploaded_by,
    purpose,
    quality: { ok: true, issue: 'none' },
    ai: { description_en: 'Photo uploaded by the user (mock analysis)', matches_text: true },
    geo: lat != null && lng != null ? { lat, lng } : undefined,
    created_at: nowIso(),
  };
  db.media[m.id] = m;
  return m;
}

// ---------------------------------------------------------------- officer

function inboxSort(a: GrievanceDetail, b: GrievanceDetail) {
  const em = Number(b.is_emergency && isOpen(b.status)) - Number(a.is_emergency && isOpen(a.status));
  if (em) return em;
  const co = Number(b.priority === 'critical' && b.sla.breached) - Number(a.priority === 'critical' && a.sla.breached);
  if (co) return co;
  if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
  return a.sla.remaining_minutes - b.sla.remaining_minutes;
}

function filterList(list: GrievanceDetail[], q: URLSearchParams) {
  const status = q.get('status');
  const priority = q.get('priority');
  const category = q.get('category');
  const ward = q.get('ward');
  const text = q.get('q')?.toLowerCase();
  const overdue = q.get('overdue') === 'true';
  return list.filter(
    (g) =>
      (!status || status.split(',').includes(g.status)) &&
      (!priority || priority.split(',').includes(g.priority)) &&
      (!category || category.split(',').includes(g.category)) &&
      (!ward || g.location.ward_id === ward || g.location.zone === ward) &&
      (!overdue || g.sla.breached) &&
      (!text || g.id.toLowerCase().includes(text) || g.title.en.toLowerCase().includes(text) || g.title.original.toLowerCase().includes(text) || g.summary_en.toLowerCase().includes(text)),
  );
}

function setStatus(ctx: MockCtx) {
  const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
  const g = getG(ctx.params.id);
  const b = B(ctx);
  const status = b.status as Status;
  g.status = status;
  if (status === 'rejected') {
    g.closure_type = 'rejected';
    g.closed_at = nowIso();
  }
  if (b.delay_reason) g.sla.delay_reason = L(String(b.delay_reason), 'en');
  pushEvent(g, 'status_changed', u.role, `Status changed to ${status.replace(/_/g, ' ')}${b.note ? ` — ${b.note}` : ''}`, { actor_name: u.name, payload: { status } });
  const owner = getDb().owners[g.id];
  if (owner) notify(owner, { grievance_id: g.id, type: 'status', title: g.title, body: L(`Status: ${status.replace(/_/g, ' ')}`, 'en') });
  touch(g);
  return g;
}

function brief(ctx: MockCtx): OfficerBrief {
  requireRole(ctx, ['officer', 'supervisor', 'admin']);
  const g = getG(ctx.params.id);
  const d = deptById(g.category);
  const similar = getDb().grievances.filter((x) => x.category === g.category && x.status === 'closed' && x.id !== g.id).slice(0, 2);
  const missing = d.required_fields.filter((f) => !g.summary_en.toLowerCase().includes(f.key.split('_')[0])).slice(0, 2);
  return {
    situation: `${g.summary_en} Reported in ${g.location.ward_name ?? 'unknown ward'} (${g.location.zone ?? '—'}), ${g.support_count} supporters.`,
    evidence: [g.media.length ? `${g.media.length} photo(s) attached` : 'No photos attached', `Location source: ${g.location.source}`],
    risks: g.hazards.length ? g.hazards.map((h) => h.replace(/_/g, ' ')) : ['No safety hazards detected'],
    suggested_next_steps: ['Acknowledge the citizen', `Schedule a site visit (${d.agency_en})`, 'Upload a resolution photo from the same spot'],
    missing_info: missing.map((f) => `Ask the citizen: ${f.question.en}`),
    similar_resolved: similar.map((x) => ({ grievance_id: x.id, title_en: x.title.en, resolution_note: 'Repaired by field team within SLA.' })),
    generated_by: 'fallback',
    created_at: nowIso(),
  };
}

const REPLY_EN: Record<ReplyIntent, string> = {
  acknowledge: 'Thank you for reporting this. We have received your complaint and our team will look into it.',
  request_info: 'Could you please share a nearby landmark or a photo so we can locate the issue faster?',
  schedule_visit: 'Our field team will visit the location tomorrow between 10 AM and 1 PM.',
  work_started: 'Work has started on your complaint. We will update you once it is complete.',
  resolved: 'The issue has been resolved. Please check and confirm whether it is fixed.',
  delay_update: 'We are sorry for the delay. Materials are awaited and work will resume within two days.',
  transfer: 'Your complaint has been transferred to the correct department for faster action.',
};

function draftReply(ctx: MockCtx): DraftReply {
  requireRole(ctx, ['officer', 'supervisor', 'admin']);
  const g = getG(ctx.params.id);
  const intent = (B(ctx).intent ?? 'acknowledge') as ReplyIntent;
  const en = `${REPLY_EN[intent]}${B(ctx).extra_en ? ` ${B(ctx).extra_en}` : ''}`;
  return { intent, draft_en: en, draft_citizen: L(g.language === 'en' ? en : `[Mock translation → ${g.language}] ${en}`, g.language, en) };
}

function officerMessage(ctx: MockCtx): Message {
  const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
  const g = getG(ctx.params.id);
  const en = String(B(ctx).text_en ?? '');
  const known = Object.values(REPLY_EN).includes(en);
  const original = g.language === 'en' ? en : known && g.language === 'te' ? 'మీ ఫిర్యాదుపై పని జరుగుతోంది. త్వరలో సమాచారం ఇస్తాము.' : `[Mock translation → ${g.language}] ${en}`;
  const msg = addMessage(g, { sender: 'officer', sender_name: u.name, text: L(original, g.language, en) });
  pushEvent(g, 'message', u.role, 'Officer replied to the citizen', { actor_name: u.name });
  const owner = getDb().owners[g.id];
  if (owner) notify(owner, { grievance_id: g.id, type: 'message', title: g.title, body: msg.text });
  touch(g);
  return msg;
}

function resolve(ctx: MockCtx) {
  const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
  const g = getG(ctx.params.id);
  const b = B(ctx);
  const db = getDb();
  const proofs = ((b.media_ids as string[]) ?? []).map((id) => db.media[id]).filter(Boolean) as Media[];
  for (const p of proofs) g.media.push({ ...p, purpose: 'resolution_proof', uploaded_by: 'officer' });
  const evidence = g.media.find((m) => m.purpose === 'evidence');
  const dup = !!evidence && proofs.some((p) => p.url === evidence.url);
  const dist = b.lat != null && b.lng != null ? distanceM(g.location, { lat: b.lat, lng: b.lng }) : null;
  g.status = 'resolved_pending_verification';
  g.resolved_at = nowIso();
  pushEvent(g, 'resolution_submitted', u.role, `Resolution submitted: ${b.note ?? ''}`.trim(), { actor_name: u.name });
  g.ai_verification = verification(dup, nowIso());
  if (!dup && dist != null) g.ai_verification.checks.distance_m = dist;
  pushEvent(g, 'ai_verification', 'ai', `AI verification: ${g.ai_verification.verdict}`);
  const owner = db.owners[g.id];
  if (owner) notify(owner, { grievance_id: g.id, type: 'verification_request', title: g.title, body: L('Please confirm whether the issue is fixed.', 'en') });
  touch(g);
  return g;
}

// ---------------------------------------------------------------- analytics

function inWindow(q: URLSearchParams) {
  const days = Number(q.get('days') ?? 30);
  const from = nowMs() - days * DAY;
  return getDb().grievances.filter((g) => Date.parse(g.created_at) >= from);
}
const resolutionHours = (g: GrievanceDetail) => (g.resolved_at ? (Date.parse(g.resolved_at) - Date.parse(g.created_at)) / HOUR : null);
const avg = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : 0);

function kpis(ctx: MockCtx): KPIs {
  const list = inWindow(ctx.query).map(refresh);
  const res = list.filter((g) => g.status === 'closed');
  const rh = list.map(resolutionHours).filter((x): x is number => x != null);
  const rated = list.filter((g) => g.rating).map((g) => g.rating!);
  const withinSla = res.filter((g) => (resolutionHours(g) ?? 0) <= g.sla.hours).length;
  return {
    total: list.length,
    open: list.filter((g) => isOpen(g.status)).length,
    resolved: res.length,
    overdue: list.filter((g) => isOpen(g.status) && g.sla.breached).length,
    critical_open: list.filter((g) => isOpen(g.status) && g.priority === 'critical').length,
    avg_resolution_hours: avg(rh),
    avg_first_response_hours: 3.4,
    sla_compliance_pct: res.length ? Math.round((withinSla / res.length) * 1000) / 10 : 100,
    satisfaction_avg: avg(rated),
    reopened_pct: list.length ? Math.round((list.filter((g) => g.reopen_count > 0).length / list.length) * 1000) / 10 : 0,
    needs_review: list.filter((g) => g.status === 'needs_review').length,
    deltas: { total: 12, open: -4, resolved: 9, overdue: -2, sla_compliance_pct: 3.1, avg_resolution_hours: -5.2 },
  };
}

function perf(ctx: MockCtx): DepartmentPerformance[] {
  const list = inWindow(ctx.query).map(refresh);
  const rows = DEPARTMENTS.filter((d) => d.id !== 'other').map((d) => {
    const mine = list.filter((g) => g.category === d.id);
    const closed = mine.filter((g) => g.status === 'closed');
    const rh = mine.map(resolutionHours).filter((x): x is number => x != null);
    const within = closed.filter((g) => (resolutionHours(g) ?? 0) <= g.sla.hours).length;
    const sla = closed.length ? (within / closed.length) * 100 : 100;
    const sat = avg(mine.filter((g) => g.rating).map((g) => g.rating!));
    const reopen = mine.length ? mine.filter((g) => g.reopen_count > 0).length / mine.length : 0;
    const score = Math.round(sla * 0.5 + (sat / 5) * 100 * 0.3 + (1 - reopen) * 100 * 0.2);
    return { department_id: d.id, total: mine.length, open: mine.filter((g) => isOpen(g.status)).length, resolved: closed.length, overdue: mine.filter((g) => isOpen(g.status) && g.sla.breached).length, avg_resolution_hours: avg(rh), sla_compliance_pct: Math.round(sla * 10) / 10, satisfaction_avg: sat, reopen_rate: Math.round(reopen * 1000) / 1000, score, rank: 0 };
  });
  rows.sort((a, b) => b.score - a.score).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function trends(ctx: MockCtx): TrendPoint[] {
  const days = Number(ctx.query.get('days') ?? 30);
  const group = ctx.query.get('group') === 'week' ? 7 : 1;
  const r = createRng(99);
  const out: TrendPoint[] = [];
  const list = getDb().grievances;
  for (let i = days - 1; i >= 0; i -= group) {
    const start = nowMs() - (i + 1) * DAY;
    const end = start + group * DAY;
    const created = list.filter((g) => Date.parse(g.created_at) >= start && Date.parse(g.created_at) < end);
    const resolved = list.filter((g) => g.resolved_at && Date.parse(g.resolved_at) >= start && Date.parse(g.resolved_at) < end);
    const by: Partial<Record<DepartmentId, number>> = {};
    for (const g of created) by[g.category] = (by[g.category] ?? 0) + 1;
    // Mock baseline traffic on top of seeded grievances so charts look alive.
    const baseline = r.int(8, 16) * group;
    out.push({ date: iso(start).slice(0, 10), created: created.length + baseline, resolved: resolved.length + Math.round(baseline * 0.85), by_category: by });
  }
  return out;
}

function breakdown(ctx: MockCtx): BreakdownRow[] {
  const by = ctx.query.get('by') ?? 'category';
  const list = inWindow(ctx.query).map(refresh);
  const keyOf = (g: GrievanceDetail) => (by === 'ward' ? g.location.ward_id ?? '—' : by === 'zone' ? g.location.zone ?? '—' : g.category);
  const labelOf = (k: string) => (by === 'ward' ? wardById(k)?.name ?? k : by === 'zone' ? k : deptById(k as DepartmentId).name.en);
  const groups = new Map<string, GrievanceDetail[]>();
  for (const g of list) groups.set(keyOf(g), [...(groups.get(keyOf(g)) ?? []), g]);
  return [...groups.entries()]
    .map(([key, gs]) => ({ key, label: labelOf(key), total: gs.length, open: gs.filter((g) => isOpen(g.status)).length, overdue: gs.filter((g) => isOpen(g.status) && g.sla.breached).length, avg_resolution_hours: avg(gs.map(resolutionHours).filter((x): x is number => x != null)) }))
    .sort((a, b) => b.total - a.total);
}

function mapPoints(ctx: MockCtx, pub: boolean): MapPoint[] {
  const q = ctx.query;
  const days = Number(q.get('days') ?? 90);
  const from = nowMs() - days * DAY;
  const r = createRng(4242);
  return getDb()
    .grievances.filter((g) => Date.parse(g.created_at) >= from && !g.is_private)
    .filter((g) => (!q.get('category') || g.category === q.get('category')) && (!q.get('status') || g.status === q.get('status')) && (!q.get('priority') || g.priority === q.get('priority')))
    .map((g) => {
      const p = pub ? r.jitter(g.location.lat, g.location.lng, 75) : { lat: g.location.lat, lng: g.location.lng };
      return pub
        ? { lat: p.lat, lng: p.lng, category: g.category, priority: g.priority, status: g.status, incident_id: g.incident_id }
        : { id: g.id, lat: p.lat, lng: p.lng, category: g.category, priority: g.priority, status: g.status, incident_id: g.incident_id };
    });
}

function publicStats(): PublicStats {
  const list = getDb().grievances;
  const resolved = list.filter((g) => g.status === 'closed');
  const rh = list.map(resolutionHours).filter((x): x is number => x != null);
  const zones = [...new Set(WARDS.map((w) => w.zone))];
  return {
    total: list.length,
    resolved: resolved.length,
    resolution_rate_pct: Math.round((resolved.length / Math.max(1, list.length)) * 1000) / 10,
    avg_resolution_hours: avg(rh),
    by_department: DEPARTMENTS.filter((d) => d.id !== 'other').map((d) => {
      const mine = list.filter((g) => g.category === d.id);
      return { department_id: d.id, total: mine.length, resolved_pct: Math.round((mine.filter((g) => g.status === 'closed').length / Math.max(1, mine.length)) * 100), avg_resolution_hours: avg(mine.map(resolutionHours).filter((x): x is number => x != null)) };
    }),
    by_zone: zones.map((z) => {
      const mine = list.filter((g) => g.location.zone === z);
      return { zone: z, total: mine.length, resolved_pct: Math.round((mine.filter((g) => g.status === 'closed').length / Math.max(1, mine.length)) * 100) };
    }),
    trend: trends({ query: new URLSearchParams('days=30&group=week') } as MockCtx),
    recent_resolved: resolved.slice(0, 6).map((g) => ({
      title_en: g.title.en,
      category: g.category,
      zone: g.location.zone ?? '',
      before_url: g.media.find((m) => m.purpose === 'evidence')?.url,
      after_url: g.media.find((m) => m.purpose === 'resolution_proof')?.url,
      resolved_at: g.resolved_at ?? g.updated_at,
    })),
  };
}

function workload(ctx: MockCtx): OfficerWorkload[] {
  const dept = ctx.query.get('department');
  const list = getDb().grievances.map(refresh);
  return OFFICERS.filter((o) => !dept || o.department_id === dept).map((o) => {
    const mine = list.filter((g) => g.assigned_officer?.id === o.id);
    const open = mine.filter((g) => isOpen(g.status));
    return {
      officer: { ...o, open_cases: open.length, overdue_cases: open.filter((g) => g.sla.breached).length },
      open: open.length,
      critical: open.filter((g) => g.priority === 'critical').length,
      overdue: open.filter((g) => g.sla.breached).length,
      resolved_7d: mine.filter((g) => g.resolved_at && Date.parse(g.resolved_at) > nowMs() - 7 * DAY).length,
    };
  });
}

function insights(ctx: MockCtx): InsightSummary {
  const k = kpis(ctx);
  const p = perf(ctx);
  return {
    bullets_en: [
      `${k.open} complaints are open, ${k.overdue} of them past their SLA.`,
      `Contaminated-water complaints spiked in Charminar over the last 48 hours, mostly in Urdu and Hindi.`,
      `${deptById(p[0].department_id).name.en} leads on performance (score ${p[0].score}); ${deptById(p[p.length - 1].department_id).name.en} trails (score ${p[p.length - 1].score}).`,
      `${k.needs_review} complaints are waiting for a routing decision.`,
    ],
    generated_by: 'template',
    numbers_verified: true,
    created_at: nowIso(),
  };
}

function auditList(ctx: MockCtx): Paged<TimelineEvent> {
  const gid = ctx.query.get('grievance_id');
  const type = ctx.query.get('type');
  const all = getDb()
    .grievances.filter((g) => !gid || g.id === gid)
    .flatMap((g) => g.timeline)
    .filter((e) => !type || e.type === type)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return paged(all, ctx.query);
}

function auditVerify(ctx: MockCtx): AuditVerification {
  const gid = ctx.query.get('grievance_id') ?? undefined;
  const gs = getDb().grievances.filter((g) => !gid || g.id === gid);
  let checked = 0;
  for (const g of gs) {
    let prev: string | null = null;
    for (const e of g.timeline) {
      checked++;
      if (e.prev_hash !== prev || e.hash !== eventHash(prev, e)) return { grievance_id: gid, events_checked: checked, valid: false, first_broken_event_id: e.id };
      prev = e.hash;
    }
  }
  return { grievance_id: gid, events_checked: checked, valid: true };
}

function retrain(): AIMetrics {
  const db = getDb();
  const m = db.ai_metrics;
  const v = Number(m.model_version.replace(/\D/g, '')) + 1;
  const acc = Math.min(0.97, +(m.accuracy + 0.006).toFixed(3));
  const f1 = Math.min(0.96, +(m.macro_f1 + 0.007).toFixed(3));
  db.ai_metrics = {
    ...m,
    model_version: `clf-v${v}`,
    trained_at: nowIso(),
    accuracy: acc,
    macro_f1: f1,
    history: [...m.history, { model_version: `clf-v${v}`, accuracy: acc, macro_f1: f1, trained_at: nowIso(), corrections_used: m.history[m.history.length - 1].corrections_used + db.routing_corrections }],
  };
  db.routing_corrections = 0;
  return db.ai_metrics;
}

function clock(ctx: MockCtx): DemoClock {
  const db = getDb();
  if (ctx.method === 'POST') {
    requireRole(ctx, ['admin']);
    db.clock_offset_minutes += Math.round(Number(B(ctx).advance_hours ?? 0) * 60);
    for (const g of db.grievances) refresh(g);
  }
  return { now: nowIso(), offset_minutes: db.clock_offset_minutes };
}

// ---------------------------------------------------------------- guide

const GUIDE = [
  { title: 'Roads & potholes', anchor: 'roads', snippet: 'Report potholes, damaged roads and footpaths. Include a landmark and a photo. Typical SLA: 48–96 hours.' },
  { title: 'Water supply', anchor: 'water', snippet: 'No supply, leaks, low pressure or dirty water. Contaminated water is treated as high priority.' },
  { title: 'Garbage & sanitation', anchor: 'sanitation', snippet: 'Missed pickups, overflowing bins, dead animals. Typical SLA: 48 hours.' },
  { title: 'Streetlights', anchor: 'streetlights', snippet: 'Lights not working or burning in daytime. The pole number helps the team find it.' },
  { title: 'Emergencies', anchor: 'emergencies', snippet: 'For fire, live wires, gas leaks or collapse, call 112 first. You can still register a complaint after.' },
  { title: 'Appeals', anchor: 'appeals', snippet: 'If you are not satisfied with a closure, you can reject it and file an appeal. A supervisor reviews every appeal.' },
  { title: 'Privacy & anonymous reporting', anchor: 'privacy', snippet: 'You can report anonymously or privately. Public maps never show your name, text or exact location.' },
  { title: 'How verification works', anchor: 'verification', snippet: 'When an officer marks a complaint resolved, AI checks the proof photo and you confirm whether it is really fixed.' },
];

// ---------------------------------------------------------------- the table (#1–#57)

export const handlers: MockHandler[] = [
  /* 1 */ { method: 'POST', pattern: '/chat/turn', fn: chatTurn },
  /* 2 */ { method: 'POST', pattern: '/grievances/analyze', fn: (ctx) => { const b = B(ctx); return analyze(String(b.text ?? ''), b.ui_lang ?? 'en', { location: b.location, media_ids: b.media_ids }); } },
  /* 3 */ { method: 'POST', pattern: '/grievances', fn: (ctx) => {
    const b = B(ctx);
    const draft = b.draft as GrievanceDraft;
    const dups = duplicatesFor(draft.cleaned_original, b.location ?? draft.location, draft.category);
    const { grievance, guest_pin } = createFromDraft(ctx, draft, { location: b.location, media_ids: b.media_ids, asset_id: b.asset_id, is_anonymous: b.is_anonymous, is_private: b.is_private });
    return { grievance: strip(grievance), guest_pin, duplicates: dups.length ? dups : undefined };
  } },
  /* 4 */ { method: 'POST', pattern: '/grievances/check-duplicates', fn: (ctx) => { const b = B(ctx); return duplicatesFor(String(b.text ?? ''), b.location, b.category); } },
  /* 5 */ { method: 'POST', pattern: '/grievances/:id/support', fn: (ctx) => { const r = support(ctx, ctx.params.id); return { support_count: r.support_count, incident_id: r.incident_id }; } },
  /* 6 */ { method: 'GET', pattern: '/grievances/:id', fn: (ctx) => viewFor(ctx, requireOwner(ctx, ctx.params.id)) },
  /* 7 */ { method: 'GET', pattern: '/me/grievances', fn: (ctx) => {
    const u = requireUser(ctx);
    const db = getDb();
    const mine = db.grievances.filter((g) => db.owners[g.id] === u.id).map(refresh);
    return paged(filterList(mine, ctx.query).map(strip), ctx.query);
  } },
  /* 8 */ { method: 'POST', pattern: '/grievances/:id/feedback', fn: feedback },
  /* 9 */ { method: 'POST', pattern: '/grievances/:id/reopen', fn: reopen },
  /* 10 */ { method: 'POST', pattern: '/grievances/:id/appeal', fn: appeal },
  /* 11 */ { method: 'POST', pattern: '/grievances/:id/messages', fn: citizenMessage },
  /* 12 */ { method: 'POST', pattern: '/uploads', fn: upload },
  /* 13 */ { method: 'POST', pattern: '/speech/transcribe', fn: (ctx) => {
    const lang = (ctx.body instanceof FormData ? (ctx.body.get('language') as string) : undefined) ?? 'te';
    const sample: Record<string, string> = { te: PHRASES[0].text, hi: PHRASES[2].text, ur: PHRASES[5].text, en: PHRASES[3].text };
    return { text: sample[lang.slice(0, 2)] ?? sample.en, language: (lang.slice(0, 2) as Lang) ?? 'te', duration_s: 6.2 };
  } },
  /* 14 */ { method: 'POST', pattern: '/speech/tts', fn: () => { throw new MockHttpError(501, 'not_configured', 'Server TTS is not configured in mock mode'); } },
  /* 15 */ { method: 'POST', pattern: '/translate', fn: (ctx) => {
    const b = B(ctx);
    const det = detectLang(String(b.text ?? ''));
    const known = PHRASES.find((p) => p.text === b.text || p.title === b.text);
    const text = b.target_lang === 'en' ? (known?.text_en ?? (det.lang === 'en' ? b.text : `[Mock translation → en] ${b.text}`)) : det.lang === b.target_lang ? b.text : `[Mock translation → ${b.target_lang}] ${b.text}`;
    return { text, source_lang: det.lang };
  } },
  /* 16 */ { method: 'GET', pattern: '/search', fn: (ctx) => {
    const q = (ctx.query.get('q') ?? '').toLowerCase();
    const scope = ctx.query.get('scope') ?? 'public';
    const db = getDb();
    let pool = db.grievances;
    if (scope === 'mine') pool = pool.filter((g) => ctx.user && db.owners[g.id] === ctx.user.id);
    else if (scope === 'gov') pool = scopeForOfficer(ctx, pool);
    else pool = pool.filter((g) => !g.is_private);
    const grievances = q ? filterList(pool, new URLSearchParams({ q })).slice(0, 20).map(strip) : [];
    const guide = q ? GUIDE.filter((s) => (s.title + s.snippet).toLowerCase().includes(q)) : [];
    return { grievances, guide };
  } },
  /* 17 */ { method: 'POST', pattern: '/guide/ask', fn: (ctx) => {
    const b = B(ctx);
    const question = String(b.question ?? '').toLowerCase();
    const ui = (b.ui_lang ?? 'en') as DeepLang;
    const hit = GUIDE.find((s) => question.includes(s.anchor.replace('_', ' ')) || question.includes(s.title.split(' ')[0].toLowerCase())) ?? GUIDE[0];
    return { answer: L(ui === 'en' ? hit.snippet : `${BOT.info[ui]}`, ui, hit.snippet), sources: [{ title: hit.title, anchor: hit.anchor }], department_id: DEPARTMENTS.some((d) => d.id === hit.anchor) ? hit.anchor : undefined };
  } },
  /* 18 */ { method: 'GET', pattern: '/notifications', fn: (ctx) => { const u = requireUser(ctx); return paged<Notification>(getDb().notifications[u.id] ?? [], ctx.query); } },
  /* 19 */ { method: 'POST', pattern: '/notifications/:id/read', fn: (ctx) => {
    const u = requireUser(ctx);
    for (const n of getDb().notifications[u.id] ?? []) if (ctx.params.id === 'all' || n.id === ctx.params.id) n.read = true;
    return { ok: true };
  } },
  /* 20 */ { method: 'GET', pattern: '/meta/departments', fn: () => DEPARTMENTS },
  /* 21 */ { method: 'GET', pattern: '/meta/wards', fn: () => WARDS },
  /* 22 */ { method: 'GET', pattern: '/meta/wards.geojson', fn: () => wardsGeoJSON() },
  /* 23 */ { method: 'GET', pattern: '/meta/emergency-contacts', fn: () => EMERGENCY_CONTACTS },
  /* 24 */ { method: 'GET', pattern: '/meta/assets/:id', fn: (ctx) => {
    const a = getDb().assets.find((x) => x.id === ctx.params.id);
    if (!a) throw new MockHttpError(404, 'not_found', `Asset ${ctx.params.id} not found`);
    return a;
  } },
  /* 25 */ { method: 'GET', pattern: '/public/stats', fn: publicStats },
  /* 26 */ { method: 'GET', pattern: '/public/map', fn: (ctx) => mapPoints(ctx, true) },
  /* 27 */ { method: 'GET', pattern: '/public/nearby', fn: (ctx) => {
    const lat = Number(ctx.query.get('lat') ?? 17.385);
    const lng = Number(ctx.query.get('lng') ?? 78.4867);
    const radius = Number(ctx.query.get('radius_m') ?? 1500);
    return nearbyOpen({ lat, lng }, radius)
      .filter(({ g }) => !g.is_private)
      .slice(0, 30)
      .map(({ g, d }) => ({ title: g.title, category: g.category, status: g.status, distance_m: d, support_count: g.support_count, grievance_id: g.id }));
  } },
  /* 28 */ { method: 'GET', pattern: '/officer/inbox', fn: (ctx) => {
    requireRole(ctx, ['officer', 'supervisor', 'admin']);
    const scoped = scopeForOfficer(ctx, getDb().grievances.map(refresh));
    const q = ctx.query;
    const list = filterList(q.get('status') ? scoped : scoped.filter((g) => isOpen(g.status)), q);
    const sort = q.get('sort');
    if (sort === 'newest') list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    else if (sort === 'sla') list.sort((a, b) => a.sla.remaining_minutes - b.sla.remaining_minutes);
    else list.sort(inboxSort);
    return paged(list.map(strip), q);
  } },
  /* 29 */ { method: 'GET', pattern: '/officer/review-queue', fn: (ctx) => {
    requireRole(ctx, ['supervisor', 'admin']);
    const kind = ctx.query.get('kind') ?? 'routing';
    const all = getDb().grievances.map(refresh);
    const pick: Record<string, (g: GrievanceDetail) => boolean> = {
      routing: (g) => g.status === 'needs_review',
      emergency: (g) => g.is_emergency && g.emergency_confirmed === null && isOpen(g.status),
      disputed: (g) => g.ai_verification?.verdict === 'suspicious' || (g.reopen_count > 0 && isOpen(g.status)),
      appeal: (g) => g.appeal?.status === 'filed' || g.appeal?.status === 'under_review',
    };
    return paged(all.filter(pick[kind] ?? pick.routing).sort(inboxSort).map(strip), ctx.query);
  } },
  /* 30 */ { method: 'POST', pattern: '/officer/grievances/:id/status', fn: setStatus },
  /* 31 */ { method: 'POST', pattern: '/officer/grievances/:id/notes', fn: (ctx) => {
    const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
    const g = getG(ctx.params.id);
    const ev = pushEvent(g, 'note', u.role, String(B(ctx).text ?? ''), { actor_name: u.name, internal: true });
    touch(g);
    return ev;
  } },
  /* 32 */ { method: 'POST', pattern: '/officer/grievances/:id/reassign', fn: (ctx) => {
    const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
    const g = getG(ctx.params.id);
    const b = B(ctx);
    const dept = (b.department_id as DepartmentId) ?? g.category;
    const officer = (b.officer_id && officerById(b.officer_id)) || pickOfficer(dept, g.location.ward_id ?? WARDS[0].id);
    g.category = dept;
    g.routing = { ...g.routing, department: dept, method: 'human', needs_review: false, votes: [...g.routing.votes, { source: 'human', department: dept }] };
    g.assigned_officer = officer;
    if (g.status === 'needs_review' || g.status === 'registered') g.status = 'assigned';
    pushEvent(g, 'reassigned', u.role, `Reassigned to ${officer.name} (${deptById(dept).name.en}) — ${b.reason ?? ''}`.trim(), { actor_name: u.name, payload: { officer_id: officer.id, department_id: dept } });
    touch(g);
    return g;
  } },
  /* 33 */ { method: 'POST', pattern: '/officer/grievances/:id/route-decision', fn: (ctx) => {
    const u = requireRole(ctx, ['supervisor', 'admin']);
    const g = getG(ctx.params.id);
    const b = B(ctx);
    const dept = b.department_id as DepartmentId;
    const officer = pickOfficer(dept, g.location.ward_id ?? WARDS[0].id);
    if (dept !== g.routing.department) getDb().routing_corrections += 1;
    g.category = dept;
    g.routing = { ...g.routing, department: dept, sub_department: b.sub_department, method: 'human', needs_review: false, votes: [...g.routing.votes, { source: 'human', department: dept }], explanation_en: `Routed to ${deptById(dept).name.en} by ${u.name}.` };
    g.assigned_officer = officer;
    g.status = 'assigned';
    pushEvent(g, 'assigned', u.role, `Routing decided: ${deptById(dept).name.en}; assigned to ${officer.name}`, { actor_name: u.name });
    touch(g);
    return g;
  } },
  /* 34 */ { method: 'POST', pattern: '/officer/grievances/:id/emergency', fn: (ctx) => {
    const u = requireRole(ctx, ['supervisor', 'admin']);
    const g = getG(ctx.params.id);
    const confirmed = !!B(ctx).confirmed;
    g.emergency_confirmed = confirmed;
    if (confirmed) {
      g.priority = 'critical';
      g.priority_score = Math.max(g.priority_score, 80);
      g.priority_factors = [...g.priority_factors.filter((f) => f.key !== 'human_confirmed'), { key: 'human_confirmed', label_en: 'Emergency confirmed by supervisor', points: 0 }];
    } else {
      g.is_emergency = false;
      g.priority = levelForScore(g.priority_score);
    }
    pushEvent(g, confirmed ? 'emergency_confirmed' : 'priority_changed', u.role, confirmed ? 'Emergency confirmed — SLA set to 4 hours' : `Emergency not confirmed${B(ctx).note ? `: ${B(ctx).note}` : ''}`, { actor_name: u.name });
    refresh(g);
    touch(g);
    return g;
  } },
  /* 35 */ { method: 'POST', pattern: '/officer/grievances/:id/brief', fn: brief },
  /* 36 */ { method: 'POST', pattern: '/officer/grievances/:id/draft-reply', fn: draftReply },
  /* 37 */ { method: 'POST', pattern: '/officer/grievances/:id/message', fn: officerMessage },
  /* 38 */ { method: 'POST', pattern: '/officer/grievances/:id/resolve', fn: resolve },
  /* 39 */ { method: 'POST', pattern: '/officer/grievances/:id/appeal-decision', fn: (ctx) => {
    const u = requireRole(ctx, ['supervisor', 'admin']);
    const g = getG(ctx.params.id);
    if (!g.appeal) throw new MockHttpError(409, 'invalid_state', 'No appeal on this complaint');
    const b = B(ctx);
    g.appeal = { ...g.appeal, status: b.decision, decision_note: L(String(b.note ?? ''), 'en'), decided_at: nowIso() };
    if (b.decision === 'upheld') {
      g.status = 'reopened';
      g.reopen_count += 1;
    }
    pushEvent(g, 'appeal_decided', u.role, `Appeal ${b.decision}${b.note ? `: ${b.note}` : ''}`, { actor_name: u.name });
    touch(g);
    return g;
  } },
  /* 40 */ { method: 'POST', pattern: '/officer/bulk', fn: (ctx) => {
    const u = requireRole(ctx, ['officer', 'supervisor', 'admin']);
    const b = B(ctx);
    let updated = 0;
    for (const id of (b.ids as string[]) ?? []) {
      const g = findGrievance(id);
      if (!g) continue;
      if (b.action === 'status') {
        g.status = b.payload?.status;
        pushEvent(g, 'status_changed', u.role, `Bulk status change to ${b.payload?.status}`, { actor_name: u.name });
      } else if (b.action === 'assign') {
        const o = officerById(b.payload?.officer_id);
        if (o) g.assigned_officer = o;
        pushEvent(g, 'reassigned', u.role, `Bulk assigned to ${o?.name ?? '—'}`, { actor_name: u.name });
      } else if (b.action === 'merge') {
        g.incident_id = b.payload?.incident_id;
        g.status = 'merged';
        pushEvent(g, 'merged', u.role, `Merged into ${b.payload?.incident_id}`, { actor_name: u.name });
      }
      touch(g);
      updated++;
    }
    return { updated };
  } },
  /* 41 */ { method: 'GET', pattern: '/officer/officers', fn: (ctx) => { requireRole(ctx, ['officer', 'supervisor', 'admin']); const d = ctx.query.get('department'); return OFFICERS.filter((o) => !d || o.department_id === d); } },
  /* 42 */ { method: 'GET', pattern: '/officer/incidents', fn: (ctx) => {
    requireRole(ctx, ['officer', 'supervisor', 'admin']);
    const w = ctx.query.get('ward');
    const c = ctx.query.get('category');
    return getDb().incidents.filter((i) => (!w || i.ward_id === w) && (!c || i.category === c));
  } },
  /* 43 */ { method: 'GET', pattern: '/admin/kpis', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return kpis(ctx); } },
  /* 44 */ { method: 'GET', pattern: '/admin/departments/performance', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return perf(ctx); } },
  /* 45 */ { method: 'GET', pattern: '/admin/officers/workload', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return workload(ctx); } },
  /* 46 */ { method: 'GET', pattern: '/admin/analytics/trends', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return trends(ctx); } },
  /* 47 */ { method: 'GET', pattern: '/admin/analytics/breakdown', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return breakdown(ctx); } },
  /* 48 */ { method: 'GET', pattern: '/admin/map', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor']); return mapPoints(ctx, false); } },
  /* 49 */ { method: 'GET', pattern: '/admin/alerts', fn: (ctx): Alert[] => { requireRole(ctx, ['admin', 'supervisor']); return getDb().alerts; } },
  /* 50 */ { method: 'GET', pattern: '/admin/insights', fn: (ctx) => { requireRole(ctx, ['admin']); return insights(ctx); } },
  /* 51 */ { method: 'GET', pattern: '/admin/audit', fn: (ctx) => { requireRole(ctx, ['admin']); return auditList(ctx); } },
  /* 52 */ { method: 'GET', pattern: '/admin/audit/verify', fn: (ctx) => { requireRole(ctx, ['admin', 'supervisor', 'officer']); return auditVerify(ctx); } },
  /* 53 */ { method: 'GET', pattern: '/admin/ai/metrics', fn: (ctx) => { requireRole(ctx, ['admin']); return getDb().ai_metrics; } },
  /* 54 */ { method: 'POST', pattern: '/admin/ai/retrain', fn: (ctx) => { requireRole(ctx, ['admin']); return retrain(); } },
  /* 55 */ { method: 'GET', pattern: '/admin/demo/clock', fn: clock },
  /* 55 */ { method: 'POST', pattern: '/admin/demo/clock', fn: clock },
  /* 56 */ { method: 'POST', pattern: '/admin/demo/reset', fn: (ctx) => { requireRole(ctx, ['admin']); buildDb(); return { ok: true }; } },
  // Additive (requested from B in docs/contract-notes/A.md): current user's profile.
  { method: 'GET', pattern: '/me', fn: (ctx) => { const u = requireUser(ctx); return { id: u.id, role: u.role, name: u.name, email: u.email, preferred_language: u.preferred_language, department_id: u.department_id }; } },
  /* 57 */ { method: 'GET', pattern: '/health', fn: () => ({ status: 'ok', version: 'mock', providers: { gemini: 'mock', groq: 'mock', db: 'mock', embeddings: 'mock' } }) },
];


