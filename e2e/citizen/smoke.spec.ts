// P0 smoke test (mock mode): landing loads, and every top-level route renders without hitting the error boundary.
import { expect, test, type Page } from '@playwright/test';

const DEMO = {
  citizen: {
    id: 'u-lakshmi',
    role: 'citizen',
    name: 'Lakshmi Devi',
    email: 'lakshmi@janavaani.test',
    preferred_language: 'te',
    persona_en: '',
  },
  admin: {
    id: 'u-admin',
    role: 'admin',
    name: "Commissioner's Office",
    email: 'admin@janavaani.test',
    preferred_language: 'en',
    persona_en: '',
  },
  supervisor: {
    id: 'u-supervisor',
    role: 'supervisor',
    name: 'Deputy Commissioner',
    email: 'supervisor@janavaani.test',
    preferred_language: 'en',
    persona_en: '',
  },
};

async function signInAs(page: Page, who: keyof typeof DEMO) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem(
      'jv.prefs',
      JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }),
    );
  }, DEMO[who]);
}

async function expectRendered(page: Page) {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

test('landing loads with hero and CTA', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('cta-voice')).toBeVisible();
  await expect(page.getByTestId('hero-fallback')).toBeAttached();
  await expectRendered(page);
  expect(errors).toEqual([]);
});

test('public citizen routes render', async ({ page }) => {
  for (const path of [
    '/login',
    '/onboarding',
    '/track',
    '/guide',
    '/r/SL-KHB-0001',
    '/print/receipt/GRV-2026-000101',
  ]) {
    await page.goto(path);
    await expect(page.locator('main, [data-testid]').first()).toBeVisible();
    await expectRendered(page);
  }
});

test('citizen app routes render for a signed-in citizen', async ({ page }) => {
  await signInAs(page, 'citizen');
  await page.goto('/app');
  await expect(page.getByTestId('tile-voice')).toBeVisible();
  await expect(page.getByTestId('grievance-card').first()).toBeVisible();
  for (const path of [
    '/app/report',
    '/app/report/quick',
    '/app/complaints',
    '/app/notifications',
    '/app/nearby',
    '/app/settings',
  ]) {
    await page.goto(path);
    await expectRendered(page);
  }
  await page.goto('/app/complaints/GRV-2026-000101');
  await expect(page.getByTestId('grievance-detail')).toBeVisible();
});

test('gov routes render for admin and supervisor', async ({ page }) => {
  await signInAs(page, 'admin');
  for (const path of [
    '/officer',
    '/officer/case/GRV-2026-000101',
    '/supervisor',
    '/admin',
    '/admin/map',
    '/admin/ai',
  ]) {
    await page.goto(path);
    await expect(page.getByTestId('gov-placeholder')).toBeVisible();
    await expectRendered(page);
  }
  await page.goto('/officer');
  await expect(page.getByTestId('inbox-stub')).toBeVisible();
});

test('public dashboard renders without login', async ({ page }) => {
  await page.goto('/public');
  await expect(page.getByTestId('gov-placeholder')).toBeVisible();
  await expectRendered(page);
});

test('guarded route redirects to login; unknown route shows 404', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto('/definitely-not-a-page');
  await expect(page.getByTestId('not-found')).toBeVisible();
});

test('demo login → citizen home, Urdu flips to RTL', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('demo-citizen-u-lakshmi').click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/settings');
  await page.getByRole('radio', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expectRendered(page);
});
