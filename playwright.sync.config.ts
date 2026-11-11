import { defineConfig, devices } from '@playwright/test';
import crypto from 'node:crypto';

// Sync tests: two browser "devices" against a local stand-in for Supabase
// (real PostgreSQL + PostgREST, fake Auth). Needs PostgreSQL running and POSTGREST_BIN set.
const SECRET = 'studybuddy-e2e-secret-that-is-long-enough-0123456789';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 4102444800 })}`;
const ANON_KEY = `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;

export default defineConfig({
  testDir: 'tests/e2e-sync',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3101',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/fake-supabase/server.mjs',
      url: 'http://localhost:54321/health',
      env: { FAKE_JWT_SECRET: SECRET, FAKE_CAPTCHA: '1', POSTGREST_BIN: process.env.POSTGREST_BIN ?? 'postgrest' },
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run build && npx next start -p 3101',
      url: 'http://localhost:3101',
      env: { NEXT_DIST_DIR: '.next-sync', NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
        // Turns the bot check on (the tests stand in for Cloudflare's script); the fake Auth then insists on a token.
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        // An AI key with nowhere to go: enough for the AI routes to check who is asking (guests are refused first).
        GEMINI_API_KEY: 'test-key', GEMINI_BASE_URL: 'http://127.0.0.1:9' },
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
