import { defineConfig, devices } from '@playwright/test';

// The AI, Unsplash and Last.fm features end to end: the real /api routes, talking to stand-ins
// (tests/fake-gemini/server.mjs for Gemini, Unsplash and Last.fm).
// Run with `npm run test:ai`.
export default defineConfig({
  testDir: 'tests/e2e-ai',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3102',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tests/fake-gemini/server.mjs', url: 'http://localhost:4010/__requests', reuseExistingServer: false },
    {
      command: 'npm run build && npx next start -p 3102',
      url: 'http://localhost:3102',
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        // Claude answers first; Gemini is the fallback (a prompt with CLAUDE_OUT makes the stand-in Claude run out of credit).
        ANTHROPIC_API_KEY: 'test-claude', ANTHROPIC_BASE_URL: 'http://localhost:4010',
        GEMINI_API_KEY: 'test-key', GEMINI_BASE_URL: 'http://localhost:4010',
        UNSPLASH_ACCESS_KEY: 'test-unsplash', UNSPLASH_BASE_URL: 'http://localhost:4010',
        LASTFM_API_KEY: 'test-lastfm', LASTFM_BASE_URL: 'http://localhost:4010',
      },
    },
  ],
});
