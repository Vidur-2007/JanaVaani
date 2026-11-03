// P5: QR asset entry, nearby map + radius, public-service guide (mock mode).
import { expect, test, type Page } from '@playwright/test';

const LAKSHMI = {
  id: 'u-lakshmi',
  role: 'citizen',
  name: 'Lakshmi Devi',
  email: 'lakshmi@janavaani.test',
  preferred_language: 'te',
  persona_en: '',
};

async function prefs(page: Page, state: Record<string, unknown>, who?: object) {
  await page.addInitScript(
    ([w, s]) => {
      if (sessionStorage.getItem('jv.e2e.init')) return;
      if (w) localStorage.setItem('jv.mockAuth', JSON.stringify(w));
      localStorage.setItem(
        'jv.prefs',
        JSON.stringify({ state: { ui_lang: 'en', onboarded: true, ...s }, version: 1 }),
      );
      sessionStorage.setItem('jv.e2e.init', '1');
    },
    [who ?? null, state] as const,
  );
}

test('QR scan without a session: guest is created, "already reported" → add support', async ({ page }) => {
  await prefs(page, {});
  await page.goto('/r/SL-KHB-0001');
  await expect(page.getByTestId('asset-card')).toContainText('SL-KHB-0001');
  await expect(page.getByTestId('asset-open-count')).toHaveText('1');
  const issues = page.getByTestId('asset-open-issues');
  await expect(issues).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jv.mockAuth') ?? 'null')?.role))
    .toBe('guest');
  const support = issues.locator('button[data-testid^="affected-"]');
  await support.click();
  await expect(support).toHaveAttribute('aria-pressed', 'true');
});

test('QR scan → report opens with the asset and its location prefilled', async ({ page }) => {
  await prefs(page, {});
  await page.goto('/r/SL-KHB-0001');
  await page.getByTestId('asset-report').click();
  await expect(page).toHaveURL(/\/app\/report\?asset=SL-KHB-0001/);
  await expect(page.getByTestId('location-chip')).toContainText('SL-114');
});

test('unknown QR code shows a friendly not-found state', async ({ page }) => {
  await prefs(page, {});
  await page.goto('/r/XX-NOPE-0000');
  await expect(page.getByText('XX-NOPE-0000')).toBeVisible();
  await expect(page.getByTestId('asset-card')).toHaveCount(0);
});

test('nearby: radius slider by keyboard changes the search and keeps support', async ({ page }) => {
  await prefs(page, {}, LAKSHMI);
  await page.goto('/app/nearby');
  await expect(
    page.getByTestId('nearby-list').or(page.getByRole('heading', { name: /No open issues/ })),
  ).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Search radius' });
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('radius-value')).toHaveText(/250/);
  await page.keyboard.press('End');
  await expect(page.getByTestId('radius-value')).toHaveText(/2/);
  const items = page.getByTestId('nearby-item');
  await expect(items.first()).toBeVisible();
  await expect(page.locator('#nearby-list-title')).toContainText('2 km');
  await items.first().locator('button[data-testid^="affected-"]').click();
  await expect(items.first().locator('button[data-testid^="affected-"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('guide: Telugu question → Telugu answer with sources → Report this issue prefilled', async ({
  page,
}) => {
  await prefs(page, { ui_lang: 'te' }, LAKSHMI);
  await page.goto('/guide');
  await page.getByTestId('guide-input').fill('దోమలు చాలా ఎక్కువగా ఉన్నాయి, ఎవరికి చెప్పాలి?');
  await page.getByTestId('guide-input').press('Enter');
  const answer = page.getByTestId('guide-answer').last();
  await expect(answer.getByTestId('guide-answer-text')).toHaveAttribute('lang', 'te');
  await expect(answer.getByTestId('guide-sources')).toBeVisible();
  await answer.getByTestId('guide-report').click();
  await expect(page).toHaveURL(/\/app\/report\?dept=health/);
  await expect(page.getByTestId('composer-input')).toHaveValue(/దోమ/);
});

test('guide: suggested chips in other languages, appeal topic has no department CTA', async ({ page }) => {
  await prefs(page, {});
  await page.goto('/guide');
  await expect(page.getByTestId('guide-sample-ur')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('guide-suggest-appeal').click();
  const answer = page.getByTestId('guide-answer').last();
  await expect(answer.getByTestId('guide-sources')).toContainText('Appeals');
  await expect(answer.getByTestId('guide-report')).toHaveCount(0);
});
