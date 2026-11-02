// P4: complaint tracker, "Is it fixed?", appeals, guest tracking, Nearby "affected too", search, notifications,
// chat tracking (mock mode; the seeded db is in memory, so every test starts fresh).
import { expect, test, type Page } from '@playwright/test';
import { fakeHash } from '../../packages/contracts/mocks/seed';

const GUEST = { id: 'u-guest-e2e', role: 'guest', name: 'Guest', email: '', preferred_language: 'en', persona_en: '' };
const LAKSHMI = { id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' };
const IMRAN = { id: 'u-imran', role: 'citizen', name: 'Imran Khan', email: 'imran@janavaani.test', preferred_language: 'ur', persona_en: '' };

/** Lakshmi's seeded streetlight complaint (narrative 4): resolved, waiting for her check, AI verification suspicious. */
const STREETLIGHT = 'GRV-2026-000119';
/** Same formula as the mock's pinFor(). */
const pinFor = (id: string) => String((parseInt(fakeHash(id).slice(0, 8), 16) % 900000) + 100000);

async function signIn(page: Page, who: object, lang = 'en') {
  await page.addInitScript(
    ([w, l]) => {
      if (sessionStorage.getItem('jv.e2e.init')) return;
      localStorage.setItem('jv.mockAuth', JSON.stringify(w));
      localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: l, onboarded: true }, version: 1 }));
      sessionStorage.setItem('jv.e2e.init', '1');
    },
    [who, lang] as const,
  );
}

const detail = (page: Page) => page.getByTestId('grievance-detail');

test('tracker → reject closure → reopen', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto(`/app/complaints/${STREETLIGHT}`);
  await expect(detail(page)).toHaveAttribute('data-status', 'resolved_pending_verification');
  await expect(page.getByTestId('step-progress')).toHaveAttribute('data-done', '5');
  await expect(page.getByTestId('sla-panel')).toBeVisible();
  await expect(page.getByTestId('office-card')).toBeVisible();
  await expect(page.getByTestId('ai-verification')).toBeVisible();

  await page.getByTestId('fixed-no').click();
  await page.getByTestId('reason-not_fixed').click();
  await page.locator('#fix-reason').fill('The light is still off at night.');
  await page.getByTestId('fix-submit').click();

  await expect(detail(page)).toHaveAttribute('data-status', 'reopened');
  await expect(page.getByTestId('step-progress')).toHaveAttribute('data-done', '3');
  await expect(page.getByTestId('is-it-fixed')).toHaveCount(0);
});

test('accept the fix with stars, then file an appeal', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto(`/app/complaints/${STREETLIGHT}`);
  await page.getByTestId('fixed-yes').click();
  await page.getByTestId('star-4').click();
  await page.locator('#fix-comment').fill('Working now, thank you.');
  await page.getByTestId('fix-submit').click();

  await expect(detail(page)).toHaveAttribute('data-status', 'closed');
  await expect(page.getByTestId('closure-label')).toHaveAttribute('data-closure', 'citizen_verified');
  await expect(page.getByTestId('step-progress')).toHaveAttribute('data-done', '7');

  await page.getByTestId('appeal-open').click();
  await page.locator('#closure-reason').fill('The pole wiring is still exposed and unsafe.');
  await page.getByTestId('closure-submit').click();
  await expect(page.getByTestId('appeal-status')).toBeVisible();
  await expect(page.getByTestId('appeal-open')).toHaveCount(0);
});

test('reply to the office in the message thread', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto(`/app/complaints/${STREETLIGHT}`);
  const thread = page.getByTestId('messages');
  const before = await thread.locator('li').count();
  await page.getByTestId('reply-input').fill('Please check again tonight.');
  await page.getByTestId('reply-send').click();
  await expect(thread.locator('li')).toHaveCount(before + 1);
  await expect(thread).toContainText('Please check again tonight.');
});

test('guest tracking with ticket + PIN (wrong PIN is refused)', async ({ page }) => {
  await signIn(page, GUEST);
  await page.goto(`/track?id=${STREETLIGHT}&pin=000000`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(detail(page)).toHaveCount(0);

  await page.locator('#pin').fill(pinFor(STREETLIGHT));
  await page.locator('#pin').press('Enter');
  await expect(detail(page)).toBeVisible();
  await expect(page.getByTestId('tracker-id')).toHaveText(STREETLIGHT);
  // Owner actions work with the PIN too.
  await page.getByTestId('fixed-no').click();
  await page.getByTestId('reason-came_back').click();
  await page.getByTestId('fix-submit').click();
  await expect(detail(page)).toHaveAttribute('data-status', 'reopened');
  await expect(page.getByTestId('tracker-report')).toHaveAttribute('href', new RegExp(`pin=${pinFor(STREETLIGHT)}`));
});

test("someone else's complaint from Nearby offers \"I'm affected too\"", async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto('/app/nearby');
  const links = page.locator('main li a[href^="/app/complaints/"]');
  await expect(links.first()).toBeVisible();
  const n = Math.min(await links.count(), 6);
  for (let i = 0; i < n; i++) {
    await links.nth(i).click();
    await expect(detail(page).or(page.getByTestId('affected-too'))).toBeVisible();
    if (await page.getByTestId('affected-too').isVisible()) break;
    await page.goBack(); // her own complaint: try the next one
  }
  const card = page.getByTestId('affected-too');
  await expect(card).toBeVisible();
  await card.locator('button[data-testid^="affected-"]').click();
  await expect(card).toHaveCount(0); // replaced by the celebration
});

test('complaints: filter chips and cross-language search', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto('/app/complaints');
  const list = page.getByTestId('complaint-list');
  await expect(list).toBeVisible();
  await page.getByTestId('filter-action').click();
  await expect(page).toHaveURL(/filter=action/);
  await expect(list).toContainText(STREETLIGHT);

  await page.getByTestId('filter-all').click();
  await page.getByTestId('complaint-search').fill('వీధి లైట్');
  await expect(list).toContainText(STREETLIGHT);
});

test('notifications: community update, deep link, mark all read', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto('/app/notifications');
  const items = page.getByTestId('notification');
  await expect(items.first()).toBeVisible();
  await expect(page.locator('[data-testid="notification"][data-type="community_update"]')).toHaveCount(1);

  await page.getByTestId('mark-all-read').click();
  await expect(page.locator('[data-testid="notification"][data-read="false"]')).toHaveCount(0);

  const linked = page.locator('[data-testid="notification"]:not([data-type="community_update"]) button').first();
  await linked.click();
  await expect(page).toHaveURL(/\/app\/complaints\/GRV-/);
  await expect(detail(page)).toBeVisible();
});

test('chat tracking: "What happened to my water complaint?"', async ({ page }) => {
  await signIn(page, IMRAN);
  await page.goto('/app/report');
  await page.getByTestId('composer-input').fill('What happened to my water complaint?');
  await page.getByTestId('composer-input').press('Enter');
  const card = page.getByTestId('tracked-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('mini-steps')).toBeVisible();
  await card.click();
  await expect(detail(page)).toBeVisible();
});
