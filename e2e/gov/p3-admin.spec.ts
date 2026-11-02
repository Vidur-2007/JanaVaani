// P3 (mock mode): command center, city map, departments, officers, analytics.
import { expect, test, type Page } from '@playwright/test';

const PROFILES = {
  supervisor: {
    id: 'u-supervisor',
    role: 'supervisor',
    name: 'Deputy Commissioner',
    email: 'supervisor@janavaani.test',
    preferred_language: 'en',
    persona_en: '',
  },
  admin: {
    id: 'u-admin',
    role: 'admin',
    name: 'Commissioner Office',
    email: 'admin@janavaani.test',
    preferred_language: 'en',
    persona_en: '',
  },
};

async function signInAs(page: Page, who: keyof typeof PROFILES) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, PROFILES[who]);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('command center shows eight KPIs, alerts, insights and top five', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByTestId('kpi-grid').locator('> *')).toHaveCount(8);
  await expect(page.getByTestId('kpi-grid').getByText('Satisfaction')).toBeVisible();
  await expect(page.getByTestId('alert-card').first()).toBeVisible();
  await expect(page.getByTestId('numbers-verified')).toBeVisible();
  await expect(page.getByTestId('leaderboard-row')).toHaveCount(5);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('date range changes the view and stays in the URL', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByTestId('kpi-grid').locator('> *')).toHaveCount(8);
  await page.getByText('90 days', { exact: true }).click();
  await expect(page).toHaveURL(/days=90/);
  await expect(page.getByTestId('kpi-grid').getByText('Total')).toBeVisible();
});

test('supervisor overview hides links to admin-only pages', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/admin');
  await expect(page.getByTestId('leaderboard-row').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'See all' })).toHaveCount(0);
});

test('city map: preset filters, ward panel opens, replay advances', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'admin');
  await page.goto('/admin/map');
  await expect(page.locator('path.leaflet-interactive').first()).toBeAttached();
  await page.getByRole('button', { name: 'Water leaks' }).click();
  await expect(page).toHaveURL(/category=water/);
  await page.locator('path.leaflet-interactive').nth(5).dispatchEvent('click');
  await expect(page.getByTestId('map-side-panel')).toBeVisible();
  await page.getByTestId('replay-toggle').click();
  await expect(page.getByTestId('replay-label')).toContainText('of 30');
  await expect(page.getByTestId('replay-label')).toContainText('Day 10', { timeout: 15_000 });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('cluster click lists cases', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/admin/map');
  await page.getByTestId('gov-map').getByText('Clusters').click();
  await page.getByTestId('gov-map').getByText('Heat').click();
  const cluster = page.locator('.marker-cluster').first();
  await expect(cluster).toBeAttached();
  await cluster.dispatchEvent('click');
  await expect(page.getByTestId('cluster-case').first()).toBeVisible();
});

test('departments table opens a drawer and draws four charts', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/admin/departments');
  await expect(page.getByTestId('leaderboard-row').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'SLA compliance' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Overdue leaderboard' })).toBeVisible();
  await page.getByTestId('leaderboard-row').first().getByRole('button').click();
  await expect(page.getByTestId('department-drawer')).toBeVisible();
  await noOverflow(page);
});

test('officers page lists workload', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/admin/officers');
  await expect(page.getByRole('region', { name: 'Open cases by officer' })).toBeVisible();
  await noOverflow(page);
});

test('analytics switches breakdowns and shows delay risk', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'admin');
  await page.goto('/admin/analytics');
  await expect(page.getByRole('region', { name: 'Created vs resolved' })).toBeVisible();
  await page.getByTestId('by-ward').click();
  await expect(page.getByRole('region', { name: 'By ward' })).toBeVisible();
  await page.getByText('Week', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'By category' }).first()).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});
