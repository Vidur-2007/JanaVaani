// The case-to-asset link and the export menus added on the inbox and analytics. S8 itself is covered in p8-stretch.
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
