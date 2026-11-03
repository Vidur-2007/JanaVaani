// P1: login demo buttons (role redirects) and first-run onboarding (mock mode).
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Fresh browser state, English UI, not onboarded.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('jv.e2e.init')) {
      localStorage.clear();
      localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en' }, version: 1 }));
      sessionStorage.setItem('jv.e2e.init', '1');
    }
  });
});

test('demo citizen → onboarding (language, consent, accessibility) → citizen home', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('demo-citizen-u-lakshmi').click();
  await expect(page).toHaveURL(/\/onboarding\?next=/);

  // Step 1: pick Telugu, the UI switches immediately.
  await page.getByTestId('onb-lang-te').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await page.getByTestId('onb-next').click();
  // Step 2: consent.
  await page.getByTestId('onb-next').click();
  // Step 3: accessibility — large text applies globally.
  await page.getByTestId('onb-a11y-large_text').click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'large');
  await page.getByTestId('onb-next').click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('tile-voice')).toBeVisible();
  // Onboarding is first-run only.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app$/);
});

for (const [testId, url] of [
  ['demo-officer-u-ravi', /\/officer$/],
  ['demo-supervisor-u-supervisor', /\/officer$/],
  ['demo-admin-u-admin', /\/admin$/],
] as const) {
  test(`demo button ${testId} redirects by role`, async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId(testId).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  });
}

test('continue as guest → onboarding → app', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('guest-login').click();
  await expect(page).toHaveURL(/\/onboarding/);
  for (let i = 0; i < 3; i++) await page.getByTestId('onb-next').click();
  await expect(page).toHaveURL(/\/app$/);
});

test('guarded deep link returns to the requested page after login', async ({ page }) => {
  await page.goto('/admin/map');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmap/);
  await page.getByTestId('demo-admin-u-admin').click();
  await expect(page).toHaveURL(/\/admin\/map$/);
});
