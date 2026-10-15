/**
 * Playwright's `test`, with the daily streak celebration switched off by default: it opens on the first
 * action of the day and would cover the buttons other tests click. Streak tests turn it back on with
 * `test.use({ celebrate: true })`. Check-ins and badges are still recorded either way.
 */
import { test as base, type BrowserContext } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

export async function quietCelebrations(context: BrowserContext) {
  await context.addInitScript(() => {
    try { if (localStorage.getItem('studybuddy.celebrate') === null) localStorage.setItem('studybuddy.celebrate', 'off'); } catch { /* no storage */ }
  });
}

export const test = base.extend<{ celebrate: boolean }>({
  celebrate: [false, { option: true }],
  context: async ({ context, celebrate }, use) => {
    if (!celebrate) await quietCelebrations(context);
    await use(context);
  },
});
