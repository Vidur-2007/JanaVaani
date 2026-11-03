// Spec A §7.1: landing loads, the hero fallback is shown under reduced motion, and the CTA navigates.
import { expect, test } from '@playwright/test';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('hero shows the static poster only (no WebGL canvas) and the voice CTA opens the report flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByTestId('hero-fallback')).toBeVisible();
    await expect(page.getByTestId('cta-voice')).toBeVisible();
    // Give the lazy 3D chunk every chance to mount; under reduced motion it must not.
    await page.waitForTimeout(1500);
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByTestId('cta-voice').click();
    // Signed out: the guard sends the citizen to login/onboarding and keeps the voice target.
    await expect(page).toHaveURL(/\/(login|onboarding|app\/report)/);
    expect(errors).toEqual([]);
  });
});

test('track CTA reaches guest tracking', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /track/i }).first().click();
  await expect(page).toHaveURL(/\/track/);
});
