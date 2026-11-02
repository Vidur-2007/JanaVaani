// Smoke-checks the mock layer: every endpoint (#1–#57) answers, and submit → track works in memory.
// Run: npm run test:mocks
import { DEMO_USERS, GUEST_PROFILE, getDb, handlers, pinFor, runMock, type MockProfile } from '../../../packages/contracts/mocks/index';
import type { ChatTurnResponse, GrievanceDetail, GrievanceDraft, Paged, Grievance } from '../../../packages/contracts/src/types';

const by = (role: string) => DEMO_USERS.find((u) => u.role === role)!;
const citizen = by('citizen');
const officer = by('officer');
const supervisor = by('supervisor');
const admin = by('admin');

let failures = 0;
const seen = new Set<string>();
async function call<T>(method: string, path: string, body: unknown, user: MockProfile | null, pattern?: string): Promise<T> {
  try {
    const out = (await runMock(method, path, body, user)) as T;
    if (pattern) seen.add(`${method} ${pattern}`);
    return out;
  } catch (e) {
    failures++;
    console.error(`✗ ${method} ${path}:`, (e as Error).message);
    return undefined as T;
  }
}

async function main() {
  const any = (await call<Paged<Grievance>>('GET', '/me/grievances', null, citizen, '/me/grievances')).items[0];
  const g = getDb().grievances[0];
  const pending = getDb().grievances.find((x) => x.status === 'resolved_pending_verification')!;
  const appealed = getDb().grievances.find((x) => x.appeal)!;
  const ward = getDb().grievances[0].location;

  // Chat: text → follow-ups → confirm → (duplicates) → submitted
  let r = await call<ChatTurnResponse>('POST', '/chat/turn', { text: 'Miyapur X roads lo pedda gunta undi', input_mode: 'text', ui_lang: 'te', location: { lat: 17.4968, lng: 78.3614, source: 'gps' } }, GUEST_PROFILE, '/chat/turn');
  for (let i = 0; i < 4 && r.stage === 'collecting'; i++) r = await call('POST', '/chat/turn', { session_id: r.session_id, text: 'very large, 2 weeks', input_mode: 'text', ui_lang: 'te' }, GUEST_PROFILE);
  r = await call('POST', '/chat/turn', { session_id: r.session_id, action: 'confirm', input_mode: 'text', ui_lang: 'te' }, GUEST_PROFILE);
  console.log('chat after confirm →', r.stage, r.duplicates?.length ?? 0, 'duplicates');
  if (r.stage === 'duplicate_check') r = await call('POST', '/chat/turn', { session_id: r.session_id, action: 'file_new_anyway', input_mode: 'text', ui_lang: 'te' }, GUEST_PROFILE);
  const sub = r.submitted![0];
  console.log('submitted', sub.grievance_id, 'pin', sub.guest_pin);
  const tracked = await call<GrievanceDetail>('GET', `/grievances/${sub.grievance_id}?pin=${sub.guest_pin}`, null, null, '/grievances/:id');
  if (tracked.id !== sub.grievance_id) throw new Error('track by pin failed');

  // Emergency
  const em = await call<ChatTurnResponse>('POST', '/chat/turn', { text: 'మా స్కూల్ దగ్గర కరెంటు తీగ తెగి రోడ్డుపై పడింది', input_mode: 'voice', ui_lang: 'te' }, citizen);
  if (em.stage !== 'emergency') throw new Error(`expected emergency, got ${em.stage}`);

  const draft = await call<GrievanceDraft>('POST', '/grievances/analyze', { text: 'Garbage not collected for a week near the park', ui_lang: 'en', location: ward }, citizen, '/grievances/analyze');
  const created = await call<{ grievance: Grievance }>('POST', '/grievances', { draft, location: ward, media_ids: [], is_anonymous: false, is_private: false }, citizen, '/grievances');
  await call('POST', '/grievances/check-duplicates', { text: 'pothole', location: { lat: 17.4968, lng: 78.3614, source: 'gps' }, category: 'roads' }, citizen, '/grievances/check-duplicates');
  await call('POST', `/grievances/${g.id}/support`, {}, citizen, '/grievances/:id/support');
  await call('POST', `/grievances/${pending.id}/feedback`, { accepted: false, comment: 'still broken' }, officer, '/grievances/:id/feedback');
  await call('POST', `/officer/grievances/${pending.id}/resolve`, { media_ids: [], note: 'fixed' }, officer, '/officer/grievances/:id/resolve');
  await call('POST', `/grievances/${pending.id}/reopen`, { reason: 'not fixed' }, officer, '/grievances/:id/reopen');
  await call('POST', `/grievances/${created.grievance.id}/appeal`, { reason: 'Not done properly' }, citizen, '/grievances/:id/appeal');
  await call('POST', `/grievances/${created.grievance.id}/messages`, { text: 'Any update?', ui_lang: 'en' }, citizen, '/grievances/:id/messages');
  await call('POST', '/uploads', null, citizen, '/uploads');
  await call('POST', '/speech/transcribe', null, citizen, '/speech/transcribe');
  try {
    await runMock('POST', '/speech/tts', { text: 'hi', lang: 'te' }, citizen);
  } catch (e) {
    if ((e as { status?: number }).status === 501) seen.add('POST /speech/tts');
  }
  await call('POST', '/translate', { text: 'నమస్తే', target_lang: 'en' }, citizen, '/translate');
  await call('GET', '/search?q=water&scope=public', null, citizen, '/search');
  await call('POST', '/guide/ask', { question: 'How do appeals work?', ui_lang: 'en' }, null, '/guide/ask');
  await call('GET', '/notifications', null, citizen, '/notifications');
  await call('POST', '/notifications/all/read', null, citizen, '/notifications/:id/read');
  for (const p of ['/meta/departments', '/meta/wards', '/meta/wards.geojson', '/meta/emergency-contacts', '/public/stats', '/public/map', '/health'])
    await call('GET', p, null, null, p);
  await call('GET', '/meta/assets/AST-0001', null, null, '/meta/assets/:id');
  await call('GET', '/public/nearby?lat=17.4968&lng=78.3614&radius_m=2000', null, null, '/public/nearby');
  const inbox = await call<Paged<Grievance>>('GET', '/officer/inbox', null, officer, '/officer/inbox');
  const oid = inbox.items[0]?.id ?? g.id;
  await call('GET', '/officer/review-queue?kind=routing', null, supervisor, '/officer/review-queue');
  await call('POST', `/officer/grievances/${oid}/status`, { status: 'in_progress' }, officer, '/officer/grievances/:id/status');
  await call('POST', `/officer/grievances/${oid}/notes`, { text: 'Visited site' }, officer, '/officer/grievances/:id/notes');
  await call('POST', `/officer/grievances/${oid}/reassign`, { reason: 'test' }, officer, '/officer/grievances/:id/reassign');
  await call('POST', `/officer/grievances/${oid}/route-decision`, { department_id: 'roads' }, supervisor, '/officer/grievances/:id/route-decision');
  await call('POST', `/officer/grievances/${oid}/emergency`, { confirmed: true }, supervisor, '/officer/grievances/:id/emergency');
  await call('POST', `/officer/grievances/${oid}/brief`, {}, officer, '/officer/grievances/:id/brief');
  await call('POST', `/officer/grievances/${oid}/draft-reply`, { intent: 'acknowledge' }, officer, '/officer/grievances/:id/draft-reply');
  await call('POST', `/officer/grievances/${oid}/message`, { text_en: 'We are on it.' }, officer, '/officer/grievances/:id/message');
  await call('POST', `/officer/grievances/${appealed.id}/appeal-decision`, { decision: 'dismissed', note: 'ok' }, supervisor, '/officer/grievances/:id/appeal-decision');
  await call('POST', '/officer/bulk', { ids: [oid], action: 'status', payload: { status: 'in_progress' } }, officer, '/officer/bulk');
  await call('GET', '/officer/officers', null, officer, '/officer/officers');
  await call('GET', '/officer/incidents', null, officer, '/officer/incidents');
  for (const p of ['/admin/kpis', '/admin/departments/performance', '/admin/officers/workload', '/admin/analytics/trends', '/admin/analytics/breakdown', '/admin/map', '/admin/alerts', '/admin/insights', '/admin/audit', '/admin/audit/verify', '/admin/ai/metrics', '/admin/demo/clock'])
    await call('GET', p, null, admin, p);
  await call('POST', '/admin/ai/retrain', {}, admin, '/admin/ai/retrain');
  await call('POST', '/admin/demo/clock', { advance_hours: 48 }, admin, '/admin/demo/clock');
  const v = await call<{ valid: boolean; events_checked: number }>('GET', '/admin/audit/verify', null, admin);
  console.log('audit chain valid:', v.valid, 'events:', v.events_checked);
  await call('POST', '/admin/demo/reset', {}, admin, '/admin/demo/reset');

  const all = handlers.map((h) => `${h.method} ${h.pattern}`);
  const missed = all.filter((k) => !seen.has(k));
  console.log(`grievances: ${getDb().grievances.length}, handlers: ${all.length}, exercised: ${all.length - missed.length}`);
  console.log('sample citizen grievance:', any?.id, '· pin of first seeded:', pinFor(getDb().grievances[getDb().grievances.length - 1].id));
  if (missed.length) console.error('not exercised:', missed);
  if (failures || missed.length || !v.valid) process.exit(1);
  console.log('✓ mock layer OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
