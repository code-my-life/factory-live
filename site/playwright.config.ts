import { defineConfig, devices } from '@playwright/test';

/**
 * Tests du site (site/dist, construit par `node site/build.mjs`), servi sous /factory-live/ comme
 * sur GitHub Pages. Chromium en bureau et en téléphone ; WebKit (Safari, iPhone) avec
 * `E2E_WEBKIT=1`, dans l'image officielle de Playwright comme en CI.
 */
const webkit = process.env.E2E_WEBKIT === '1';
const PORT = 4196;
const BASE = `http://127.0.0.1:${PORT}/factory-live/`;
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

export default defineConfig({
  testDir: 'test',
  testMatch: /\.spec\.ts$/,
  outputDir: '../test-results/site',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report/site' }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE, trace: 'retain-on-failure', colorScheme: 'dark' },
  webServer: {
    command: `node serve.mjs --root dist --port ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'site-bureau', use: { ...devices['Desktop Chrome'], ...DESKTOP } },
    { name: 'site-iphone', use: { ...devices['Desktop Chrome'], ...PHONE } },
    ...(webkit
      ? [
          { name: 'site-webkit-iphone', use: { ...devices['iPhone 15'] } },
          { name: 'site-webkit-bureau', use: { ...devices['Desktop Safari'], ...DESKTOP } },
        ]
      : []),
  ],
});
