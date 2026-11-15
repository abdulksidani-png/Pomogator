import { test, expect, type Page } from '../pw';

const HOUR = 3_600_000;

/** Start with a timer that already counted `done` sessions, last used `hoursAgo` hours ago. */
async function seed(page: Page, done: number, hoursAgo: number) {
  await page.addInitScript(({ done, hoursAgo }) => {
    if (localStorage.getItem('studybuddy.v1')) return;
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { timer: { cycleDone: done, cycleAt: Date.now() - hoursAgo * 3_600_000 } }, version: 1 }));
  }, { done, hoursAgo });
}
const eyebrow = (page: Page) => page.locator('#cycleBtn');

test('after a long time away the session count starts over', async ({ page }) => {
  await seed(page, 2, 9); // two sessions counted, nine hours ago
  await page.goto('/');
  await expect(eyebrow(page)).toContainText('Study session 1 of 4');
  await expect(page.locator('.toast')).toContainText('Fresh start');
});

test('an hour away is still the same run of study: the count stays', async ({ page }) => {
  await seed(page, 2, 1);
  await page.goto('/');
  await expect(eyebrow(page)).toContainText('Study session 3 of 4');
  await expect(page.locator('.toast', { hasText: 'Fresh start' })).toHaveCount(0);
});

test('"Never" keeps the count however long you were away', async ({ page }) => {
  await seed(page, 2, 72);
  await page.addInitScript(() => {
    const raw = JSON.parse(localStorage.getItem('studybuddy.v1')!);
    raw.state.settings = { cycleResetHours: 0 };
    localStorage.setItem('studybuddy.v1', JSON.stringify(raw));
  });
  await page.goto('/');
  await expect(eyebrow(page)).toContainText('Study session 3 of 4');
});

test('pick where you are in the cycle from the timer, and start over from Settings', async ({ page }) => {
  await page.goto('/');
  await expect(eyebrow(page)).toContainText('Study session 1 of 4');
  await eyebrow(page).click();
  const menu = page.locator('#cycleMenu');
  await expect(menu).toContainText('A long break comes after session 4.');
  await menu.getByRole('button', { name: /Session 3/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(eyebrow(page)).toContainText('Study session 3 of 4');
  await expect(page.locator('.cycle .dot.on')).toHaveCount(2);

  // The last session of the cycle: the long break is announced.
  await eyebrow(page).click();
  await menu.getByRole('button', { name: /Session 4/ }).click();
  await expect(page.locator('.cycle')).toContainText('Long break after this session');

  // Escape closes the menu without changing anything.
  await eyebrow(page).click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(eyebrow(page)).toContainText('Study session 4 of 4');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dlg = page.locator('#settingsDlg');
  await expect(dlg.locator('#cycleReset')).toHaveValue('4');
  await dlg.locator('#cycleReset').selectOption('8');
  await dlg.locator('#cycleStartOver').click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(eyebrow(page)).toContainText('Study session 1 of 4');
  await eyebrow(page).click();
  await expect(menu).toContainText('after 8 hours away');
});

test('a longer quiz: pick the length in Settings, the quiz is asked for that many, and the break table stays by share', async ({ page }) => {
  let asked = 0;
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/ai/quiz', (r) => {
    const n = (r.request().postDataJSON() as { n: number }).n;
    asked = n;
    return r.fulfill({ json: { questions: Array.from({ length: n }, (_, i) => ({
      id: `q${i}`, concept: `Idea ${i}`, question: `Question ${i}?`, options: ['A', 'B', 'C', 'D'], correctIndex: 0,
      explanation: 'Because.', memoryAid: 'Remember.', optionFeedback: ['Right.', 'No.', 'No.', 'No.'] })) } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dlg = page.locator('#settingsDlg');
  await dlg.locator('#qnSelect').selectOption('8');
  await expect(dlg).toContainText('Longer quizzes take longer to write');
  await dlg.getByRole('button', { name: 'Done' }).click();

  // The break chips group the scores of a long quiz.
  const tiers = page.locator('.tiers');
  await expect(tiers).toContainText('8/8 → 15m');
  await expect(tiers).toContainText('4–7/8 → 10m');
  await expect(tiers).toContainText('0–3/8 → 5m');

  await page.fill('#ctxTopic', 'Krebs cycle');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.getByText('Quiz ready · 8 questions')).toBeVisible();
  expect(asked).toBe(8);
});
