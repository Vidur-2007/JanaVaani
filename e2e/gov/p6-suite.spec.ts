// P6: the rest of Spec C §10, plus a phone-width sweep of every gov route.
import { expect, test, type Page } from '@playwright/test';

const ADMIN = {
  id: 'u-admin',
  role: 'admin',
  name: 'Commissioner Office',
  email: 'admin@janavaani.test',
  preferred_language: 'en',
  persona_en: '',
};
const ROUTES = [
  '/officer',
  '/officer/incidents',
  '/officer/case/GRV-2026-000101',
  '/officer/stats',
  '/supervisor',
  '/supervisor?kind=disputed',
  '/admin',
  '/admin/map',
  '/admin/departments',
  '/admin/officers',
  '/admin/analytics',
  '/admin/alerts',
  '/admin/audit',
  '/admin/ai',
  '/admin/reports',
  '/admin/demo',
];

async function signIn(page: Page) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, ADMIN);
}

test('officer demo login lands on a sorted inbox and reaches a sent reply', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 })),
  );
  await page.goto('/login');
  await page.locator('[data-testid^="demo-officer-"]').first().click();
  await expect(page).toHaveURL(/\/officer$/);
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  const row = page.getByTestId(mobile ? 'case-card' : 'table-row').first();
  await expect(row).toBeVisible();
  await row.getByRole('link').first().click();
  await expect(page.getByTestId('ai-brief')).toBeVisible();
  await page.getByTestId('draft-ai').click();
  await expect(page.locator('#case-reply')).not.toHaveValue('');
  const before = await page.getByTestId('message').count();
  await page.getByTestId('send-reply').click();
  await expect(page.getByTestId('message')).toHaveCount(before + 1);
});

test('backlog alerts open their review queue', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/alerts');
  const backlog = page.getByTestId('alert-card').filter({ hasText: 'Routing review backlog' });
  await backlog.getByRole('link').click();
  await expect(page).toHaveURL(/\/supervisor\?kind=routing/);
});

test('review queues page through more than one screen of cases', async ({ page }) => {
  await signIn(page);
  await page.goto('/supervisor');
  await expect(page.getByTestId('queue-card').first()).toBeVisible();
  await page.waitForFunction(() => '__jvMockDb' in window);
  await page.evaluate(() => {
    const db = (window as unknown as { __jvMockDb: () => { grievances: Record<string, unknown>[] } }).__jvMockDb();
    const source = db.grievances.find((g) => g.status === 'needs_review');
    for (let i = 0; i < 30; i++) {
      db.grievances.push({ ...JSON.parse(JSON.stringify(source)), id: `GRV-2026-9${String(i).padStart(5, '0')}` });
    }
    // Client navigation keeps the in-memory mock db that a reload would rebuild.
    history.pushState({}, '', '/supervisor?kind=routing&page=2');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('queue-page')).toHaveText('Page 2 of 2');
  await expect(page.getByTestId('queue-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  // Page 1 comes from the cache filled before the rows were added, so only the navigation is asserted here.
  await expect(page).toHaveURL(/kind=routing$/);
  await expect(page.getByTestId('queue-card').first()).toBeVisible();
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const route of ROUTES) {
    test(`${route} fits 360 px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await signIn(page);
      await page.goto(route);
      await expect(page.locator('main h1, main [data-testid="case-cockpit"]').first()).toBeVisible();
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
});
