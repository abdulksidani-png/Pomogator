import { defineConfig, devices } from '@playwright/test';

// Runs the production build locally and drives it in Chromium.
// Set PW_CHROMIUM_PATH to use an already-installed Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
