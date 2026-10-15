import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '../pw';

// Automated accessibility checks (axe-core, WCAG 2.1 A and AA) on each main view, in a light and a dark theme.
async function check(page: Page, what: string) {
  await page.waitForTimeout(700); // let entrance animations finish (faded-in text would read as low contrast)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${what}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

for (const skin of ['notebook', 'midnight', 'gator']) {
  test(`no serious accessibility problems: timer, quiz, stats, weekly, dialogs (${skin})`, async ({ page }) => {
    await page.addInitScript((s) => {
      if (!localStorage.getItem('studybuddy.v1')) localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { settings: { skin: s } }, version: 1 }));
    }, skin);
    await page.route('**/api/ai/status', (r) => r.fulfill({ json: { configured: true } }));
    await page.route('**/api/ai/quiz', (r) => r.fulfill({ json: { questions: [{ id: 'q1', concept: 'Krebs cycle', question: 'Where does the Krebs cycle happen?',
      options: ['Mitochondrial matrix', 'Cytoplasm', 'Nucleus', 'Ribosome'], correctIndex: 0, explanation: 'Its enzymes sit in the matrix.', memoryAid: 'Krebs lives in the Matrix.',
      optionFeedback: ['Right.', 'That is glycolysis.', 'DNA lives there.', 'Proteins are made there.'] }] } }));
    await page.goto('/');
    await page.locator('.splash').waitFor({ state: 'hidden' });
    await check(page, 'timer');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await check(page, 'settings');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Appearance' }).click();
    await check(page, 'appearance');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Ask the study assistant/ }).click();
    await check(page, 'assistant');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Stats', exact: true }).click();
    await check(page, 'stats');
    await page.getByRole('button', { name: 'Weekly report' }).click();
    await check(page, 'weekly');

    // The quiz, with the buddy's reaction, and the tour.
    await page.getByRole('button', { name: /Back to the timer/ }).click();
    await page.fill('#ctxTopic', 'Krebs cycle');
    await page.getByRole('button', { name: /Start studying/ }).click();
    await page.getByRole('button', { name: /Finish session now/ }).click();
    await page.getByRole('button', { name: 'Start quiz' }).click();
    await check(page, 'quiz question');
    await page.locator('.opt').nth(1).click();
    await check(page, 'quiz feedback');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await page.getByRole('button', { name: 'Take the tour' }).click();
    await check(page, 'tour');
  });
}
