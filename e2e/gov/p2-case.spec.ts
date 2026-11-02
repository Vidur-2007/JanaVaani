// P2 (mock mode): case cockpit, reply, resolve, shortcuts, supervisor queues, my stats.
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
};

async function signInAs(page: Page, who: keyof typeof PROFILES) {
  await page.addInitScript((profile) => {
    localStorage.setItem('jv.mockAuth', JSON.stringify(profile));
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
  }, PROFILES[who]);
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Telugu live-wire seed story. */
const TELUGU_CASE = '/officer/case/GRV-2026-000101';

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
}

test('cockpit shows the citizen original, AI brief and verified chain', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInAs(page, 'supervisor');
  await page.goto(TELUGU_CASE);
  const original = page.getByTestId('citizen-original').first();
  await expect(original).toHaveAttribute('lang', 'te');
  await expect(original).toContainText(/[ఀ-౿]/);
  await expect(page.getByTestId('ai-brief')).toBeVisible();
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByTestId('chain-result')).toContainText('Chain intact');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('officer drafts a reply, previews Telugu, and sends it', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto(TELUGU_CASE);
  await page.getByText('Work started', { exact: true }).click();
  await page.getByTestId('draft-ai').click();
  await expect(page.getByTestId('citizen-preview')).toContainText(/[ఀ-౿]/);
  await expect(page.locator('#case-reply')).not.toHaveValue('');
  await expect(page.getByText('Will be delivered in Telugu')).toBeVisible();
  const before = await page.getByTestId('message').count();
  await page.getByTestId('send-reply').click();
  await expect(page.getByTestId('message')).toHaveCount(before + 1);
  await expect(page.locator('#case-reply')).toHaveValue('');
});

test('resolving with a photo shows the AI verdict', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto(TELUGU_CASE);
  await page.getByTestId('resolve-photo').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
  await page.getByLabel('Action taken').fill('Line isolated and pole repaired');
  await page.getByTestId('resolve-submit').click();
  await expect(page.getByTestId('verification-badge').first()).toHaveAttribute('data-verdict', 'verified');
});

test('keyboard shortcuts reach the composer and go back', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'hardware keyboard flow');
  await signInAs(page, 'supervisor');
  await page.goto(TELUGU_CASE);
  await expect(page.getByTestId('ai-brief')).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.locator('#case-reply')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('n');
  await expect(page.locator('#case-note')).toBeFocused();
  await page.locator('#case-note').blur();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/officer$/);
});

test('internal notes appear on the timeline', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto(TELUGU_CASE);
  await page.locator('#case-note').fill('Spoke to the lineman on site');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Spoke to the lineman on site')).toBeVisible();
});

test('supervisor routing decision clears the case from the queue', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/supervisor');
  await expect(page.getByTestId('queue-card').first()).toBeVisible();
  const before = await page.getByTestId('queue-card').count();
  await page.getByTestId('route-decide').first().click();
  await expect(page.getByTestId('queue-card')).toHaveCount(before - 1);
});

test('every supervisor tab renders', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/supervisor');
  for (const kind of ['emergency', 'disputed', 'appeal', 'routing']) {
    await page.getByTestId(`tab-${kind}`).click();
    await expect(page).toHaveURL(new RegExp(`kind=${kind}`));
    await expect(page.getByTestId('queue-card').or(page.getByText('Queue clear ✓')).first()).toBeVisible();
    await noOverflow(page);
  }
});

test('officer sees personal stats with a streak', async ({ page }) => {
  await signInAs(page, 'officer');
  await page.goto('/officer/stats');
  await expect(page.getByTestId('sla-streak')).toBeVisible();
  await noOverflow(page);
});

test('an unknown ticket shows an error with retry', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/officer/case/GRV-2026-999999');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert').getByRole('button')).toBeVisible();
});
