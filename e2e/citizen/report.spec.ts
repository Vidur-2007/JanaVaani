// P2: report assistant end to end (mock mode).
import zlib from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

const GUEST = { id: 'u-guest-e2e', role: 'guest', name: 'Guest', email: '', preferred_language: 'te', persona_en: '' };
const LAKSHMI = { id: 'u-lakshmi', role: 'citizen', name: 'Lakshmi Devi', email: 'lakshmi@janavaani.test', preferred_language: 'te', persona_en: '' };

async function signIn(page: Page, who: object, prefs: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([w, p]) => {
      if (sessionStorage.getItem('jv.e2e.init')) return;
      localStorage.setItem('jv.mockAuth', JSON.stringify(w));
      localStorage.setItem('jv.prefs', JSON.stringify({ state: { ui_lang: 'te', onboarded: true, ...p }, version: 1 }));
      sessionStorage.setItem('jv.e2e.init', '1');
    },
    [who, prefs] as const,
  );
}

async function say(page: Page, text: string) {
  await page.getByTestId('composer-input').fill(text);
  await page.getByTestId('composer-input').press('Enter');
}

/** Answer follow-up questions (quick replies, else a typed landmark) until the confirmation card shows. */
async function answerUntilConfirm(page: Page) {
  const card = page.getByTestId('confirmation-card');
  const bots = page.locator('[data-role="bot"]');
  for (let i = 0; i < 6; i++) {
    // Wait for the assistant's latest reply (typing indicator gone) before deciding.
    await expect(page.getByTestId('composer-input')).toBeEnabled();
    await expect(page.getByTestId('typing')).toHaveCount(0);
    if (await card.isVisible()) return;
    const before = await bots.count();
    const qr = page.getByTestId('quick-replies').locator('button[data-testid^="qr-"]');
    if (await qr.count()) await qr.first().click();
    else await say(page, 'పార్క్ గేటు దగ్గర');
    await expect(bots).toHaveCount(before + 1);
  }
  await expect(card).toBeVisible();
}

/** Noisy PNG so the mock's quality check passes (> 15 KB). */
function png(w: number, h: number) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 131 + y * 71 + ((x * y) % 97)) & 255;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

test('guest reports in Telugu → follow-ups → confirm → ticket ID + PIN', async ({ page }) => {
  await signIn(page, GUEST);
  await page.goto('/app/report');
  await say(page, 'మా వీధిలో చెత్త వారం రోజులుగా తీయలేదు');
  await expect(page.getByTestId('lang-chip')).toContainText('తెలుగు');
  // The bot replies in Telugu.
  await expect(page.locator('[data-role="bot"]').last()).toContainText(/[ఀ-౿]/);
  await answerUntilConfirm(page);
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('submitted-screen')).toBeVisible();
  await expect(page.getByTestId('ticket-id')).toHaveAttribute('aria-label', /^GRV-\d{4}-\d{6}$/);
  await expect(page.getByTestId('guest-pin')).toContainText(/\d{6}/);
  await expect(page.getByTestId('sla-due')).toBeVisible();
});

test('emergency phrase → call buttons first → continue to confirmation', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto('/app/report');
  await say(page, 'మా స్కూల్ దగ్గర కరెంటు తీగ తెగి రోడ్డుపై పడింది');
  const call = page.getByTestId('call-112');
  await expect(call).toBeVisible();
  await expect(call).toHaveAttribute('href', 'tel:112');
  await expect(page.getByTestId('call-108')).toHaveAttribute('href', 'tel:108');
  await expect(call).toBeFocused();
  await page.getByTestId('emergency-continue').click();
  await expect(page.getByTestId('emergency-takeover')).toHaveCount(0);
  await expect(page.getByTestId('confirmation-card')).toBeVisible();
  await expect(page.getByTestId('confirmation-card').locator('[data-priority="critical"]')).toBeVisible();
});

test('Miyapur pothole (text only) → duplicate sheet → add my support → celebration', async ({ page }) => {
  await signIn(page, GUEST);
  await page.goto('/app/report');
  await say(page, 'Miyapur X roads lo pedda gunta undi');
  await expect(page.getByTestId('lang-chip')).toHaveText(/Tenglish/);
  await answerUntilConfirm(page);
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('duplicate-sheet')).toBeVisible();
  await page.getByTestId('dup-support-0').click();
  await expect(page.getByTestId('support-celebration')).toBeVisible();
});

test('two problems in one message → split cards → both registered', async ({ page }) => {
  await signIn(page, GUEST, { ui_lang: 'en' });
  await page.goto('/app/report');
  await say(page, 'There is a big pothole on our road and also garbage not collected for a week');
  await expect(page.getByTestId('split-drafts')).toBeVisible();
  await page.getByTestId('split-submit').click();
  await expect(page.getByTestId('submitted-screen')).toBeVisible();
  await expect(page.getByTestId('ticket-id')).toHaveCount(2);
});

