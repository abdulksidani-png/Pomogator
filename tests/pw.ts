/**
 * Playwright's `test`, with the first-time tour and the daily streak celebration switched off by default:
 * both open by themselves for a new visitor and would cover the buttons other tests click. Tests for them turn
 * them back on with `test.use({ tour: true })` or `test.use({ celebrate: true })`. Check-ins still count either way.
 */
import { test as base, type BrowserContext } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

export async function quietCelebrations(context: BrowserContext, opts: { tour?: boolean; celebrate?: boolean } = {}) {
  await context.addInitScript(({ tour, celebrate }) => {
    try {
      if (!celebrate && localStorage.getItem('studybuddy.celebrate') === null) localStorage.setItem('studybuddy.celebrate', 'off');
      if (!tour && localStorage.getItem('studybuddy.tour') === null) localStorage.setItem('studybuddy.tour', 'done');
    } catch { /* no storage */ }
  }, { tour: !!opts.tour, celebrate: !!opts.celebrate });
}

export const test = base.extend<{ celebrate: boolean; tour: boolean }>({
  celebrate: [false, { option: true }],
  tour: [false, { option: true }],
  context: async ({ context, celebrate, tour }, use) => {
    if (!celebrate || !tour) await quietCelebrations(context, { celebrate, tour });
    await use(context);
  },
});
