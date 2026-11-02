// P5: public portal without login, plus realtime arrivals staged through the mock event log.
import { expect, test, type Page } from '@playwright/test';

const SUPERVISOR = {
  id: 'u-supervisor',
  role: 'supervisor',
  name: 'Deputy Commissioner',
  email: 'supervisor@janavaani.test',
  preferred_language: 'en',
  persona_en: '',
};
const POLL_MS = 26_000;

async function prefs(page: Page, ui_lang = 'en') {
  await page.addInitScript((lang) => {
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: lang, onboarded: true }, version: 1 }));
  }, ui_lang);
}

async function signIn(page: Page) {
  await prefs(page);
  await page.addInitScript((profile) => localStorage.setItem('jv.mockAuth', JSON.stringify(profile)), SUPERVISOR);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

/** Adds to the page's in-memory mock db, then queues the signal the 20 s poll picks up. */
const stage = (page: Page, fn: string) =>
  page.waitForFunction(() => '__jvMockDb' in window).then(() =>
    page.evaluate((body) => {
      const db = (window as unknown as { __jvMockDb: () => Record<string, never> }).__jvMockDb();
      new Function('db', body)(db);
    }, fn),
  );

test('public portal needs no login and shows every section', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prefs(page);
  await page.goto('/public');
  await expect(page).toHaveURL(/\/public$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.getByTestId('public-hero').locator('> *')).toHaveCount(3);
  await expect(page.getByTestId('gov-map')).toBeVisible();
  await expect(page.getByTestId('report-card').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Zone comparison' })).toBeVisible();
  await expect(page.getByTestId('fixed-card').first()).toBeVisible();
  await expect(page.getByTestId('methodology')).toContainText('75 metres');
  await page.getByRole('button', { name: 'Water Supply' }).click();
  await expect(page.getByRole('button', { name: 'Water Supply' })).toHaveAttribute('aria-pressed', 'true');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('public portal fits a 360 px phone with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await prefs(page);
  await page.goto('/public');
  await expect(page.getByTestId('report-card').first()).toBeVisible();
  await noOverflow(page);
});

for (const [lang, title, dir] of [
  ['te', 'మీ నగరం ఎలా స్పందిస్తోంది', 'ltr'],
  ['hi', 'आपका शहर कैसे जवाब दे रहा है', 'ltr'],
  ['ur', 'آپ کا شہر کیسے جواب دے رہا ہے', 'rtl'],
] as const) {
  test(`public portal reads in ${lang}`, async ({ page }) => {
    await prefs(page, lang);
    await page.goto('/public');
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await noOverflow(page);
  });
}

test('a new alert glows on the alerts page', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'waits on the 20 s poll');
  test.setTimeout(60_000);
  await signIn(page);
  await page.goto('/admin/alerts');
  await expect(page.getByTestId('alert-card').first()).toBeVisible();
  await stage(
    page,
    `db.alerts.unshift({ id: 'live-1', kind: 'spike', severity: 'info', title_en: 'Staged alert', detail_en: 'x', grievance_ids: [], created_at: new Date().toISOString() });
     db.live_events.push({ id: 'ev-a', audience: 'role:admin', kind: 'alert', created_at: new Date().toISOString() });`,
  );
  await expect(page.locator('[data-testid="alert-card"][data-fresh]')).toContainText('Staged alert', { timeout: POLL_MS });
});

test('a new case slides into the inbox with a toast', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'waits on the 20 s poll');
  test.setTimeout(60_000);
  await signIn(page);
  await page.goto('/officer');
  await expect(page.getByTestId('table-row').first()).toBeVisible();
  await stage(
    page,
    `const open = db.grievances.find((g) => g.status === 'assigned');
     const copy = JSON.parse(JSON.stringify(open));
     copy.id = 'GRV-2026-999001'; copy.title.en = 'Staged arrival'; copy.is_emergency = true; copy.priority_score = 100;
     db.grievances.push(copy);
     db.live_events.push({ id: 'ev-g', audience: 'role:admin', kind: 'grievance_created', grievance_id: copy.id, created_at: new Date().toISOString() });`,
  );
  await expect(page.locator('[data-testid="table-row"][data-fresh]')).toContainText('Staged arrival', { timeout: POLL_MS });
  await expect(page.getByText('New case assigned')).toBeVisible();
});

test('command center KPIs pulse and the open case shows it was updated', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'waits on the 20 s poll');
  test.setTimeout(60_000);
  await signIn(page);
  await page.goto('/officer/case/GRV-2026-000101');
  await expect(page.getByTestId('ai-brief')).toBeVisible();
  await stage(
    page,
    `db.live_events.push({ id: 'ev-c', audience: 'role:admin', kind: 'grievance_updated', grievance_id: 'GRV-2026-000101', created_at: new Date().toISOString() });`,
  );
  await expect(page.getByTestId('case-updated')).toContainText('Updated just now', { timeout: POLL_MS });

  await page.goto('/admin');
  await expect(page.getByTestId('kpi-grid').locator('> *')).toHaveCount(8);
  await page.evaluate(() => {
    new MutationObserver((records) => {
      if (records.some((r) => (r.target as Element).hasAttribute('data-pulsing'))) {
        document.body.dataset.sawPulse = 'yes';
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-pulsing'] });
  });
  await stage(
    page,
    `const open = db.grievances.find((g) => g.status === 'assigned');
     const copy = JSON.parse(JSON.stringify(open));
     copy.id = 'GRV-2026-999002'; copy.created_at = new Date().toISOString();
     db.grievances.push(copy);
     db.live_events.push({ id: 'ev-k', audience: 'role:admin', kind: 'grievance_created', grievance_id: copy.id, created_at: new Date().toISOString() });`,
  );
  await expect(page.locator('body')).toHaveAttribute('data-saw-pulse', 'yes', { timeout: POLL_MS });
});
