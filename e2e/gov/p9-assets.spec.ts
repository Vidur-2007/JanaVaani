// Spec C §11 S8 (asset page and QR sheet) and the export menus added on the inbox and analytics.
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

test('a case links to its asset, which shows history and a QR code', async ({ page }) => {
  await signIn(page);
  await page.goto('/officer/case/GRV-2026-000119');
  await page.getByTestId('asset-link').click();
  await expect(page).toHaveURL(/\/admin\/assets\/SL-KHB-0001$/);
  await expect(page.getByTestId('asset-qr')).toBeVisible();
  // This asset has an open complaint and no closed history yet, so the open list carries the case.
  await expect(page.getByRole('link', { name: 'GRV-2026-000119' })).toBeVisible();
  await expect(page.getByText('No complaints recorded for this asset')).toBeVisible();
});

test('the QR sheet prints the ward assets and accepts more by id', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/assets/SL-KHB-0001');
  await page.getByTestId('asset-sheet-link').click();
  await expect(page).toHaveURL(/\/admin\/assets\/sheet/);
  await expect(page.getByTestId('qr-card').first()).toBeVisible();
  const before = await page.getByTestId('qr-card').count();
  await page.getByLabel('Asset ID').fill('SL-NOPE-9999');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toContainText('SL-NOPE-9999');
  await expect(page.getByTestId('qr-card')).toHaveCount(before);
  await expect(page.getByTestId('print-sheet')).toBeEnabled();
});

test('officers cannot open asset pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jv.mockAuth', JSON.stringify({ id: 'u-ravi', role: 'officer', name: 'Ravi Kumar', email: 'ravi.roads@janavaani.test', preferred_language: 'en', department_id: 'roads', persona_en: '' }));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  });
  await page.goto('/admin/assets/SL-KHB-0001');
  await expect(page).toHaveURL(/\/officer$/);
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
