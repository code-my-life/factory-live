import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout de la PWA : sur la démo (scénario rejoué, sans serveur) et sur l'app
 * « live » (API de factory-live simulée par interception). Chromium partout ; WebKit (Safari, iPhone)
 * avec `E2E_WEBKIT=1`, en CI dans l'image officielle de Playwright (il manque des bibliothèques
 * système à ce PC pour WebKit). Les captures de référence se produisent dans la même image.
 */
const webkit = process.env.E2E_WEBKIT === '1';
const DEMO = 'http://127.0.0.1:4180';
const LIVE = 'http://127.0.0.1:4181';
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const DEMO_SPECS =
  /(line|issue|intervention|diagnosis|settings|a11y|mobile|badges|charts|acceptance|composants|studio)\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // On CI, a JUnit report too: the recette of a PR reads it from the run's artifacts (#22).
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'reports/junit/playwright.xml' }],
      ]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { trace: 'retain-on-failure', locale: 'fr-FR', colorScheme: 'dark' },
  webServer: [
    {
      command:
        'npm run build -w @factory-live/web && npm exec -w @factory-live/web -- vite preview --outDir dist-e2e/demo --host 127.0.0.1 --port 4180 --strictPort',
      url: DEMO,
      env: {
        FACTORY_LIVE_OUT_DIR: 'dist-e2e/demo',
        FACTORY_LIVE_SOURCEMAP: '0',
        VITE_DATA_SOURCE: 'demo',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command:
        'npm run build -w @factory-live/web && npm exec -w @factory-live/web -- vite preview --outDir dist-e2e/live --host 127.0.0.1 --port 4181 --strictPort',
      url: LIVE,
      env: {
        FACTORY_LIVE_OUT_DIR: 'dist-e2e/live',
        FACTORY_LIVE_SOURCEMAP: '0',
        VITE_DATA_SOURCE: 'live',
        FACTORY_LIVE_API: 'http://127.0.0.1:4182',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'node e2e/fake-api.mjs',
      url: 'http://127.0.0.1:4182/healthz',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'demo-bureau',
      testMatch: DEMO_SPECS,
      use: { ...devices['Desktop Chrome'], ...DESKTOP, baseURL: DEMO },
    },
    {
      name: 'demo-iphone',
      testMatch: DEMO_SPECS,
      use: { ...devices['Desktop Chrome'], ...IPHONE, baseURL: DEMO },
    },
    {
      name: 'live-bureau',
      testMatch: /(live|studio-master)\.spec\.ts/,
      // The phone layout of the studio runs on live-iphone only.
      grepInvert: /sur iPhone/,
      use: {
        ...devices['Desktop Chrome'],
        ...DESKTOP,
        baseURL: LIVE,
        serviceWorkers: 'block',
      },
    },
    {
      name: 'live-iphone',
      testMatch: /studio-master\.spec\.ts/,
      grep: /sur iPhone/,
      use: { ...devices['Desktop Chrome'], ...IPHONE, baseURL: LIVE, serviceWorkers: 'block' },
    },
    {
      name: 'captures-bureau',
      testMatch: /captures\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...DESKTOP, baseURL: DEMO },
    },
    {
      name: 'captures-iphone',
      testMatch: /captures\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...IPHONE, baseURL: DEMO },
    },
    ...(webkit
      ? [
          {
            name: 'webkit-iphone',
            testMatch: DEMO_SPECS,
            use: { ...devices['iPhone 15'], baseURL: DEMO },
          },
          {
            name: 'webkit-bureau',
            testMatch: DEMO_SPECS,
            use: { ...devices['Desktop Safari'], ...DESKTOP, baseURL: DEMO },
          },
          // The live app under Safari too: a real master's layout is Safari's own (#41).
          {
            name: 'webkit-live-bureau',
            testMatch: /(live|studio-master)\.spec\.ts/,
            grepInvert: /sur iPhone/,
            use: {
              ...devices['Desktop Safari'],
              ...DESKTOP,
              baseURL: LIVE,
              serviceWorkers: 'block' as const,
            },
          },
          {
            name: 'webkit-live-iphone',
            testMatch: /studio-master\.spec\.ts/,
            grep: /sur iPhone/,
            use: { ...devices['iPhone 15'], baseURL: LIVE, serviceWorkers: 'block' as const },
          },
        ]
      : []),
  ],
});
