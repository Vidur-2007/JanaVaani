// Gov mock additions (imported once by GovLayout). Loaded dynamically so `live` builds never pull in the mock layer.
import type { Grievance, Lang, Localized, Message, Paged, ReplyIntent } from '@contracts/types';
import { API_MODE } from '@/lib/api/client';

const REPLIES: Partial<Record<Lang, Record<ReplyIntent, string>>> = {
  te: {
    acknowledge: 'మీ ఫిర్యాదు మాకు అందింది, ధన్యవాదాలు. మా బృందం దీన్ని పరిశీలిస్తుంది.',
    request_info: 'సమస్యను త్వరగా గుర్తించడానికి దగ్గరలోని గుర్తు లేదా ఫోటో పంపగలరా?',
    schedule_visit: 'మా బృందం రేపు ఉదయం 10 నుండి మధ్యాహ్నం 1 గంటల మధ్య ఆ ప్రదేశానికి వస్తుంది.',
    work_started: 'మీ ఫిర్యాదుపై పని ప్రారంభమైంది. పూర్తయిన వెంటనే తెలియజేస్తాము.',
    resolved: 'సమస్య పరిష్కరించబడింది. దయచేసి చూసి నిర్ధారించండి.',
    delay_update: 'ఆలస్యానికి క్షమించండి. సామగ్రి కోసం వేచి ఉన్నాము, రెండు రోజుల్లో పని మళ్లీ మొదలవుతుంది.',
    transfer: 'త్వరిత చర్య కోసం మీ ఫిర్యాదును సంబంధిత శాఖకు బదిలీ చేశాము.',
  },
  hi: {
    acknowledge: 'शिकायत दर्ज करने के लिए धन्यवाद। हमारी टीम इसकी जाँच करेगी।',
    request_info: 'समस्या जल्दी ढूँढने के लिए क्या आप पास का कोई निशान या फ़ोटो भेज सकते हैं?',
    schedule_visit: 'हमारी टीम कल सुबह 10 से दोपहर 1 बजे के बीच उस जगह पर आएगी।',
    work_started: 'आपकी शिकायत पर काम शुरू हो गया है। पूरा होते ही आपको बताया जाएगा।',
    resolved: 'समस्या हल कर दी गई है। कृपया देखकर पुष्टि करें।',
    delay_update: 'देरी के लिए खेद है। सामग्री का इंतज़ार है, दो दिन में काम फिर शुरू होगा।',
    transfer: 'तेज़ कार्रवाई के लिए आपकी शिकायत सही विभाग को भेज दी गई है।',
  },
  ur: {
    acknowledge: 'شکایت درج کرنے کا شکریہ۔ ہماری ٹیم اس کا جائزہ لے گی۔',
    request_info: 'مسئلہ جلد تلاش کرنے کے لیے کیا آپ قریبی نشانی یا تصویر بھیج سکتے ہیں؟',
    schedule_visit: 'ہماری ٹیم کل صبح 10 سے دوپہر 1 بجے کے درمیان اس جگہ آئے گی۔',
    work_started: 'آپ کی شکایت پر کام شروع ہو گیا ہے۔ مکمل ہوتے ہی آپ کو بتایا جائے گا۔',
    resolved: 'مسئلہ حل کر دیا گیا ہے۔ براہ کرم دیکھ کر تصدیق کریں۔',
    delay_update: 'تاخیر کے لیے معذرت۔ سامان کا انتظار ہے، دو دن میں کام دوبارہ شروع ہوگا۔',
    transfer: 'تیز کارروائی کے لیے آپ کی شکایت متعلقہ محکمے کو بھیج دی گئی ہے۔',
  },
};

const GENERIC: Partial<Record<Lang, string>> = {
  te: 'మీ ఫిర్యాదుపై అధికారి నుండి తాజా సమాచారం.',
  hi: 'आपकी शिकायत पर अधिकारी की ओर से नई जानकारी।',
  ur: 'آپ کی شکایت پر افسر کی طرف سے تازہ معلومات۔',
};

/** Same demo beat as the master §15 Ameerpet story: a streetlight "fix" fails verification. */
const SUSPICIOUS_ON_RESOLVE: Grievance['category'][] = ['streetlights'];
const TAMPERED = 'GRV-2026-000119';

