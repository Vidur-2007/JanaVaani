// Deterministic in-memory mock database. Built once from SEED; handlers mutate it so submit → track works.
import type {
  AIMetrics,
  AIVerification,
  Alert,
  Appeal,
  Asset,
  DeepLang,
  DepartmentId,
  GrievanceDetail,
  GrievanceDraft,
  Hazard,
  Incident,
  Lang,
  LiveEvent,
  Location,
  Media,
  Message,
  Notification,
  Officer,
  Priority,
  PriorityFactor,
  Routing,
  RoutingVote,
  SLA,
  Status,
  TimelineEvent,
  TimelineEventType,
  Role,
  Localized,
  Vulnerable,
} from '../src/types';
import { createRng, fakeHash, pad, DAY, HOUR, MINUTE, distanceM, type Rng } from './seed';
import { DEPARTMENTS, deptById } from './data/departments';
import { WARDS, wardByName, wardById } from './data/wards';
import { OFFICERS, pickOfficer } from './data/people';
import { PHRASES, LANDMARKS, type Phrase } from './data/phrases';

// ---------------------------------------------------------------- types

export interface ChatSession {
  id: string;
  user_id: string;
  stage: 'collecting' | 'confirming' | 'duplicate_check' | 'submitted' | 'emergency' | 'answered';
  lang: Lang;
  ui_lang: DeepLang;
  text: string;
  fields: Record<string, string>;
  asked: string[];
  emergency_acked: boolean;
  location?: Location;
  media_ids: string[];
  asset_id?: string;
  draft?: GrievanceDraft;
  duplicates_shown: boolean;
  /** Set when one message described several separate problems (split flow). */
  drafts?: GrievanceDraft[];
}

export interface MockDb {
  base_now: number;
  clock_offset_minutes: number;
  seq: number;
  grievances: GrievanceDetail[];
  owners: Record<string, string>;
  pins: Record<string, string>;
  incidents: Incident[];
  notifications: Record<string, Notification[]>;
  alerts: Alert[];
  assets: Asset[];
  media: Record<string, Media>;
  sessions: Record<string, ChatSession>;
  drafts: Record<string, GrievanceDraft>;
  live_events: LiveEvent[];
  ai_metrics: AIMetrics;
  routing_corrections: number;
  /** grievance id → user ids who added support (for "the issue you supported is fixed" updates). */
  supporters: Record<string, string[]>;
}

// ---------------------------------------------------------------- clock

let db: MockDb;

export const getDb = () => db;
export const nowMs = () => db.base_now + db.clock_offset_minutes * MINUTE;
export const nowIso = () => new Date(nowMs()).toISOString();
export const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------- images (offline SVG placeholders)

