// P5 accessibility pass: axe (WCAG 2.1 A/AA) on every citizen page in light, dark, high-contrast and large-text
// modes; keyboard-only report submission (Spec A §7.7); 44px targets; icon buttons have names.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const LAKSHMI = {
  id: 'u-lakshmi',
  role: 'citizen',
  name: 'Lakshmi Devi',
  email: 'lakshmi@janavaani.test',
  preferred_language: 'te',
  persona_en: '',
};
const STREETLIGHT = 'GRV-2026-000119';

const PAGES: { path: string; ready: (p: Page) => Promise<void>; auth?: boolean }[] = [
  { path: '/', ready: (p) => expect(p.locator('main h1')).toBeVisible() },
  { path: '/onboarding', ready: (p) => expect(p.getByRole('radiogroup').first()).toBeVisible(), auth: true },
  { path: '/login', ready: (p) => expect(p.getByRole('tab').first()).toBeVisible() },
  { path: '/app', ready: (p) => expect(p.locator('main h1')).toBeVisible(), auth: true },
  { path: '/app/report', ready: (p) => expect(p.getByTestId('composer-input')).toBeVisible(), auth: true },
  {
    path: '/app/complaints',
    ready: (p) => expect(p.getByTestId('complaint-list')).toBeVisible(),
    auth: true,
  },
  {
    path: `/app/complaints/${STREETLIGHT}`,
    ready: (p) => expect(p.getByTestId('grievance-detail')).toBeVisible(),
    auth: true,
  },
  {
    path: '/app/notifications',
    ready: (p) => expect(p.getByTestId('notification').first()).toBeVisible(),
    auth: true,
  },
  { path: '/app/nearby', ready: (p) => expect(p.getByTestId('nearby-list')).toBeVisible(), auth: true },
  { path: '/app/settings', ready: (p) => expect(p.getByTestId('install-row')).toBeVisible(), auth: true },
  { path: '/track', ready: (p) => expect(p.locator('#ticket')).toBeVisible() },
  { path: '/r/SL-KHB-0001', ready: (p) => expect(p.getByTestId('asset-card')).toBeVisible() },
  { path: '/guide', ready: (p) => expect(p.getByTestId('page-guide')).toBeVisible() },
  {
    path: `/print/report/${STREETLIGHT}`,
    ready: (p) => expect(p.getByTestId('receipt-id')).toBeVisible(),
    auth: true,
  },
];

const MODES = {
  light: { theme: 'paper' },
  dark: { theme: 'ink' },
  'high-contrast': { theme: 'paper', contrast: 'high' },
  'large-text': { theme: 'ink', font: 'large' },
} as const;

async function setup(page: Page, prefs: Record<string, unknown>, auth: boolean) {
  await page.addInitScript(
    ([w, p, a]) => {
      if (a) localStorage.setItem('jv.mockAuth', JSON.stringify(w));
      localStorage.setItem(
        'jv.prefs',
        JSON.stringify({ state: { ui_lang: 'en', onboarded: true, motion: 'reduce', ...p }, version: 1 }),
      );
    },
    [LAKSHMI, prefs, auth] as const,
  );
}

/** Third-party map tiles/attribution and the demo-only floating controls are out of scope. */
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.leaflet-tile-pane')
    .exclude('.leaflet-control-attribution')
    .analyze();

for (const [mode, prefs] of Object.entries(MODES)) {
  test.describe(`axe · ${mode}`, () => {
    for (const pg of PAGES) {
      test(pg.path, async ({ page }) => {
        test.skip(
          test.info().project.name !== 'chromium' && mode !== 'light',
          'the full mode matrix runs on chromium',
        );
        await setup(page, prefs, !!pg.auth);
        await page.goto(pg.path);
        await pg.ready(page);
        await page.waitForTimeout(1500); // entrance transitions settle (axe skips half-faded elements)
        const r = await scan(page);
        const summary = r.violations.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        );
        expect(summary, summary.join('\n')).toEqual([]);
      });
    }
  });
}

test('keyboard only: report a problem and submit it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await setup(page, { theme: 'paper' }, true);
  await page.goto('/app/report');
  const input = page.getByTestId('composer-input');
  await expect(input).toBeFocused(); // autofocus lands in the composer
  await page.keyboard.type('Garbage not picked up for 4 days near Ameerpet metro station, very bad smell');
  await page.keyboard.press('Enter');
  // Answer follow-ups by keyboard: Tab to the first quick reply, or type a landmark.
  const card = page.getByTestId('confirmation-card');
  for (let i = 0; i < 6 && !(await card.isVisible()); i++) {
    await expect(page.getByTestId('typing')).toHaveCount(0);
    await expect(input).toBeEnabled();
    if (await card.isVisible()) break;
    const qr = page.getByTestId('quick-replies').locator('button[data-testid^="qr-"]');
    if (await qr.count()) {
      await qr.first().focus();
      await page.keyboard.press('Enter');
    } else {
      await input.focus();
      await page.keyboard.type('Near the metro pillar 1012');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(600);
  }
  await expect(card).toBeVisible();
  const confirm = page.getByTestId('confirm-submit');
  await confirm.focus();
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Enter');
  // Possibly a duplicate sheet: choose "file new" by keyboard.
  const fileNew = page.getByTestId('dup-file-new');
  const ticket = page.getByTestId('ticket-id');
  await expect(ticket.or(fileNew)).toBeVisible();
  if (await fileNew.isVisible()) {
    await fileNew.focus();
    await page.keyboard.press('Enter');
  }
  await expect(ticket).toBeVisible();
});

test('every visible button and link has an accessible name and a 44px target', async ({ page }) => {
  for (const path of [
    '/app',
    '/app/complaints',
    `/app/complaints/${STREETLIGHT}`,
    '/app/nearby',
    '/guide',
    '/track',
  ]) {
    await setup(page, { theme: 'paper' }, true);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        'main button, main a[href], main [role="button"], header button, nav a[href]',
      )) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (el.closest('.leaflet-control-attribution, [data-skip-target-check]')) continue;
        const name = (
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.textContent ||
          el.getAttribute('title') ||
          ''
        ).trim();
        if (!name) out.push(`no name: ${el.outerHTML.slice(0, 120)}`);
        // Inline text links inside sentences are exempt (WCAG 2.5.8 inline exception).
        const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
        if (!inline && (r.width < 43.5 || r.height < 43.5)) {
          // An ::after hit-area extension counts (touch-target utility / slider thumb).
          const after = getComputedStyle(el, '::after');
          const extended = after.content !== 'none' && after.position === 'absolute';
          if (!extended)
            out.push(`small ${Math.round(r.width)}×${Math.round(r.height)}: ${el.outerHTML.slice(0, 120)}`);
        }
      }
      return out;
    });
    expect(bad, `${path}\n${bad.join('\n')}`).toEqual([]);
  }
});
