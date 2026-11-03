// P5: PWA — manifest + icons, service worker, offline app shell (Spec A §5.17).
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('manifest is installable (name, start_url, 192/512 + maskable icons)', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const m = await (await request.get(href!)).json();
  expect(m.short_name).toBe('JanaVaani');
  expect(m.display).toBe('standalone');
  expect(m.start_url).toMatch(/^\/app/);
  const sizes = (m.icons as { sizes: string; purpose?: string }[]).map((i) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of m.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBeTruthy();
});

test('offline: the app shell still loads after the service worker is installed', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker offline check runs on Chromium engines');
  await page.goto('/track');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    return reg.active?.state;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#ticket')).toBeVisible();
  await page.goto('/guide');
  await expect(page.getByTestId('page-guide')).toBeVisible();
  await context.setOffline(false);
});