export function mockImage(label: string, color: string, variant: 'before' | 'after' = 'before'): string {
  const bg = variant === 'after' ? '#14532d' : '#1f2937';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="620" cy="140" r="90" fill="${color}" opacity=".35"/><rect x="60" y="430" width="680" height="110" rx="18" fill="#000" opacity=".35"/><text x="90" y="500" font-family="sans-serif" font-size="40" fill="#fff">${label.replace(/[<&>]/g, '')}</text><text x="90" y="80" font-family="monospace" font-size="24" fill="#fff" opacity=".8">${variant.toUpperCase()} · demo photo</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------- scoring

const URGENCY_BASE: Record<Priority, number> = { critical: 70, high: 50, medium: 30, low: 15 };
export const SLA_HOURS: Record<Priority, number> = { critical: 24, high: 48, medium: 96, low: 168 };

export function levelForScore(score: number): Priority {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

const HAZARD_LABEL: Record<Hazard, string> = {
  live_wire: 'Live wire',
  fire: 'Fire',
  gas_leak: 'Gas leak',
  collapse_risk: 'Collapse risk',
  flooding: 'Flooding',
  open_manhole: 'Open manhole',
  contaminated_water: 'Contaminated water',
  sewage_overflow: 'Sewage overflow',
  traffic_danger: 'Traffic danger',
  disease_risk: 'Disease risk',
  near_school: 'Near a school',
  near_hospital: 'Near a hospital',
};

export function computePriority(input: {
  urgency: Priority;
  hazards: Hazard[];
  emergency: boolean;
  distress: number;
  vulnerable: Vulnerable[];
  supporters: number;
}): { score: number; level: Priority; factors: PriorityFactor[] } {
  const factors: PriorityFactor[] = [
    { key: 'urgency', label_en: `AI urgency: ${input.urgency}`, points: URGENCY_BASE[input.urgency] },
  ];
  const hz = Math.min(20, input.hazards.length * 10);
  if (hz)
    factors.push({
      key: 'hazards',
      label_en: `Hazards: ${input.hazards.map((h) => HAZARD_LABEL[h]).join(', ')}`,
      points: hz,
    });
  const distress = Math.round(Math.min(10, Math.max(0, input.distress * 10)));
  if (distress) factors.push({ key: 'distress', label_en: 'Citizen distress', points: distress });
  if (input.vulnerable.length)
    factors.push({
      key: 'vulnerable',
      label_en: `Vulnerable groups: ${input.vulnerable.join(', ')}`,
      points: 8,
    });
  const community = Math.min(15, Math.round(5 * Math.log2(1 + input.supporters)));
  if (community)
    factors.push({ key: 'community', label_en: `${input.supporters} community reports`, points: community });
  let score = factors.reduce((s, f) => s + f.points, 0);
  if (input.emergency && score < 80) {
    factors.push({
      key: 'emergency_floor',
      label_en: 'Emergency keyword rule (floor 80)',
      points: 80 - score,
    });
    score = 80;
  }
  score = Math.min(100, score);
  return { score, level: levelForScore(score), factors };
}

export function buildSla(
  createdMs: number,
  priority: Priority,
  emergencyConfirmed: boolean | null,
  closed: boolean,
): SLA {
  const hours = priority === 'critical' && emergencyConfirmed ? 4 : SLA_HOURS[priority];
  const due = createdMs + hours * HOUR;
  const remaining = Math.round((due - nowMs()) / MINUTE);
  const breached = !closed && remaining < 0;
  return {
    hours,
    due_at: iso(due),
    breached,
    remaining_minutes: closed ? 0 : remaining,
    eta_at: iso(createdMs + hours * 0.8 * HOUR),
    delay_risk: breached ? 'high' : remaining < hours * 15 ? 'medium' : 'low',
  };
}

// ---------------------------------------------------------------- timeline + audit chain

export function eventHash(
  prev: string | null,
  e: Pick<TimelineEvent, 'id' | 'type' | 'created_at' | 'message_en'>,
) {
  return fakeHash(`${prev ?? 'GENESIS'}|${e.id}|${e.type}|${e.created_at}|${e.message_en}`);
}

export function pushEvent(
  g: GrievanceDetail,
  type: TimelineEventType,
  actor_role: Role | 'system' | 'ai',
  message_en: string,
  opts: {
    at?: number;
    actor_name?: string;
    internal?: boolean;
    message?: Localized;
    payload?: Record<string, unknown>;
  } = {},
): TimelineEvent {
  const prev = g.timeline.length ? g.timeline[g.timeline.length - 1].hash : null;
  const created_at = iso(opts.at ?? nowMs());
  const id = `EV-${g.id.slice(-6)}-${pad(g.timeline.length + 1, 3)}`;
  const ev: TimelineEvent = {
    id,
    grievance_id: g.id,
    type,
    actor_role,
    actor_name: opts.actor_name,
    message_en,
    message: opts.message,
    internal: opts.internal ?? false,
    payload: opts.payload,
    created_at,
    prev_hash: prev,
    hash: '',
  };
  ev.hash = eventHash(prev, ev);
  g.timeline.push(ev);
  g.updated_at = created_at;
  return ev;
}

export function pushLiveEvent(kind: LiveEvent['kind'], audience: string, grievance_id?: string) {
  db.live_events.push({
    id: `LE-${db.live_events.length + 1}`,
    audience,
    kind,
    grievance_id,
    created_at: nowIso(),
  });
}

export function notify(userId: string, n: Omit<Notification, 'id' | 'read' | 'created_at'>) {
  const list = (db.notifications[userId] ??= []);
  list.unshift({
    ...n,
    id: `N-${userId}-${list.length + 1}-${nowMs() % 100000}`,
    read: false,
    created_at: nowIso(),
  });
  pushLiveEvent('notification', `user:${userId}`, n.grievance_id);
}

// ---------------------------------------------------------------- grievance factory

const loc = (text: string, en: string, lang: Lang): Localized => ({ original: text, en, lang });

function routingFor(rng: Rng, dept: DepartmentId, sub: string | undefined, confident: boolean): Routing {
  const confidence = confident
    ? +(0.78 + rng.next() * 0.2).toFixed(2)
    : +(0.42 + rng.next() * 0.15).toFixed(2);
  const alt = rng.pick(DEPARTMENTS.filter((d) => d.id !== dept && d.id !== 'other')).id;
  const votes: RoutingVote[] = [
    { source: 'classifier', department: dept, confidence },
    { source: 'gemini', department: dept, confidence: +(confidence + 0.03).toFixed(2) },
    { source: 'groq', department: confident ? dept : alt, confidence: +(confidence - 0.05).toFixed(2) },
  ];
  return {
    department: dept,
    sub_department: sub,
    secondary_departments: [],
    confidence,
    votes,
    explanation_en: confident
      ? `Classifier, Gemini and Groq agree on ${deptById(dept).name.en} (${Math.round(confidence * 100)}% confidence).`
      : `Models disagree (${deptById(dept).name.en} vs ${deptById(alt).name.en}); sent for human review.`,
    needs_review: !confident,
    method: confident ? 'auto' : 'auto_flagged',
  };
}

export interface MakeOpts {
  phrase: Phrase;
  ward: string;
  createdMs: number;
  status: Status;
  owner?: string;
  supporters?: number;
  incident_id?: string;
  emergency?: boolean;
  emergencyConfirmed?: boolean | null;
  reopen?: number;
  suspicious?: boolean;
  lowConfidence?: boolean;
  appeal?: boolean;
  asset_id?: string;
  anonymous?: boolean;
  location?: Location;
}

export function nextGrievanceId() {
  db.seq += 1;
  return `GRV-2026-${pad(db.seq, 6)}`;
}

export function makeGrievance(rng: Rng, o: MakeOpts): GrievanceDetail {
  const ph = o.phrase;
  const w = wardByName(o.ward) ?? WARDS[0];
  const pt = o.location ?? {
    ...rng.jitter(w.centroid.lat, w.centroid.lng, 650),
    source: rng.pick(['gps', 'pin', 'text'] as const),
  };
  const landmark = rng.pick(LANDMARKS);
  const location: Location = {
    ...pt,
    address: `${landmark}, ${w.name}, Hyderabad`,
    landmark,
    ward_id: w.id,
    ward_name: w.name,
    zone: w.zone,
    accuracy_m: pt.source === 'gps' ? rng.int(8, 40) : undefined,
  };
  const hazards = ph.hazards ?? [];
  const vulnerable = ph.vulnerable ?? [];
  const distress =
    ph.sentiment === 'distressed'
      ? 0.9
      : ph.sentiment === 'angry'
        ? 0.6
        : ph.sentiment === 'frustrated'
          ? 0.4
          : 0.1;
  const supporters = o.supporters ?? (rng.chance(0.3) ? rng.int(1, 6) : 0);
  const emergency = o.emergency ?? false;
  const pr = computePriority({ urgency: ph.urgency, hazards, emergency, distress, vulnerable, supporters });
  const routing = routingFor(rng, ph.dept, ph.sub, !o.lowConfidence);
  const officer = pickOfficer(ph.dept, w.id);
  const id = nextGrievanceId();
  const created_at = iso(o.createdMs);
  const closedLike = o.status === 'closed' || o.status === 'rejected' || o.status === 'merged';
  const media: Media[] = [];
  if (rng.chance(0.55) || o.suspicious) {
    const m: Media = {
      id: `M-${id.slice(-6)}-1`,
      url: mockImage(ph.title_en, deptById(ph.dept).color),
      kind: 'image',
      uploaded_by: 'citizen',
      purpose: 'evidence',
      quality: { ok: true, issue: 'none' },
      ai: {
        category: ph.dept,
        severity: ph.urgency,
        description_en: `Photo showing: ${ph.title_en.toLowerCase()}`,
        matches_text: true,
      },
      geo: { lat: location.lat, lng: location.lng },
      created_at,
    };
    media.push(m);
    db.media[m.id] = m;
  }

  const g: GrievanceDetail = {
    id,
    title: loc(ph.title, ph.title_en, ph.lang),
    summary_en: ph.text_en,
    description: loc(ph.text, ph.text_en, ph.lang),
    formal_text: loc(
      ph.text,
      `Respected Sir/Madam, I wish to report the following issue at ${location.address}: ${ph.text_en} Kindly take action at the earliest.`,
      ph.lang,
    ),
    language: ph.lang,
    script: ph.script,
    is_code_mixed: !!ph.mixed,
    category: ph.dept,
    routing,
    status: o.status,
    closure_type: null,
    priority: pr.level,
    priority_score: pr.score,
    priority_factors: pr.factors,
    is_emergency: emergency,
    emergency_confirmed: emergency ? (o.emergencyConfirmed ?? null) : null,
    hazards,
    vulnerable,
    sentiment: ph.sentiment,
    distress_score: distress,
    location,
    asset_id: o.asset_id,
    media,
    assigned_officer: o.lowConfidence && o.status === 'needs_review' ? undefined : officer,
    escalation_level: 0,
    sla: buildSla(o.createdMs, pr.level, o.emergencyConfirmed ?? null, closedLike),
    incident_id: o.incident_id,
    support_count: supporters,
    related_ids: [],
    is_anonymous: o.anonymous ?? false,
    is_private: false,
    citizen_display_name: o.anonymous
      ? undefined
      : rng.pick([
          'Lakshmi D.',
          'Imran K.',
          'Suresh P.',
          'Anjali M.',
          'Mohammed A.',
          'Priya R.',
          'Venkat S.',
          'Fatima B.',
        ]),
    reopen_count: o.reopen ?? 0,
    created_at,
    updated_at: created_at,
    timeline: [],
    messages: [],
  };

  // ---- timeline, oldest first
  let t = o.createdMs;
  const step = (min: number, max: number) => (t += rng.int(min, max) * MINUTE);
  pushEvent(g, 'registered', 'citizen', 'Complaint registered', {
    at: t,
    message: loc(ph.title, ph.title_en, ph.lang),
  });
  step(1, 2);
  pushEvent(
    g,
    'classified',
    'ai',
    `Classified as ${deptById(ph.dept).name.en} · priority ${pr.level} (${pr.score})`,
    { at: t },
  );
  if (emergency)
    pushEvent(
      g,
      'emergency_flagged',
      'system',
      `Emergency keywords detected: ${hazards.map((h) => HAZARD_LABEL[h]).join(', ')}`,
      { at: t },
    );
  if (o.lowConfidence) {
    pushEvent(g, 'routing_review', 'system', 'Low routing confidence — sent to supervisor review', { at: t });
  }
  const order: Status[] = [
    'registered',
    'assigned',
    'in_progress',
    'resolved_pending_verification',
    'closed',
  ];
  const reach = order.indexOf(o.status === 'reopened' ? 'in_progress' : o.status);
  if (!o.lowConfidence || reach >= 1) {
    if (o.status !== 'registered' && o.status !== 'needs_review') {
      step(5, 40);
      pushEvent(g, 'assigned', 'system', `Assigned to ${officer.name}, ${officer.designation}`, {
        at: t,
        payload: { officer_id: officer.id },
      });
    }
  }
  if (emergency && o.emergencyConfirmed) {
    step(5, 20);
    pushEvent(
      g,
      'emergency_confirmed',
      'supervisor',
      'Emergency confirmed by supervisor — SLA set to 4 hours',
      { at: t, actor_name: 'Deputy Commissioner' },
    );
  }
  if (reach >= 2 || o.status === 'reopened') {
    step(60, 600);
    pushEvent(g, 'status_changed', 'officer', 'Work started on site', {
      at: t,
      actor_name: officer.name,
      payload: { status: 'in_progress' },
    });
    g.messages.push({
      id: `MSG-${id.slice(-6)}-1`,
      grievance_id: id,
      sender: 'officer',
      sender_name: officer.name,
      text: loc(officerReply(ph.lang), 'Our team has inspected the site and work has started.', ph.lang),
      created_at: iso(t),
    });
  }
  for (let r = 0; r < (o.reopen ?? 0); r++) {
    step(600, 1800);
    pushEvent(g, 'resolution_submitted', 'officer', 'Resolution submitted with photo', {
      at: t,
      actor_name: officer.name,
    });
    step(120, 600);
    pushEvent(g, 'citizen_rejected', 'citizen', 'Citizen says the issue is not fixed', { at: t });
    pushEvent(g, 'reopened', 'citizen', `Reopened (${r + 1})`, { at: t });
  }
  if (reach >= 3) {
    step(600, 2400);
    const proof: Media = {
      id: `M-${id.slice(-6)}-P`,
      url: o.suspicious && media[0] ? media[0].url : mockImage(`${ph.title_en} — fixed`, '#2BD67B', 'after'),
      kind: 'image',
      uploaded_by: 'officer',
      purpose: 'resolution_proof',
      quality: { ok: true, issue: 'none' },
      ai: {
        category: ph.dept,
        description_en: o.suspicious
          ? 'Same scene as the citizen photo; issue still visible'
          : 'Issue appears repaired',
      },
      geo: { lat: location.lat, lng: location.lng },
      created_at: iso(t),
    };
    g.media.push(proof);
    db.media[proof.id] = proof;
    pushEvent(g, 'resolution_submitted', 'officer', 'Resolution submitted with photo', {
      at: t,
      actor_name: officer.name,
    });
    g.resolved_at = iso(t);
    g.ai_verification = verification(!!o.suspicious, iso(t));
    pushEvent(g, 'ai_verification', 'ai', `AI verification: ${g.ai_verification.verdict}`, {
      at: t,
      payload: { verdict: g.ai_verification.verdict },
    });
  }
  if (o.status === 'closed') {
    step(60, 1440);
    const verified = rng.chance(0.75);
    if (verified) {
      pushEvent(g, 'citizen_verified', 'citizen', 'Citizen confirmed the issue is fixed', { at: t });
      g.rating = rng.int(3, 5);
      g.closure_type = 'citizen_verified';
    } else {
      g.closure_type = 'auto_closed_unverified';
    }
    pushEvent(
      g,
      'closed',
      'system',
      verified ? 'Closed — citizen verified' : 'Auto-closed after 7 days without response',
      { at: t },
    );
    g.closed_at = iso(t);
  }
  if (o.status === 'rejected') {
    pushEvent(g, 'status_changed', 'officer', 'Rejected: out of scope', {
      at: step(60, 300),
      actor_name: officer.name,
      payload: { status: 'rejected' },
    });
    g.closure_type = 'rejected';
    g.closed_at = iso(t);
  }
  if (o.incident_id)
    pushEvent(g, 'merged', 'system', `Linked to incident ${o.incident_id}`, { at: o.createdMs + 3 * MINUTE });
  if (o.appeal) {
    step(60, 240);
    const appeal: Appeal = {
      id: `AP-${id.slice(-6)}`,
      grievance_id: id,
      reason: loc('The work was not done properly.', 'The work was not done properly.', 'en'),
      status: 'filed',
      created_at: iso(t),
    };
    g.appeal = appeal;
    pushEvent(g, 'appeal_filed', 'citizen', 'Appeal filed', { at: t });
  }
  // Keep timestamps sane relative to the virtual clock.
  for (const ev of g.timeline) if (Date.parse(ev.created_at) > nowMs()) ev.created_at = nowIso();
  rehashChain(g);
  g.updated_at = g.timeline[g.timeline.length - 1].created_at;
  g.escalation_level = escalationFor(g);

  db.grievances.push(g);
  if (o.owner) db.owners[id] = o.owner;
  return g;
}

export function rehashChain(g: GrievanceDetail) {
  let prev: string | null = null;
  for (const ev of g.timeline) {
    ev.prev_hash = prev;
    ev.hash = eventHash(prev, ev);
    prev = ev.hash;
  }
}

export function verification(suspicious: boolean, at: string): AIVerification {
  return suspicious
    ? {
        verdict: 'suspicious',
        confidence: 0.91,
        reasons_en: [
          'Resolution photo is a near-duplicate of the citizen’s original photo',
          'Issue still visible in the image',
        ],
        checks: { same_location: true, issue_resolved_visible: false, duplicate_photo: true, distance_m: 4 },
        created_at: at,
      }
    : {
        verdict: 'verified',
        confidence: 0.86,
        reasons_en: ['Photo taken within 30 m of the reported location', 'Issue no longer visible'],
        checks: { same_location: true, issue_resolved_visible: true, duplicate_photo: false, distance_m: 18 },
        created_at: at,
      };
}

function officerReply(lang: Lang): string {
  switch (lang) {
    case 'te':
      return 'మా బృందం స్థలాన్ని పరిశీలించింది, పని ప్రారంభమైంది.';
    case 'hi':
      return 'हमारी टीम ने जगह का निरीक्षण किया है और काम शुरू हो गया है।';
    case 'ur':
      return 'ہماری ٹیم نے جگہ کا معائنہ کیا ہے اور کام شروع ہو گیا ہے۔';
    default:
      return 'Our team has inspected the site and work has started.';
  }
}

const OPEN: Status[] = [
  'registered',
  'needs_review',
  'assigned',
  'in_progress',
  'reopened',
  'resolved_pending_verification',
];
export const isOpen = (s: Status) => OPEN.includes(s);

export function escalationFor(g: GrievanceDetail): 0 | 1 | 2 | 3 {
  if (!isOpen(g.status) || g.status === 'resolved_pending_verification') return g.escalation_level ?? 0;
  const created = Date.parse(g.created_at);
  const overdueH = (nowMs() - (created + g.sla.hours * HOUR)) / HOUR;
  if (overdueH <= 0) return 0;
  if (g.priority === 'critical' && overdueH >= 2) return 2;
  return overdueH >= g.sla.hours * 0.5 ? 2 : 1;
}

/** Recompute time-dependent fields (SLA countdown, escalation) against the virtual clock. */
export function refresh(g: GrievanceDetail): GrievanceDetail {
  const closed = !isOpen(g.status) || g.status === 'resolved_pending_verification';
  g.sla = {
    ...buildSla(Date.parse(g.created_at), g.priority, g.emergency_confirmed, closed),
    delay_reason: g.sla.delay_reason,
  };
  const lvl = escalationFor(g);
  if (lvl > g.escalation_level) {
    g.escalation_level = lvl;
    pushEvent(g, 'escalated', 'system', `Escalated to level ${lvl} (${lvl === 1 ? 'supervisor' : 'admin'})`);
  }
  return g;
}

// ---------------------------------------------------------------- build

// Asset ids follow B's seed format, e.g. SL-KKP-0042.
const ASSET_CODE: Record<Asset['type'], string> = {
  streetlight: 'SL',
  drain: 'DR',
  water_pipe: 'WP',
  bin: 'BN',
  road_segment: 'RD',
  signal: 'TS',
};

function buildAssets(rng: Rng): Asset[] {
  const defs: [Asset['type'], string, string][] = [
    ['streetlight', 'Streetlight pole SL-114', 'Ameerpet'],
    ['streetlight', 'Streetlight pole SL-208', 'Kukatpally'],
    ['streetlight', 'Streetlight pole SL-311', 'Madhapur'],
    ['drain', 'Storm drain D-21', 'Malakpet'],
    ['drain', 'Storm drain D-07', 'Dilsukhnagar'],
    ['water_pipe', 'Water main WM-3', 'Charminar'],
    ['water_pipe', 'Water main WM-9', 'Falaknuma'],
    ['bin', 'Community bin B-55', 'Tolichowki'],
    ['bin', 'Community bin B-12', 'Secunderabad'],
    ['road_segment', 'Miyapur X Roads segment', 'Miyapur'],
    ['signal', 'Traffic signal TS-Begumpet', 'Begumpet'],
    ['signal', 'Traffic signal TS-Uppal', 'Uppal'],
  ];
  return defs.map(([type, label, ward], i) => {
    const w = wardByName(ward);
    return {
      id: `${ASSET_CODE[type]}-${w.id.split('-')[1]}-${String(i + 1).padStart(4, '0')}`,
      type,
      label_en: label,
      ward_id: w.id,
      location: rng.jitter(w.centroid.lat, w.centroid.lng, 300),
      open_grievance_ids: [],
      history: [],
    };
  });
}

function buildMetrics(): AIMetrics {
  const labels = DEPARTMENTS.map((d) => d.id);
  const matrix = labels.map((_, i) =>
    labels.map((_, j) => (i === j ? 40 + ((i * 7) % 11) : (i + j) % 5 === 0 ? 2 : (i * j) % 7 === 1 ? 1 : 0)),
  );
  return {
    model_version: 'clf-v3',
    trained_at: iso(db.base_now - 2 * DAY),
    embedding_model: 'intfloat/multilingual-e5-small',
    n_train: 2400,
    n_test: 600,
    accuracy: 0.912,
    macro_f1: 0.894,
    per_language: {
      en: { accuracy: 0.94, n: 150 },
      te: { accuracy: 0.9, n: 140 },
      hi: { accuracy: 0.92, n: 130 },
      ur: { accuracy: 0.88, n: 100 },
      code_mixed: { accuracy: 0.86, n: 80 },
    },
    human_test: {
      accuracy: 0.875,
      n: 48,
      per_language: {
        en: { accuracy: 0.92, n: 12 },
        te: { accuracy: 0.83, n: 12 },
        hi: { accuracy: 0.92, n: 12 },
        ur: { accuracy: 0.83, n: 12 },
      },
    },
    confusion: { labels, matrix },
    live: {
      auto_routed_pct: 86.4,
      needs_review_pct: 13.6,
      agreement_rate: 0.89,
      avg_pipeline_ms: 3120,
      fallback_rate: 0.04,
      calls_24h: 214,
    },
    history: [
      {
        model_version: 'clf-v1',
        accuracy: 0.861,
        macro_f1: 0.84,
        trained_at: iso(db.base_now - 9 * DAY),
        corrections_used: 0,
      },
      {
        model_version: 'clf-v2',
        accuracy: 0.897,
        macro_f1: 0.879,
        trained_at: iso(db.base_now - 5 * DAY),
        corrections_used: 18,
      },
      {
        model_version: 'clf-v3',
        accuracy: 0.912,
        macro_f1: 0.894,
        trained_at: iso(db.base_now - 2 * DAY),
        corrections_used: 41,
      },
    ],
  };
}

const byTitle = (needle: string) => PHRASES.find((p) => p.title_en.includes(needle))!;

export function buildDb(baseNow = Math.floor(Date.now() / HOUR) * HOUR): MockDb {
  const rng = createRng();
  db = {
    base_now: baseNow,
    clock_offset_minutes: 0,
    seq: 100,
    grievances: [],
    owners: {},
    pins: {},
    incidents: [],
    notifications: {},
    alerts: [],
    assets: [],
    media: {},
    sessions: {},
    drafts: {},
    live_events: [],
    ai_metrics: undefined as unknown as AIMetrics,
    routing_corrections: 0,
    supporters: {},
  };
  db.assets = buildAssets(rng);
  db.ai_metrics = buildMetrics();
  const N = baseNow;

  // ---- Narrative 1: live wire near a school, Kukatpally (Lakshmi's seeded backup)
  makeGrievance(rng, {
    phrase: byTitle('Live wire fallen near the school'),
    ward: 'Kukatpally',
    createdMs: N - 3 * HOUR,
    status: 'in_progress',
    owner: 'u-lakshmi',
    emergency: true,
    emergencyConfirmed: true,
    supporters: 4,
  });

  // ---- Narrative 2: Miyapur X Roads pothole cluster → one incident
  const miyapur = wardByName('Miyapur');
  const incId = 'INC-0001';
  const potholes = PHRASES.filter((p) => p.dept === 'roads' && p.sub === 'potholes');
  const cluster: string[] = [];
  for (let i = 0; i < 8; i++) {
    const g = makeGrievance(rng, {
      phrase: potholes[i % potholes.length],
      ward: 'Miyapur',
      createdMs: N - rng.int(6, 120) * HOUR,
      status: i === 0 ? 'assigned' : 'merged',
      incident_id: incId,
      supporters: i === 0 ? 32 : 0,
      location: { ...rng.jitter(17.4968, 78.3614, 120), source: 'gps' },
      owner: i === 1 ? 'u-imran' : undefined,
    });
    cluster.push(g.id);
  }
  db.incidents.push({
    id: incId,
    title_en: 'Pothole cluster at Miyapur X Roads',
    category: 'roads',
    ward_id: miyapur.id,
    centroid: { lat: 17.4968, lng: 78.3614 },
    grievance_ids: cluster,
    support_count: 32,
    languages: ['te', 'hi', 'en', 'ur'],
    status: 'assigned',
    created_at: iso(N - 120 * HOUR),
  });

  // ---- Narrative 3: contaminated water spike, Charminar + Falaknuma (last 48h)
  const water = PHRASES.filter((p) => p.dept === 'water' && p.sub === 'contamination');
  const spikeIds: string[] = [];
  for (let i = 0; i < 9; i++) {
    const g = makeGrievance(rng, {
      phrase: water[i % water.length],
      ward: i % 3 === 2 ? 'Falaknuma' : 'Charminar',
      createdMs: N - rng.int(2, 46) * HOUR,
      status: rng.pick(['registered', 'assigned', 'in_progress'] as const),
      owner: i === 0 ? 'u-imran' : undefined,
    });
    spikeIds.push(g.id);
  }

  // ---- Narrative 4: suspicious closure, streetlight, Ameerpet (Lakshmi)
  const suspicious = makeGrievance(rng, {
    phrase: byTitle('Streetlights not working on our lane'),
    ward: 'Ameerpet',
    createdMs: N - 4 * DAY,
    status: 'resolved_pending_verification',
    owner: 'u-lakshmi',
    suspicious: true,
    asset_id: 'SL-KHB-0001',
  });
  db.assets[0].open_grievance_ids.push(suspicious.id);

  // ---- Narrative 5: repeated reopen, drainage, Malakpet (Imran)
  const reopened = makeGrievance(rng, {
    phrase: byTitle('Drain is blocked'),
    ward: 'Malakpet',
    createdMs: N - 12 * DAY,
    status: 'in_progress',
    reopen: 3,
    owner: 'u-imran',
    asset_id: 'DR-CHR-0004',
  });
  db.assets[3].open_grievance_ids.push(reopened.id);
  db.assets[3].history.push({
    grievance_id: 'GRV-2025-000871',
    category: 'drainage',
    created_at: iso(N - 80 * DAY),
    closed_at: iso(N - 74 * DAY),
  });

  // ---- Background: ~60 mixed complaints over the last 60 days
  const statuses: Status[] = [
    'registered',
    'assigned',
    'in_progress',
    'resolved_pending_verification',
    'closed',
    'closed',
    'closed',
    'closed',
  ];
  const nonCluster = PHRASES.filter((p) => !p.title_en.includes('Miyapur'));
  for (let i = 0; i < 60; i++) {
    const age = rng.int(2, 60 * 24) * HOUR;
    const old = age > 10 * DAY;
    const status: Status =
      i % 17 === 5
        ? 'needs_review'
        : i % 23 === 7
          ? 'rejected'
          : old
            ? rng.pick(['closed', 'closed', 'closed', 'in_progress'] as const)
            : rng.pick(statuses);
    makeGrievance(rng, {
      phrase: nonCluster[(i * 7) % nonCluster.length],
      ward: WARDS[(i * 11) % WARDS.length].name,
      createdMs: N - age,
      status,
      lowConfidence: status === 'needs_review',
      owner: i % 9 === 0 ? 'u-lakshmi' : i % 9 === 4 ? 'u-imran' : undefined,
      anonymous: i % 13 === 3,
      appeal: i === 20 || i === 41,
      emergency: i === 14,
      emergencyConfirmed: null,
    });
  }
  db.grievances.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // ---- Alerts
  db.alerts = [
    {
      id: 'AL-1',
      kind: 'spike',
      severity: 'critical',
      title_en: 'Contaminated water spike in Charminar',
      detail_en: `${spikeIds.length} water-contamination complaints in 48 h vs a baseline of 1.2 (z = 4.6). Mostly Urdu and Hindi.`,
      ward_id: wardByName('Charminar').id,
      category: 'water',
      grievance_ids: spikeIds,
      languages: ['ur', 'hi'],
      created_at: iso(N - 2 * HOUR),
    },
    {
      id: 'AL-2',
      kind: 'suspicious_closure',
      severity: 'warning',
      title_en: 'Suspicious resolution photo (streetlight, Ameerpet)',
      detail_en: 'Resolution photo is a near-duplicate of the citizen’s own photo.',
      ward_id: wardByName('Ameerpet').id,
      category: 'streetlights',
      grievance_ids: [suspicious.id],
      created_at: iso(N - 20 * HOUR),
    },
    {
      id: 'AL-3',
      kind: 'repeated_reopen',
      severity: 'warning',
      title_en: 'Drain in Malakpet reopened 3 times',
      detail_en: 'Same asset has failed verification three times. Consider a root-cause visit.',
      ward_id: wardByName('Malakpet').id,
      category: 'drainage',
      grievance_ids: [reopened.id],
      created_at: iso(N - 30 * HOUR),
    },
    {
      id: 'AL-4',
      kind: 'routing_review_backlog',
      severity: 'info',
      title_en: 'Routing review backlog',
      detail_en: `${db.grievances.filter((g) => g.status === 'needs_review').length} complaints are waiting for a routing decision.`,
      grievance_ids: db.grievances.filter((g) => g.status === 'needs_review').map((g) => g.id),
      created_at: iso(N - 5 * HOUR),
    },
  ];
  const unconfirmed = db.grievances.filter(
    (g) => g.is_emergency && g.emergency_confirmed === null && isOpen(g.status),
  );
  if (unconfirmed.length)
    db.alerts.push({
      id: 'AL-5',
      kind: 'emergency_unconfirmed',
      severity: 'critical',
      title_en: 'Emergency awaiting confirmation',
      detail_en: 'An emergency-flagged complaint has not been confirmed by a supervisor.',
      grievance_ids: unconfirmed.map((g) => g.id),
      created_at: iso(N - HOUR),
    });

  // Lakshmi supported the Miyapur pothole incident (drives a community update when it is fixed).
  db.supporters[cluster[0]] = ['u-lakshmi'];

  // ---- Notifications for demo citizens
  for (const uid of ['u-lakshmi', 'u-imran']) {
    const mine = db.grievances.filter((g) => db.owners[g.id] === uid).slice(0, 4);
    db.notifications[uid] = mine.map((g, i) => ({
      id: `N-${uid}-${i + 1}`,
      grievance_id: g.id,
      type: g.status === 'resolved_pending_verification' ? 'verification_request' : 'status',
      title: { original: g.title.original, en: g.title.en, lang: g.language },
      body:
        g.status === 'resolved_pending_verification'
          ? {
              original: 'Please confirm whether the issue is fixed.',
              en: 'Please confirm whether the issue is fixed.',
              lang: 'en',
            }
          : {
              original: `Status: ${g.status.replace(/_/g, ' ')}`,
              en: `Status: ${g.status.replace(/_/g, ' ')}`,
              lang: 'en',
            },
      read: i > 1,
      created_at: g.updated_at,
    }));
  }
  const fixedNearby = db.grievances.find((g) => g.status === 'closed' && g.category === 'roads' && db.owners[g.id] !== 'u-lakshmi');
  if (fixedNearby)
    db.notifications['u-lakshmi'].push({
      id: 'N-u-lakshmi-cu',
      grievance_id: undefined,
      type: 'community_update',
      title: { original: 'మీరు మద్దతు ఇచ్చిన సమస్య పరిష్కారమైంది', en: 'An issue you supported is fixed', lang: 'te' },
      body: { original: fixedNearby.title.original, en: fixedNearby.title.en, lang: fixedNearby.language },
      read: false,
      created_at: fixedNearby.closed_at ?? fixedNearby.updated_at,
    });

  for (const o of ['u-ravi', 'u-sunitha', 'u-farhan', 'u-supervisor', 'u-admin']) {
    db.notifications[o] = db.alerts.slice(0, 3).map((a, i) => ({
      id: `N-${o}-${i + 1}`,
      grievance_id: a.grievance_ids[0],
      type: 'alert',
      title: { original: a.title_en, en: a.title_en, lang: 'en' },
      body: { original: a.detail_en, en: a.detail_en, lang: 'en' },
      read: i > 0,
      created_at: a.created_at,
    }));
  }
  return db;
}

// ---------------------------------------------------------------- queries shared by handlers

export const findGrievance = (id: string) => db.grievances.find((g) => g.id === id);
export const officerById = (id: string): Officer | undefined => OFFICERS.find((o) => o.id === id);
export const wardOf = (id?: string) => (id ? wardById(id) : undefined);

export function nearbyOpen(point: { lat: number; lng: number }, radius: number, category?: DepartmentId) {
  return db.grievances
    .filter((g) => isOpen(g.status) && (!category || g.category === category))
    .map((g) => ({ g, d: distanceM(point, g.location) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d);
}

export function addMessage(g: GrievanceDetail, m: Omit<Message, 'id' | 'created_at' | 'grievance_id'>) {
  const msg: Message = {
    ...m,
    id: `MSG-${g.id.slice(-6)}-${g.messages.length + 1}`,
    grievance_id: g.id,
    created_at: nowIso(),
  };
  g.messages.push(msg);
  return msg;
}
