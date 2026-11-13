import { defineConfig, devices } from '@playwright/test';

/**
 * The PWA's end-to-end tests: on the demo (a replayed scenario, no server) and on the « live » app,
 * served by factory-live's real server on the core's side (LIVE_SOURCE=workflow-core), reading a fake
 * workflow-core (e2e/fake-api.mjs, #67). Chromium everywhere; WebKit (Safari, iPhone) with
 * `E2E_WEBKIT=1`, on CI in Playwright's official image (this PC lacks system libraries for WebKit).
 * The reference captures are made in that same image.
 */
const webkit = process.env.E2E_WEBKIT === '1';
const DEMO = 'http://127.0.0.1:4180';
const LIVE = 'http://127.0.0.1:4181';
/** The fake workflow-core and factory-live's real server between it and the live build (#67). */
const CORE = 'http://127.0.0.1:4182';
const SERVER = 'http://127.0.0.1:4183';
/** The tests of live.spec.ts: all of them on every live project, phone layouts included. */
const LIVE_TESTS = /lecture par le socle/;
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const DEMO_SPECS =
  /(line|issue|intervention|diagnosis|settings|a11y|mobile|badges|charts|acceptance|composants|studio|workflow)\.spec\.ts/;

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
        FACTORY_LIVE_API: SERVER,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'node e2e/fake-api.mjs',
      url: `${CORE}/__control/healthz`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node e2e/live-server.mjs',
      url: `${SERVER}/healthz`,
      env: { PORT: '4183', FAKE_CORE_URL: CORE },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
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
    // The four live projects share the fake core and the server, which the tests stop, change and reset:
    // each one waits for the previous one (`dependencies`), so that none cuts the core under another.
    {
      name: 'live-bureau',
      testMatch: /(live|studio-master)\.spec\.ts/,
      // The phone layout of the studio runs on the iPhone projects only.
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
      testMatch: /(live|studio-master)\.spec\.ts/,
      grep: [LIVE_TESTS, /sur iPhone/],
      dependencies: ['live-bureau'],
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
          // The live screens under Safari too, the studio's master included (a real master's layout is
          // Safari's own, #41), after the Chromium ones: they share the fake core.
          {
            name: 'webkit-live-bureau',
            testMatch: /(live|studio-master)\.spec\.ts/,
            grepInvert: /sur iPhone/,
            dependencies: ['live-iphone'],
            use: {
              ...devices['Desktop Safari'],
              ...DESKTOP,
              baseURL: LIVE,
              serviceWorkers: 'block' as const,
            },
          },
          {
            name: 'webkit-live-iphone',
            testMatch: /(live|studio-master)\.spec\.ts/,
            grep: [LIVE_TESTS, /sur iPhone/],
            dependencies: ['webkit-live-bureau'],
            use: { ...devices['iPhone 15'], baseURL: LIVE, serviceWorkers: 'block' as const },
          },
        ]
      : []),
  ],
});
