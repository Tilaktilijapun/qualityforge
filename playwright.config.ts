import { defineConfig, devices } from '@playwright/test';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://qf:qf@localhost:5432/qualityforge_test';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/ui',
  globalSetup: './tests/ui/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  // Each test creates its own users and products, so tests can run in parallel.
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }], ['junit', { outputFile: 'reports/ui-junit.xml' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Cross-browser runs belong to the scheduled pipeline: ALL_BROWSERS=1 npx playwright test
    ...(process.env.ALL_BROWSERS
      ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }]
      : []),
  ],
  webServer: [
    {
      command: 'npm run start --workspace app/backend',
      url: 'http://localhost:4000/ready',
      reuseExistingServer: !isCI,
      env: { DATABASE_URL: TEST_DB, JWT_SECRET: 'e2e-only-secret', PORT: '4000', NODE_ENV: 'development' },
    },
    { command: 'npm run dev --workspace app/frontend', url: 'http://localhost:5173', reuseExistingServer: !isCI },
  ],
});
