// P3: voice mode and low-literacy (easy) mode, mock mode.
// The fake microphone plays a continuous tone, so a turn is ended by tapping the orb. Headless browsers have no
// working Web Speech recognizer, which exercises the MediaRecorder → /speech/transcribe path.
import { expect, test, type Page } from '@playwright/test';

const LAKSHMI = { id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' };

async function setup(page: Page, prefs: Record<string, unknown>) {
  await page.addInitScript(
    ([who, p]) => {
      if (sessionStorage.getItem('jv.e2e.init')) return;
      localStorage.setItem('jv.mockAuth', JSON.stringify(who));
      localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'te', onboarded: true, ...p }, version: 1 }));
      sessionStorage.setItem('jv.e2e.init', '1');
    },
    [LAKSHMI, prefs] as const,
  );
}

async function answerUntilConfirm(page: Page) {
  const card = page.getByTestId('confirmation-card');
  const lastBot = page.locator('[data-role="bot"]').last();
  for (let i = 0; i < 6; i++) {
    await expect(page.getByTestId('typing')).toHaveCount(0);
    if (await card.isVisible()) return;
    // Easy mode shows one question at a time, so wait for the latest question to change rather than counting.
    const before = await lastBot.textContent();
    const qr = page.getByTestId('quick-replies').locator('button[data-testid^="qr-"]');
    if (await qr.count()) await qr.first().click();
    else {
      await page.getByTestId('composer-input').fill('బస్ స్టాప్ దగ్గర');
      await page.getByTestId('composer-input').press('Enter');
    }
    await expect(lastBot).not.toHaveText(before ?? '');
  }
  await expect(card).toBeVisible();
}

test('voice-to-voice loop: pre-prompt → listen → tap → transcribe → reply → listen again', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await setup(page, { consent_microphone: null });
  await page.goto('/app/report?mode=voice');
  await expect(page.getByTestId('mic-preprompt')).toBeVisible();
  await page.getByTestId('mic-allow').click();
  const status = page.getByTestId('voice-status');
  await expect(status).toHaveAttribute('data-phase', 'listening');
  await expect(page.getByTestId('voice-orb')).toHaveAttribute('data-state', 'listening');
  // Let the fake microphone "speak" for a moment before tapping to end the turn.
  await page.waitForTimeout(2500);
  await page.getByTestId('voice-orb-button').click();
  // Mock transcription returns a Telugu complaint; the assistant asks a Telugu follow-up.
  await expect(page.getByTestId('voice-caption')).toContainText(/[ఀ-౿]/);
  await expect(page.getByTestId('voice-reply')).not.toContainText('సమస్య ఏమిటో చెప్పండి');
  await expect(page.getByTestId('voice-reply')).toContainText(/[ఀ-౿]/);
  // After speaking (or showing the no-voice tip), it listens again.
  await expect(status).toHaveAttribute('data-phase', 'listening', { timeout: 30_000 });
  // The turn went into the chat as a voice turn.
  await page.getByTestId('voice-close').click();
  await expect(page.locator('[data-role="user"]').first()).toContainText(/[ఀ-౿]/);
});

test('voice confirm at the confirming stage submits the complaint', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await setup(page, { consent_microphone: true });
  await page.goto('/app/report?mode=text');
  await page.getByTestId('composer-input').fill('మా వీధిలో చెత్త వారం రోజులుగా తీయలేదు');
  await page.getByTestId('composer-input').press('Enter');
  await answerUntilConfirm(page);
  await page.getByTestId('voice-open').click();
  await expect(page.getByTestId('voice-confirm')).toBeVisible();
  await page.getByTestId('voice-confirm').getByRole('button').first().click();
  await expect(page.getByTestId('voice-mode')).toHaveCount(0);
  await expect(page.getByTestId('submitted-screen')).toBeVisible();
});

test('microphone blocked → friendly message with "type instead"', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
  });
  await setup(page, { consent_microphone: true });
  await page.goto('/app/report?mode=voice');
  await page.getByTestId('voice-orb-button').click();
  await expect(page.getByTestId('mic-denied')).toBeVisible();
  await page.getByTestId('mic-denied').getByRole('button').click();
  await expect(page.getByTestId('voice-mode')).toHaveCount(0);
  await expect(page.getByTestId('composer-input')).toBeVisible();
});

test('voice-first users open in voice mode; ?mode=text overrides', async ({ page }) => {
  await setup(page, { voice_first: true, consent_microphone: true });
  await page.goto('/app/report');
  await expect(page.getByTestId('voice-mode')).toBeVisible();
  await page.goto('/app/report?mode=text');
  await expect(page.getByTestId('voice-mode')).toHaveCount(0);
});

test('easy mode: category tiles → one question at a time → big ✓ → ticket', async ({ page }) => {
  await setup(page, { low_literacy: true, voice_first: false, voice_autoplay: false });
  await page.goto('/app/report');
  await expect(page.getByTestId('category-tiles')).toBeVisible();
  await page.getByTestId('tile-water').click();
  await expect(page.getByTestId('category-tiles')).toHaveCount(0);
  // Only the latest exchange is visible; the greeting is behind "Show earlier".
  await expect(page.getByTestId('show-earlier')).toBeVisible();
  await expect(page.locator('[data-role="bot"]')).toHaveCount(1);
  await answerUntilConfirm(page);
  await expect(page.getByTestId('priority-factors')).toHaveCount(0);
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('submitted-screen')).toBeVisible();
});

test('Android back closes voice mode and keeps the report page', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await setup(page, { consent_microphone: true });
  await page.goto('/app');
  await page.goto('/app/report?mode=voice');
  await expect(page.getByTestId('voice-status')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('voice-status')).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/report/);
  await expect(page.getByTestId('composer-input')).toBeVisible();
  // A second back leaves the page as usual.
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
});
