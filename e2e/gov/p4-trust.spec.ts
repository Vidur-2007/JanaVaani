// P4: alerts, audit chain, AI model, demo controls, exports. Runs in mock mode, and against a dead API in hybrid mode.
import { readFileSync } from 'node:fs';
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

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test('alerts filter by severity, show spike detail and acknowledge', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/alerts');
  await expect(page.getByTestId('spike-detail').first()).toBeVisible();
  const all = await page.getByTestId('alert-card').count();
  await page.getByTestId('severity-critical').click();
  await expect(page.locator('[data-testid="alert-card"]:not([data-severity="critical"])')).toHaveCount(0);
  await page.getByTestId('severity-all').click();
  await expect(page.getByTestId('alert-card')).toHaveCount(all);
  await page.getByRole('button', { name: 'Acknowledge' }).first().click();
  await expect(page.getByRole('button', { name: 'Acknowledged' }).first()).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Acknowledged' }).first()).toBeVisible();
  await noOverflow(page);
});

test('audit verifies all chains and animates one case', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/audit');
  await page.getByTestId('verify-all').click();
  await expect(page.getByTestId('verify-all-result')).toContainText('Chain intact');
  await page.getByTestId('audit-ticket').fill('GRV-2026-000101');
  const row = page.getByTestId(isMobile(page) ? 'audit-card' : 'table-row').first();
  await expect(row).toContainText('GRV-2026-000101');
  await row.click();
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByTestId('chain-result')).toContainText('Chain intact');
  await expect(page.getByTestId('chain-blocks').locator('[data-state="idle"]')).toHaveCount(0);
  await noOverflow(page);
});

test('a tampered chain turns red at the break', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/audit');
  await page.getByTestId('audit-ticket').fill('GRV-2026-000119');
  const row = page.getByTestId(isMobile(page) ? 'audit-card' : 'table-row').first();
  await expect(row).toContainText('GRV-2026-000119');
  await row.click();
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByTestId('chain-result')).toContainText('Chain broken');
  await expect(page.getByTestId('chain-blocks').locator('[data-state="broken"]')).toHaveCount(1);
});

test('retrain adds a version', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/ai');
  await expect(page.getByTestId('confusion-matrix')).toBeVisible();
  const before = await page.getByTestId('version-row').count();
  const version = await page.getByTestId('model-version').innerText();
  await page.getByTestId('retrain').click();
  await expect(page.getByTestId('version-row')).toHaveCount(before + 1);
  await expect(page.getByTestId('model-version')).not.toHaveText(version);
  await expect(page.getByTestId('retrain-gain')).toBeVisible();
  await noOverflow(page);
});

test('time travel fires escalations and changes the alert count', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/alerts');
  await expect(page.getByTestId('alert-card').first()).toBeVisible();
  const before = await page.getByTestId('alert-card').count();
  await page.getByRole('link', { name: 'Demo controls' }).click({ timeout: 3000 }).catch(() => page.goto('/admin/demo'));
  await expect(page).toHaveURL(/\/admin\/demo/);
  const now = await page.getByTestId('virtual-now').innerText();
  await page.getByTestId('advance-48').click();
  await expect(page.getByText(/escalation/i).first()).toBeVisible();
  await expect(page.getByTestId('virtual-now')).not.toHaveText(now);
  // Client navigation keeps the in-memory mock state a reload would rebuild.
  await page.evaluate(() => {
    history.pushState({}, '', '/admin/alerts');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('alert-card')).not.toHaveCount(before);
});

test('reset needs confirmation', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/demo');
  await page.getByTestId('reset-open').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByText('Demo data restored')).toBeVisible();
  await expect(page.getByTestId('provider-health')).toBeVisible();
});

test('report builder exports CSV, Excel and PDF', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'download flow covered on desktop');
  await signIn(page);
  await page.goto('/admin/reports');
  await expect(page.getByTestId('report-section')).toHaveCount(4);
  await page.getByLabel('Alerts').click();
  await expect(page.getByTestId('report-section')).toHaveCount(3);
  for (const [item, ext] of [['CSV', '.csv'], ['Excel', '.xlsx'], ['PDF', '.pdf']] as const) {
    await page.getByTestId('export-menu').click();
    const wait = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: item }).click();
    const file = await wait;
    expect(file.suggestedFilename()).toMatch(new RegExp(`janavaani-report-30d\\${ext}$`));
    const bytes = readFileSync(await file.path());
    expect(bytes.length).toBeGreaterThan(100);
    if (ext === '.pdf') expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    if (ext === '.xlsx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
  }
});

test('a Telugu report exports through the raster PDF path', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'download flow covered on desktop');
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'te', onboarded: true }, version: 1 }));
  }, ADMIN);
  await page.goto('/admin/reports');
  await expect(page.getByTestId('report-section')).toHaveCount(4);
  await page.getByTestId('export-menu').click();
  const wait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'PDF' }).click();
  const bytes = readFileSync(await (await wait).path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  // A raster page embeds the screenshot, so it is far larger than a text table.
  expect(bytes.length).toBeGreaterThan(50_000);
});

test('hybrid mode falls back to mocks and counts it', async ({ page }) => {
  test.skip(!process.env.E2E_HYBRID, 'needs a hybrid build');
  await signIn(page);
  await page.goto('/admin/demo');
  await expect(page.getByTestId('api-mode')).toHaveText('hybrid');
  await expect(page.getByTestId('provider-health')).toBeVisible();
  await expect(page.getByTestId('fallback-count')).not.toHaveText('0');
});
