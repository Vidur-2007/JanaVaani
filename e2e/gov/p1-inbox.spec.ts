// P1 (mock mode): role nav, palette, inbox order and filters, bulk undo, incidents, map layers, 360 px.
import { expect, test, type Page } from '@playwright/test';

const PROFILES = {
  officer: {
    id: 'u-ravi',
    role: 'officer',
    name: 'Ravi Kumar',
    email: 'ravi.roads@janavaani.test',
    preferred_language: 'en',
    department_id: 'roads',
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
  admin: {
    id: 'u-admin',
    role: 'admin',
    name: 'Commissioner Office',
    email: 'admin@janavaani.test',
    preferred_language: 'en',
    persona_en: '',
  },
};

async function signInAs(page: Page, who: keyof typeof PROFILES, lang = 'en') {
  await page.addInitScript(
    ([profile, ui_lang]) => {
      localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
      localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang, onboarded: true }, version: 1 }));
    },
    [PROFILES[who], lang] as const,
  );
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const rows = (page: Page) => page.getByTestId(isMobile(page) ? 'case-card' : 'table-row');

test('officers cannot reach admin pages', async ({ page }) => {
  await signInAs(page, 'officer');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/officer$/);
  await expect(rows(page).first()).toBeVisible();
});

test('supervisors get the overview but not admin-only pages', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/admin/audit');
  await expect(page).toHaveURL(/\/officer$/);
  await page.goto('/admin');
  await expect(page.getByTestId('alert-card').first()).toBeVisible();
});

test('inbox lists emergencies first, and summary tiles filter through the URL', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/officer');
  await expect(rows(page).first()).toBeVisible();
  const emergencies = await rows(page).evaluateAll((els) =>
    els.map((el) => !!el.querySelector('[data-flag="emergency"]')),
  );
  const firstNormal = emergencies.indexOf(false);
  expect(firstNormal === -1 || !emergencies.slice(firstNormal).includes(true)).toBe(true);

  await page.getByTestId('summary-critical').click();
  await expect(page).toHaveURL(/priority=critical/);
  await expect(page.getByTestId('summary-critical')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page).first().locator('[data-priority]')).toHaveAttribute('data-priority', 'critical');
  await expect(rows(page).locator('[data-priority]:not([data-priority="critical"])')).toHaveCount(0);

  await page.getByTestId('summary-open').click();
  await expect(page).not.toHaveURL(/priority=/);
});

test('search finds a ticket by exact id', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/officer');
  await page.getByTestId('filter-search').fill('GRV-2026-000101');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('GRV-2026-000101');
});

test('palette opens a ticket from the keyboard', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'hardware keyboard flow');
  await signInAs(page, 'officer');
  await page.goto('/officer');
  await expect(rows(page).first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('101');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/officer\/case\/GRV-\d{4}-000101$/);
});

test('j/k moves between rows and Enter opens one', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'hardware keyboard flow');
  await signInAs(page, 'supervisor');
  await page.goto('/officer');
  await expect(rows(page).first()).toBeVisible();
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(rows(page).nth(1)).toBeFocused();
  await page.keyboard.press('k');
  await expect(rows(page).first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/officer\/case\//);
});

test('bulk action confirms and can be undone', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'covered by desktop');
  await signInAs(page, 'supervisor');
  await page.goto('/officer');
  await rows(page).first().getByRole('checkbox').click();
  await rows(page).nth(1).getByRole('checkbox').click();
  await expect(page.getByTestId('bulk-bar')).toContainText('2 selected');
  await page.getByRole('button', { name: 'Set status' }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: 'In progress' }).click();
  await page.getByTestId('bulk-confirm').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Cancelled, nothing was changed')).toBeVisible();
});

test('incidents tab lists incidents with their map', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/officer/incidents');
  await expect(page.getByTestId('incident-card').first()).toBeVisible();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
  await noOverflow(page);
});

test('gov map draws heat, ward and cluster layers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInAs(page, 'admin');
  await page.goto('/admin');
  await expect(page.locator('canvas.leaflet-heatmap-layer')).toBeAttached();
  await expect(page.locator('path.leaflet-interactive').first()).toBeAttached();
  await page.getByTestId('gov-map').getByText('Clusters').click();
  await expect(page.locator('.marker-cluster').first()).toBeAttached();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('Telugu switches gov strings', async ({ page }) => {
  await signInAs(page, 'supervisor', 'te');
  await page.goto('/officer');
  await expect(page.getByRole('heading', { name: 'ఇన్‌బాక్స్' })).toBeVisible();
});

test('inbox is usable at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signInAs(page, 'supervisor');
  await page.goto('/officer');
  await expect(page.getByTestId('case-card').first()).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Review queues' })).toBeVisible();
});
