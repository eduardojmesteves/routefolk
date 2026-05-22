// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 10000,
  retries: 1,
  workers: 1,
  outputDir: 'tests/e2e/test-results',

  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npx serve . -p 3030 -n',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