async function register() {
  const { registerMockHandler, handlers, getDb } = await import('@mocks/index');
  const { verification, nowIso } = await import('@mocks/db');
  const builtIn = (pattern: string, method = 'POST') =>
    handlers.find((h) => h.method === method && h.pattern === pattern)!.fn;
  // English draft → its citizen-language text, so a sent draft keeps the wording the officer previewed.
  const drafted = new Map<string, string>();
  const find = (id: string) => getDb().grievances.find((g) => g.id === id);

  const DRAFT = '/officer/grievances/:id/draft-reply';
  const draft = builtIn(DRAFT);
  registerMockHandler('POST', DRAFT, async (ctx) => {
    const out = (await draft(ctx)) as { intent: ReplyIntent; draft_en: string; draft_citizen: Localized };
    const g = find(ctx.params.id);
    const text = g && REPLIES[g.language]?.[out.intent];
    if (text) {
      out.draft_citizen = { ...out.draft_citizen, original: text };
      drafted.set(out.draft_en, text);
    }
    return out;
  });

  const MESSAGE = '/officer/grievances/:id/message';
  const message = builtIn(MESSAGE);
  registerMockHandler('POST', MESSAGE, async (ctx) => {
    const msg = (await message(ctx)) as Message;
    msg.text.original = drafted.get(msg.text.en) ?? GENERIC[msg.text.lang] ?? msg.text.original;
    return msg;
  });

  // Disputes leave the queue once decided; the built-in keeps anything ever flagged suspicious.
  const QUEUE = '/officer/review-queue';
  const queue = builtIn(QUEUE, 'GET');
  registerMockHandler('GET', QUEUE, async (ctx) => {
    const out = (await queue(ctx)) as Paged<Grievance>;
    if (ctx.query.get('kind') !== 'disputed') return out;
    const items = out.items.filter((g) => ['resolved_pending_verification', 'reopened'].includes(g.status));
    return { ...out, items, total: items.length };
  });

  // B takes `delay_reason` as an object, so the mock unwraps it before the built-in stores it as text.
  const STATUS = '/officer/grievances/:id/status';
  const status = builtIn(STATUS);
  registerMockHandler('POST', STATUS, (ctx) => {
    const body = ctx.body as { delay_reason?: { reason?: string } };
    const reason = body.delay_reason?.reason;
    return status({ ...ctx, body: { ...body, delay_reason: reason } });
  });

  // Rehearses a broken chain on the Ameerpet case; B's scripts/tamper_demo.py does this for real.
  const VERIFY = '/admin/audit/verify';
  const verify = builtIn(VERIFY, 'GET');
  registerMockHandler('GET', VERIFY, async (ctx) => {
    const id = ctx.query.get('grievance_id');
    const timeline = id === TAMPERED ? find(id)?.timeline : undefined;
    if (timeline) {
      const broken = timeline[Math.floor(timeline.length / 2)];
      return { grievance_id: id, events_checked: timeline.indexOf(broken) + 1, valid: false, first_broken_event_id: broken.id };
    }
    return verify(ctx);
  });

  // Mirrors B: advancing the clock escalates breached cases, reports the counts, and raises an alert.
  const CLOCK = '/admin/demo/clock';
  const clock = builtIn(CLOCK);
  registerMockHandler('POST', CLOCK, async (ctx) => {
    const out = (await clock(ctx)) as object;
    const db = getDb();
    const open = db.grievances.filter((g) => !['closed', 'rejected', 'merged'].includes(g.status));
    const escalated_l1 = open.filter((g) => g.sla.breached && g.escalation_level === 0);
    const escalated_l2 = open.filter((g) => g.sla.breached && g.escalation_level === 1);
    escalated_l2.forEach((g) => (g.escalation_level = 2));
    escalated_l1.forEach((g) => (g.escalation_level = 1));
    const total = escalated_l1.length + escalated_l2.length;
    if (total > 0) {
      db.alerts.unshift({
        id: `alert-clock-${db.alerts.length}`,
        kind: 'overdue_critical',
        severity: 'critical',
        title_en: `${total} cases escalated after SLA breach`,
        detail_en: 'Overdue cases moved up the escalation ladder.',
        grievance_ids: [...escalated_l1, ...escalated_l2].map((g) => g.id),
        created_at: nowIso(),
      });
    }
    return {
      ...out,
      escalations: {
        escalated_l1: escalated_l1.length,
        escalated_l2: escalated_l2.length,
        auto_closed: 0,
        alerts: total > 0 ? 1 : 0,
      },
    };
  });

  const RESOLVE = '/officer/grievances/:id/resolve';
  const resolve = builtIn(RESOLVE);
  registerMockHandler('POST', RESOLVE, async (ctx) => {
    const out = (await resolve(ctx)) as Grievance;
    if (SUSPICIOUS_ON_RESOLVE.includes(out.category)) {
      out.ai_verification = verification(true, nowIso());
    }
    return out;
  });
}

if (API_MODE !== 'live') void register();
