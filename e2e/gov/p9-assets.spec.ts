// The case-to-asset link, the inbox and analytics export menus, and the gov screens in Urdu. S8 itself is in p8-stretch.
import { expect, test, type Page } from '@playwright/test';

const ADMIN = {
  id: 'u-admin',
  role: 'admin',
  name: 'Commissioner Office',
  email: 'admin@janavaani.test',
  preferred_language: 'en',
  persona_en: '',
};

async function signIn(page: Page) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, ADMIN);
}

test('a case links to its asset page', async ({ page }) => {
  await signIn(page);
  await page.goto('/officer/case/GRV-2026-000119');
  await page.getByTestId('asset-link').click();
  await expect(page).toHaveURL(/\/admin\/assets\/SL-KHB-0001$/);
  await expect(page.locator('main h1')).toBeVisible();
});

for (const [path, name] of [['/officer', 'inbox'], ['/admin/analytics', 'analytics']] as const) {
  test(`${name} exports CSV`, async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-chrome', 'download flow covered on desktop');
    await signIn(page);
    await page.goto(path);
    await expect(page.getByTestId('export-menu')).toBeEnabled();
    await page.getByTestId('export-menu').click();
    const wait = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'CSV' }).click();
    expect((await wait).suggestedFilename()).toMatch(new RegExp(`^${name}.*\\.csv$`));
  });
}

test.describe('gov screens in Urdu', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  for (const [route, heading] of [
    ['/officer', 'ان باکس'],
    ['/officer/case/GRV-2026-000101', null],
    ['/supervisor', 'جائزہ قطاریں'],
    ['/admin', 'کمانڈ سینٹر'],
    ['/admin/map', 'شہر کا نقشہ'],
    ['/admin/departments', 'محکمے'],
    ['/admin/analytics', 'تجزیہ'],
    ['/admin/alerts', 'الرٹس'],
    ['/admin/audit', 'آڈٹ'],
    ['/admin/ai', 'AI ماڈل'],
    ['/admin/reports', 'رپورٹس'],
    ['/admin/demo', 'ڈیمو کنٹرول'],
  ] as const) {
    test(`${route} reads right to left in Urdu`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((profile) => {
        localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
        localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'ur', onboarded: true }, version: 1 }));
      }, ADMIN);
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      else await expect(page.getByTestId('case-cockpit')).toBeVisible();
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
});