test('location sheet: GPS fix shows the ward and becomes the location', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 17.4849, longitude: 78.4138, accuracy: 20 });
  await signIn(page, GUEST, { ui_lang: 'en' });
  await page.goto('/app/report');
  await page.getByTestId('location-button').click();
  await page.getByTestId('gps-locate').click();
  await expect(page.getByTestId('ward-name').first()).toContainText('Kukatpally');
  await page.getByTestId('location-confirm').click();
  await expect(page.getByTestId('location-chip')).toContainText('Kukatpally');
});

test('quick photo report: photo → continue → confirm → ticket', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 17.4401, longitude: 78.3489, accuracy: 20 });
  await signIn(page, GUEST, { ui_lang: 'en', consent_location: true });
  await page.goto('/app/report/quick');
  await page.getByTestId('photo-input').setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: png(240, 180) });
  await expect(page.getByTestId('photo-ok')).toBeVisible();
  await expect(page.getByTestId('quick-location')).toContainText('Gachibowli');
  await page.getByTestId('quick-text').fill('garbage not collected near the park');
  await page.getByTestId('quick-continue').click();
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('ticket-id')).toBeVisible();
});

test('offline at confirm → queued in outbox → sent when back online', async ({ page, context }) => {
  await signIn(page, GUEST, { ui_lang: 'en' });
  await page.goto('/app/report');
  await say(page, 'Streetlight not working near the bus stop in Ameerpet for a week');
  await answerUntilConfirm(page);
  await context.setOffline(true);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('queued-notice')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Your complaint GRV-\d{4}-\d{6} was sent/)).toBeVisible({ timeout: 15_000 });
});

test('unfinished complaint → resume prompt after reload', async ({ page }) => {
  await signIn(page, GUEST, { ui_lang: 'en' });
  await page.goto('/app/report');
  await say(page, 'Garbage not collected near the temple');
  await expect(page.locator('[data-role="bot"]')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('resume-prompt')).toBeVisible();
  await page.getByTestId('resume-continue').click();
  await expect(page.getByTestId('chat-log')).toContainText('Garbage not collected near the temple');
  await expect(page.getByTestId('resume-prompt')).toHaveCount(0);
});

test('receipt page renders with a QR code to the tracker', async ({ page }) => {
  await page.goto('/print/receipt/GRV-2026-000101?pin=647556');
  await expect(page.getByTestId('receipt-id')).toHaveText('GRV-2026-000101');
  await expect(page.getByTestId('receipt-qr')).toBeVisible();
  await expect(page.getByTestId('download-pdf')).toBeEnabled();
});

test.describe('demo helpers (VITE_DEMO_MODE)', () => {
  test('chat chips pre-fill the rehearsed phrase without sending', async ({ page }) => {
    await signIn(page, LAKSHMI);
    await page.goto('/app/report?mode=text');
    await page.getByTestId('demo-live_wire').click();
    await expect(page.getByTestId('composer-input')).toHaveValue(/కరెంట్ తీగ/);
    await expect(page.locator('[data-role="user"]')).toHaveCount(0);
    await page.getByTestId('composer-input').press('Enter');
    await expect(page.getByTestId('call-112')).toBeVisible();
  });

  test('quick report: demo photo + Miyapur X Roads + Tenglish line → duplicate sheet', async ({ page }) => {
    await signIn(page, LAKSHMI, { ui_lang: 'en' });
    await page.goto('/app/report/quick');
    await page.getByTestId('demo-photo').click();
    await expect(page.getByTestId('photo-ok')).toBeVisible();
    await expect(page.getByTestId('quick-location')).toContainText('Miyapur');
    await expect(page.getByTestId('quick-text')).toHaveValue('Miyapur X roads lo pedda gunta undi');
    await page.getByTestId('quick-continue').click();
    await page.getByTestId('confirm-submit').click();
    await expect(page.getByTestId('duplicate-sheet')).toBeVisible();
  });
});

test('S5: read a photographed bill → AI summary + fields → "use this" drafts the complaint with the photo attached', async ({ page }) => {
  await signIn(page, LAKSHMI);
  await page.goto('/app/report?mode=text');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('doc-button').click();
  await (await chooser).setFiles({ name: 'bill.png', mimeType: 'image/png', buffer: png(320, 240) });
  const card = page.getByTestId('doc-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(/[ఀ-౿]/); // summary in the UI language (Telugu)
  await expect(card).toContainText('HMW-23-118842');
  await page.getByTestId('doc-use').click();
  await expect(page.getByTestId('doc-card')).toHaveCount(0);
  await expect(page.getByTestId('composer-input')).toHaveValue(/HMW-23-118842/);
  await page.getByTestId('composer-input').press('Enter');
  await expect(page.locator('[data-role="bot"]').nth(1)).toBeVisible();
});
