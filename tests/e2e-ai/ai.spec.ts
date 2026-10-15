import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = (name: string) => path.join(__dirname, '..', 'fixtures', name);
const GEMINI = 'http://localhost:4010';

interface Sent { model: string; body: { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] } }
const sent = async (page: Page): Promise<Sent[]> => (await page.request.get(`${GEMINI}/__requests`)).json();
const textOf = (s: Sent) => s.body.contents.at(-1)!.parts.map((p) => p.text).join('');

test.beforeEach(async ({ page }) => { await page.request.post(`${GEMINI}/__reset`); });

test('the quiz is written from the slides covered, and a plan follows', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#docInput').setInputFiles(fixture('lecture.pptx'));
  await expect(page.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 60_000 });
  await page.fill('#docGoal', 'up to slide 5');
  await page.getByRole('button', { name: 'Yes, set goal' }).click();
  await expect(page.getByText('Quizzes aren\'t switched on yet')).toHaveCount(0);

  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.getByText(/Quiz ready · 3 questions/)).toBeVisible({ timeout: 15_000 });

  // What reached the AI: slides 1–5 of the deck, not the rest.
  const quizCall = (await sent(page)).find((s) => textOf(s).includes('retrieval-practice quizzes'))!;
  expect(textOf(quizCall)).toContain('[Slide 5]');
  expect(textOf(quizCall)).not.toContain('[Slide 6]');
  expect(textOf(quizCall)).toContain('from "lecture.pptx"');

  await page.clock.fastForward('25:02');
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.locator('#qText')).toContainText('What does slide 1');
  for (let i = 0; i < 3; i++) {
    await page.locator('.opt', { hasText: 'The right answer' }).click();
    await expect(page.locator('.fb')).toContainText('(See slide 1.)');
    await page.locator('#qNext').click();
  }
  await expect(page.locator('#resultBanner')).toContainText('3/3');
  await expect(page.locator('#planCard')).toContainText('Finish the Aristotle slides', { timeout: 15_000 });
});

test('the assistant answers questions about the document and plans a to-do list', async ({ page }) => {
  await page.goto('/');
  await page.locator('#docInput').setInputFiles(fixture('lecture.pptx'));
  await expect(page.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 60_000 });

  await page.getByRole('button', { name: /Ask the study assistant/ }).click();
  const panel = page.locator('.assistant');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Reading lecture.pptx');

  // A question about the document: the whole deck goes along.
  await page.locator('#assistantBox').fill('What is this lecture about?');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.bubble.bot').last()).toContainText('I can see lecture.pptx');
  const chat = (await sent(page)).at(-1)!;
  expect(chat.body.systemInstruction!.parts[0].text).toContain('[Slide 7]');

  // Planning a to-do list: the proposal is only added on a click.
  await panel.getByRole('button', { name: 'Clear' }).click();
  await panel.getByRole('button', { name: 'Make my to-do list' }).click();
  await expect(page.locator('#assistantBox')).toHaveValue(/plan it around my study timer/);
  await page.locator('#assistantBox').pressSequentially('read chapter 4 and outline my history essay');
  await page.keyboard.press('Enter');
  const proposal = panel.locator('.proposal');
  await expect(proposal).toContainText('Outline the history essay');
  await expect(proposal).toContainText('3 sessions · about 1 h 15 min of focus');
  await expect(page.locator('#tasksCard .task-list')).not.toContainText('Read chapter 4');
  await proposal.getByRole('button', { name: 'Add to my to-do list' }).click();
  await expect(proposal).toContainText('Added to your to-do list');
  await expect(page.locator('#tasksCard .task-list')).toContainText('Read chapter 4 · 1 session');
  await expect(page.locator('#tasksCard .task-list')).toContainText('Outline the history essay · 2 sessions');

  // The conversation is sent along, so follow-ups make sense.
  await page.locator('#assistantBox').fill('thanks!');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.bubble.bot').last()).toContainText('Turns so far: 3');

  // When the free limit is hit (on both models), it says so plainly.
  await page.locator('#assistantBox').fill('LIMIT_TEST');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.bubble.err')).toContainText('free AI limit');

  // Keys typed in the chat don't trigger timer shortcuts, and Escape closes it.
  await page.locator('#assistantBox').fill('r s d');
  await expect(page.getByRole('button', { name: /Start studying/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('"Plan with AI" opens the assistant ready for a to-do list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan with AI' }).click();
  await expect(page.locator('#assistantBox')).toHaveValue(/Here's everything I need to do: $/);
});

test('an upload is read by the AI in the background: topic, key ideas, and the assistant remembers it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#docInput').setInputFiles(fixture('lecture.pptx'));
  await expect(page.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 60_000 });
  await expect(page.locator('.digest-line')).toContainText('Read by AI: Ancient Greek philosophy', { timeout: 15_000 });
  await expect(page.locator('#ctxTopic')).toHaveValue('Ancient Greek philosophy'); // the file-name topic was replaced
  await page.locator('.digest-line summary').click();
  await expect(page.locator('.digest-concepts')).toContainText('Allegory of the cave');
  const digestCall = (await sent(page)).find((s) => textOf(s).includes('write compact study notes'))!;
  expect(textOf(digestCall)).toContain('[Slide 7]');

  // Saved on this device: a reload doesn't read it again.
  await page.reload();
  await expect(page.locator('.digest-line')).toContainText('Ancient Greek philosophy');
  expect((await sent(page)).filter((s) => textOf(s).includes('write compact study notes'))).toHaveLength(1);

  // The assistant knows every document read so far, even when none is open.
  await page.locator('#docSelect').selectOption('');
  await page.getByRole('button', { name: /Ask the study assistant/ }).click();
  await page.locator('#assistantBox').fill('What did I upload?');
  await page.keyboard.press('Enter');
  await expect(page.locator('.assistant .bubble.bot').last()).toContainText('No document is open');
  const chat = (await sent(page)).at(-1)!;
  expect(chat.body.systemInstruction!.parts[0].text).toContain('"lecture.pptx" (7 slides): Ancient Greek philosophy.');
});
