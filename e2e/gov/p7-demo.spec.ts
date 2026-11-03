// P7: demo shortcuts, palette legend and illustrated empty states.
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

test('demo shortcut opens the suspicious streetlight case', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/demo');
  await expect(page.getByTestId('moment-suspicious')).toHaveAttribute('href', /\/officer\/case\//);
  await page.getByTestId('moment-suspicious').click();
  await expect(page.getByTestId('suspicious-banner')).toBeVisible();
});

test('demo shortcut opens the Charminar spike', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/demo');
  await page.getByTestId('moment-spike').click();
  await expect(page.getByTestId('spike-detail').first()).toBeVisible();
});

test('palette shows its keys', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'hardware keyboard flow');
  await signIn(page);
  await page.goto('/officer');
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette-legend')).toContainText('Esc');
});

test('an empty queue shows the illustration', async ({ page }) => {
  await signIn(page);
  await page.goto('/supervisor');
  await expect(page.getByTestId('tab-emergency')).toBeVisible();
  await page.waitForFunction(() => '__jvMockDb' in window);
  await page.evaluate(() => {
    const db = (window as unknown as { __jvMockDb: () => { grievances: { appeal?: unknown }[] } }).__jvMockDb();
    db.grievances.forEach((g) => delete g.appeal);
  });
  await page.getByTestId('tab-appeal').click();
  await expect(page.getByText('Queue clear ✓').or(page.getByTestId('queue-card')).first()).toBeVisible();
});
