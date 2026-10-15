import { test, expect, type Page } from '@playwright/test';

// Claude replies are faked here so the loop can be tested before the real AI routes exist.
const QUIZ = {
  questions: [
    { id: 'q1', concept: 'Krebs cycle location', question: 'Where does the Krebs cycle take place?', options: ['Mitochondrial matrix', 'Cytoplasm', 'Inner membrane', 'Nucleus'], correctIndex: 0,
      explanation: 'Its enzymes sit in the matrix.', memoryAid: 'Krebs lives in the Matrix.', optionFeedback: ['Right.', 'Glycolysis happens there.', 'That is the electron transport chain.', 'The nucleus holds DNA.'] },
    { id: 'q2', concept: 'NADH yield', question: 'How many NADH per turn?', options: ['1', '2', '3', '4'], correctIndex: 2,
      explanation: 'Three NAD+ are reduced per turn.', memoryAid: '3-1-1: 3 NADH, 1 FADH2, 1 ATP.', optionFeedback: ['Too few.', 'Close.', 'Right.', 'Too many.'] },
    { id: 'q3', concept: 'Starting molecule', question: 'Acetyl-CoA joins which molecule to start the cycle?', options: ['Oxaloacetate', 'Pyruvate', 'Citrate', 'Succinate'], correctIndex: 0,
      explanation: 'Acetyl-CoA plus oxaloacetate makes citrate.', memoryAid: 'OAA opens the door.', optionFeedback: ['Right.', 'Comes earlier.', 'That is the product.', 'Comes later.'] },
  ],
};
const ANSWERS: Record<string, string> = { 'Where does': 'Mitochondrial matrix', 'How many': '3', 'Acetyl-CoA': 'Oxaloacetate' };
const PLAN = {
  summary: 'Location is solid. Spend time on the energy yield.', strong: ['Krebs cycle location'], review: ['NADH yield'],
  actions: [{ minutes: 15, technique: 'Active recall', step: 'Write the products per turn from memory.' }, { minutes: 15, technique: 'Practice problems', step: 'Count the yield for 2 glucose.' }],
  suggestedMinutes: 30, nextGoal: 'Memorize the yields per turn',
};

async function fakeClaude(page: Page) {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/ai/quiz', (r) => r.fulfill({ json: QUIZ }));
  await page.route('**/api/ai/plan', (r) => r.fulfill({ json: PLAN }));
}

test('a guest studies, takes the quiz and earns a break that matches the score', async ({ page }) => {
  await fakeClaude(page);
  await page.clock.install();
  await page.goto('/');
  await page.fill('#ctxSubject', 'Biology');
  await page.fill('#ctxTopic', 'Krebs cycle');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.getByText('Quiz ready · 3 questions')).toBeVisible();

  await page.clock.fastForward('25:02');
  await page.getByRole('button', { name: 'Start quiz' }).click();

  for (let i = 0; i < 3; i++) {
    const q = (await page.locator('#qText').textContent()) ?? '';
    const right = Object.entries(ANSWERS).find(([k]) => q.startsWith(k))![1];
    const options = await page.locator('.opt span:nth-child(2)').allTextContents();
    const idx = options.indexOf(right);
    await page.locator('.opt').nth(i === 0 ? (idx + 1) % 4 : idx).click(); // miss the first one
    if (i === 0) {
      await expect(page.locator('.verdict')).toContainText('Not quite');
      await expect(page.locator('.aid')).toBeVisible();
      await expect(page.locator('.why')).toBeVisible();
    }
    await page.locator('#qNext').click();
  }

  await expect(page.locator('#resultBanner')).toContainText('2/3');
  await expect(page.locator('#resultBanner')).toContainText('10-minute break earned');
  await expect(page.locator('#planCard')).toContainText('Apply plan · 30-min session');
  await expect(page.locator('#todayCard')).toContainText('2/3');

  // A refresh in the middle of the break keeps the right time.
  await page.getByRole('button', { name: /Start break/ }).click();
  await page.clock.fastForward('01:00');
  await page.reload();
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /^9 minutes/);

  // Applying the plan sets the next session.
  await page.getByRole('button', { name: /Apply plan/ }).click();
  await expect(page.locator('#ctxGoal')).toHaveValue('Memorize the yields per turn');
});

test('without AI the timer still works and ends in a no-quiz break', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.fill('#ctxTopic', 'Krebs cycle');
  await expect(page.getByText('Quizzes aren\'t switched on yet')).toBeVisible();
  await page.getByRole('button', { name: /Start studying/ }).click();
  await page.clock.fastForward('25:02');
  await expect(page.getByText('No quiz this round')).toBeVisible();
  await page.getByRole('button', { name: /Take a 5-min break/ }).click();
  await expect(page.locator('#resultBanner')).toContainText('5-minute break');
});

test('skipping a session goes straight to a break, no quiz', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await page.clock.fastForward('05:00');
  // Skipping isn't finishing: no quiz.
  await page.getByRole('button', { name: 'Skip to the next phase' }).click();
  await expect(page.locator('#resultBanner')).toContainText('Session skipped');
});

test('"Finish session now" always goes to the quiz, even early', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.fill('#ctxTopic', 'Krebs cycle');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await page.clock.fastForward('03:00');
  await page.getByRole('button', { name: /Finish session now/ }).click();
  await expect(page.locator('.qcard')).toBeVisible();
  await expect(page.locator('.q-head')).toContainText('SESSION COMPLETE');
  await expect(page.locator('#resultBanner')).toHaveCount(0);
});

test('starting the timer never asks to share the screen; it only opens from its button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#scrToggle').check();
  await expect(page.locator('#scrAsk')).toHaveCount(0);
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await expect(page.locator('#screenDlg')).not.toBeVisible();
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.getByRole('button', { name: 'Share screen to track slides' }).click();
  await expect(page.locator('#screenDlg')).toBeVisible();
});

test('start and pause play a short sound, unless switched off', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) { w.__tones++; return orig.call(this); };
  });
  await page.goto('/');
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect.poll(tones).toBeGreaterThan(0);
  const afterStart = await tones();
  await page.getByRole('button', { name: /Pause/ }).click();
  await expect.poll(tones).toBeGreaterThan(afterStart);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#ctlSounds').uncheck();
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();
  const before = await tones();
  await page.getByRole('button', { name: /Resume/ }).click();
  await page.waitForTimeout(300);
  expect(await tones()).toBe(before);
});
