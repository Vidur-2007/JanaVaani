// Spec C §11 stretch: S1 Surge Mode (banner → war room), S2 root-cause graph, S8 asset page + QR sheet. Mock mode.
import { expect, test, type Page } from '@playwright/test';

const ADMIN = { id: 'u-admin', role: 'admin', name: 'Commissioner Office', email: 'admin@janavaani.test', preferred_language: 'en', persona_en: '' };

async function signIn(page: Page) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, ADMIN);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

test('S1 surge banner → war room: counts, affected area, team board', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin');
  const banner = page.getByTestId('surge-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Charminar/);
  await page.getByTestId('surge-open').click();
  await expect(page).toHaveURL(/\/admin\/surge\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Charminar/);
  const counts = page.getByTestId('surge-counts');
  await expect(counts).toBeVisible();
  await expect(counts).not.toContainText('…');
  await expect(page.getByTestId('surge-board')).toBeVisible();
  await noOverflow(page);
});

test('S2 root-cause graph: rule-based cause, nodes link to cases, list fallback', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/alerts');
  await page.getByTestId('alert-war-room').first().click();
  const graph = page.getByTestId('root-cause-graph');
  await expect(graph).toBeVisible();
  await expect(page.getByTestId('root-cause-label')).not.toBeEmpty();
  await expect(graph).toContainText(/Suggested by rules/);
  const nodes = page.getByTestId('root-cause-node');
  expect(await nodes.count()).toBeGreaterThan(3);
  await page.getByRole('button', { name: /View as list/ }).click();
  await expect(page.getByTestId('root-cause-list')).toBeVisible();
  await page.getByRole('button', { name: /View as graph/ }).click();
  await nodes.first().click();
  await expect(page).toHaveURL(/\/officer\/case\/GRV-/);
});

test('S8 QR sheet defaults to reported assets; asset page shows history and QR', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/assets?ids=DR-CHR-0004,NOPE-0000');
  const sheet = page.getByTestId('qr-sheet');
  await expect(sheet.getByTestId('asset-qr')).toHaveCount(2);
  await expect(sheet).toContainText('Not found');
  await page.getByRole('link', { name: 'DR-CHR-0004' }).click();
  await expect(page.getByTestId('asset-title')).toContainText('Storm drain');
  await expect(page.getByTestId('asset-qr')).toBeVisible();
  await expect(page.getByTestId('asset-history')).toBeVisible();
  await page.goto('/admin/assets');
  await expect(page.getByTestId('qr-sheet').or(page.getByText('No reported assets yet'))).toBeVisible();
  await noOverflow(page);
});
