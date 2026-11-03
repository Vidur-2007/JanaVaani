// P6: hybrid mode must never show broken UI. Opt-in: run against a build made with VITE_API_MODE=hybrid, e.g.
//   VITE_API_MODE=hybrid npm run build && npm run preview -w apps/web -- --port 4175
//   E2E_HYBRID=1 E2E_BASE_URL=http://localhost:4175 npx playwright test e2e/citizen/hybrid.spec.ts
// The API is made unreachable / 404 / 501 / token-less 401 with page.route; every page must still render
// (from mocks) without the error boundary or an error state.
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.E2E_HYBRID, 'needs a VITE_API_MODE=hybrid build (set E2E_HYBRID=1)');

const LAKSHMI = { id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' };
const API = /\/api\/v1\//;

async function signIn(page: Page) {
  await page.addInitScript((who) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(who));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, LAKSHMI);
}

const PAGES = ['/', '/app', '/app/complaints', '/app/complaints/GRV-2026-000119', '/app/notifications', '/app/nearby', '/app/settings', '/guide', '/track'];

for (const [label, fail] of [
  ['API unreachable', (p: Page) => p.route(API, (r) => r.abort('connectionrefused'))],
  ['API 404/501', (p: Page) => p.route(API, (r) => r.fulfill({ status: r.request().url().includes('/speech') ? 501 : 404, json: { error: { code: 'not_found', message: 'nope' } } }))],
  ['API 401 without token', (p: Page) => p.route(API, (r) => r.fulfill({ status: 401, json: { error: { code: 'unauthorized', message: 'no token' } } }))],
] as const) {
  test(`${label}: citizen pages fall back to mocks without broken UI`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fail(page);
    await signIn(page);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('#root')).not.toBeEmpty();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('error-boundary'), path).toHaveCount(0);
      await expect(page.getByTestId('error-state'), path).toHaveCount(0);
    }
    await page.goto('/app/report?mode=text');
    await page.getByTestId('composer-input').fill('Garbage not collected for a week near the park');
    await page.getByTestId('composer-input').press('Enter');
    await expect(page.locator('[data-role="bot"]').nth(1)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('sleeping API (requests hang): the home screen falls back to mocks after the time limit', async ({ page }) => {
  test.setTimeout(90_000);
  // Never answer: like a free Hugging Face Space waking from sleep.
  await page.route(API, () => undefined);
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByTestId('tile-voice')).toBeVisible();
  await expect(page.getByText('Lakshmi', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
});
