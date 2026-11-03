// P5 i18n completeness: every citizen page in Urdu at 360px — dir=rtl, lang=ur, Urdu UI text, no horizontal overflow
// (normal and large text). Static checks (hardcoded strings, logical utilities, rtl-flip, Intl) live in `npm run test:i18n`.
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
const ARABIC = /[؀-ۿ]/;

const PAGES: { path: string; auth?: boolean; ready: (p: Page) => Promise<void> }[] = [
  { path: '/', ready: (p) => expect(p.locator('main h1')).toBeVisible() },
  { path: '/login', ready: (p) => expect(p.getByRole('tab').first()).toBeVisible() },
  { path: '/onboarding', auth: true, ready: (p) => expect(p.getByRole('radiogroup').first()).toBeVisible() },
  { path: '/app', auth: true, ready: (p) => expect(p.locator('main h1')).toBeVisible() },
  { path: '/app/report', auth: true, ready: (p) => expect(p.getByTestId('composer-input')).toBeVisible() },
  { path: '/app/report/quick', auth: true, ready: (p) => expect(p.locator('main h1')).toBeVisible() },
  {
    path: '/app/complaints',
    auth: true,
    ready: (p) => expect(p.getByTestId('complaint-list')).toBeVisible(),
  },
  {
    path: `/app/complaints/${STREETLIGHT}`,
    auth: true,
    ready: (p) => expect(p.getByTestId('grievance-detail')).toBeVisible(),
  },
  {
    path: '/app/notifications',
    auth: true,
    ready: (p) => expect(p.getByTestId('notification').first()).toBeVisible(),
  },
  { path: '/app/nearby', auth: true, ready: (p) => expect(p.getByTestId('nearby-list')).toBeVisible() },
  { path: '/app/settings', auth: true, ready: (p) => expect(p.getByTestId('install-row')).toBeVisible() },
  { path: '/track', ready: (p) => expect(p.locator('#ticket')).toBeVisible() },
  { path: '/r/SL-KHB-0001', ready: (p) => expect(p.getByTestId('asset-card')).toBeVisible() },
  { path: '/guide', ready: (p) => expect(p.getByTestId('page-guide')).toBeVisible() },
  {
    path: `/print/receipt/${STREETLIGHT}`,
    auth: true,
    ready: (p) => expect(p.getByTestId('receipt-id')).toBeVisible(),
  },
];

test.use({ viewport: { width: 360, height: 760 } });

for (const font of ['normal', 'large'] as const) {
  test.describe(`Urdu RTL · ${font} text`, () => {
    for (const pg of PAGES) {
      test(pg.path, async ({ page }) => {
        test.skip(
          test.info().project.name !== 'chromium' && font === 'large',
          'large-text matrix runs on chromium',
        );
        await page.addInitScript(
          ([w, a, f]) => {
            if (a) localStorage.setItem('jv.mockAuth', JSON.stringify(w));
            localStorage.setItem(
              'jv.prefs',
              JSON.stringify({
                state: { ui_lang: 'ur', onboarded: true, motion: 'reduce', font: f },
                version: 1,
              }),
            );
          },
          [LAKSHMI, !!pg.auth, font] as const,
        );
        await page.goto(pg.path);
        await pg.ready(page);
        await page.waitForTimeout(600);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.locator('html')).toHaveAttribute('lang', /^ur/);
        // UI chrome is Urdu (content such as complaint titles may be in any language).
        expect(ARABIC.test(await page.locator('body').innerText())).toBe(true);
        const overflow = await page.evaluate(() => {
          const w = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (!r.width || getComputedStyle(el).position === 'fixed') return false;
              // Content inside a horizontal scroller (carousels, tables) is allowed to extend.
              for (let p = el.parentElement; p; p = p.parentElement)
                if (
                  /(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX) &&
                  p !== document.body &&
                  p !== document.documentElement
                )
                  return false;
              return r.right > w + 1 || r.left < -1;
            })
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
          return { scroll: document.documentElement.scrollWidth - w, wide };
        });
        expect(
          overflow.scroll,
          `horizontal overflow on ${pg.path}: ${overflow.wide.join(' | ')}`,
        ).toBeLessThanOrEqual(1);
      });
    }
  });
}
