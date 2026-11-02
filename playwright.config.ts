import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production build served by `vite preview` (fast, no dev-server dep re-optimization).
const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A single `vite preview` serves every browser; more workers just queue on it (slow under OneDrive-synced folders).
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Keep smoke runs independent of service-worker caching; PWA behaviour gets its own test in P5.
    serviceWorkers: 'block',
    // Voice mode: a fake microphone (a continuous tone) and no permission prompt. All projects are Chromium-based.
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -w apps/web -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: { VITE_API_MODE: 'mock', VITE_DEMO_MODE: 'true' },
      },
});
