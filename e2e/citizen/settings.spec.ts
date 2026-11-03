// P1: settings apply globally (data-* on <html>) and persist across reloads.
import { expect, test } from '@playwright/test';

test('display settings apply globally and persist', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('jv.e2e.init')) return;
    localStorage.setItem(
      'jv.mockAuth',
      JSON.stringify({ id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' }),
    );
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true }, version: 1 }));
    sessionStorage.setItem('jv.e2e.init', '1');
  });
  await page.goto('/app/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'paper');

  await page.getByTestId('theme-ink').click();
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await page.getByTestId('pref-contrast').click();
  await expect(html).toHaveAttribute('data-contrast', 'high');
  await page.getByTestId('pref-font').click();
  await expect(html).toHaveAttribute('data-font', 'large');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await expect(html).toHaveAttribute('data-contrast', 'high');
  await expect(html).toHaveAttribute('data-font', 'large');

  // Settings follow you to other screens.
  await page.goto('/app');
  await expect(html).toHaveAttribute('data-contrast', 'high');

  await page.goto('/app/settings');
  await page.getByTestId('prefs-reset').click();
  await expect(html).not.toHaveAttribute('data-contrast', 'high');
  await expect(html).toHaveAttribute('data-theme', 'paper');
});

test('simple mode hides the nearby teaser on home', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'jv.mockAuth',
      JSON.stringify({ id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' }),
    );
    localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'en', onboarded: true, simple_mode: true }, version: 1 }));
  });
  await page.goto('/app');
  await expect(page.getByTestId('tile-voice')).toBeVisible();
  await expect(page.getByTestId('grievance-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Issues near you' })).toHaveCount(0);
});
