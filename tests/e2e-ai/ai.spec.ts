import { test, expect, type Page } from '../pw';
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

test('photos go to the assistant, and the study buddy reacts to the conversation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ask the study assistant/ }).click();
  const panel = page.locator('.assistant');
  const mark = panel.locator('.assistant-mark');
  await expect(mark.locator('.mascot.gator')).toBeVisible(); // the picked buddy, Albert by default

  // Attach a photo of notes: it shows in the tray, then rides along with the message.
  await page.locator('#assistantPhotos').setInputFiles(fixture('notes-photo.png'));
  await expect(panel.locator('.photo-tray img')).toHaveCount(1);
  await page.locator('#assistantBox').fill("Here's my answer to question 2. I think it's B");
  await page.keyboard.press('Enter');
  await expect(panel.locator('.bubble.me .bubble-photos img')).toHaveCount(1);
  await expect(panel.locator('.photo-tray')).toHaveCount(0);
  await expect(panel.locator('.bubble.bot').last()).toContainText('I can see 1 photo');
  const req = (await sent(page)).at(-1)!;
  const parts = req.body.contents.at(-1)!.parts as { inlineData?: { mimeType: string; data: string } }[];
  expect(parts[0].inlineData?.mimeType).toBe('image/jpeg');
  expect(parts[0].inlineData!.data.length).toBeGreaterThan(1000);
  expect(req.body.systemInstruction!.parts[0].text).toContain('attach photos');
  // A right answer makes the buddy happy, a wrong one sad.
  await expect(mark).toHaveAttribute('data-mood', 'happy');
  await expect(panel.locator('.bot-avatar')).toHaveAttribute('data-mood', 'happy');
  await page.locator('#assistantBox').fill("Next one: I think it's C");
  await page.keyboard.press('Enter');
  await expect(panel.locator('.bubble.bot').last()).toContainText('Turns so far: 3');
  await expect(mark).toHaveAttribute('data-mood', 'sad');

  // Photos alone can be sent; removing one from the tray works.
  await page.locator('#assistantPhotos').setInputFiles([fixture('notes-photo.png'), fixture('notes-photo.png')]);
  await expect(panel.locator('.photo-tray img')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Remove photo 2' }).click();
  await expect(panel.locator('.photo-tray img')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.locator('.bubble.bot').last()).toContainText('I can see 2 photos');

  // After a reload the chat keeps small thumbnails only; the full photos aren't saved.
  await page.reload();
  const saved = await page.evaluate(() => localStorage.getItem('studybuddy.chat') ?? '');
  expect(saved).toContain('data:image/jpeg');
  expect(saved).not.toContain('"data":');
  await page.getByRole('button', { name: /Ask the study assistant/ }).click();
  await expect(panel.locator('.bubble-photos img')).toHaveCount(2);
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

test('the weekly report gets an AI summary once, written from the week\'s real numbers', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const d = new Date(); d.setHours(10, 0, 0, 0);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const items = [{ concept: 'Forms', question: 'Q', chosen: 'a', answer: 'a', correct: true }];
    const history = [{ id: 'w1', date: iso, startedAt: d.getTime(), endedAt: d.getTime() + 40 * 60000, plannedMin: 40, studiedMin: 40, subject: '', topic: 'Philosophy',
      level: 'intro', goal: '', quiz: { status: 'done', score: 1, total: 1, items } }];
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { history }, version: 1 }));
  });
  await page.goto('/weekly');
  await expect(page.locator('.week-hero h2')).toHaveText('A steady week of study.');
  await expect(page.locator('.week-hero')).toContainText('You studied 40 minutes this week.');
  await expect(page.locator('.focus-list')).toContainText('Finish the Aristotle slides.');
  const weeklyCalls = async () => (await sent(page)).filter((s) => textOf(s).includes('weekly report for'));
  const [call] = await weeklyCalls();
  expect(textOf(call)).toContain('THIS WEEK: study 40 min in 1 sessions');
  expect(textOf(call)).toContain('never shaming');
  await page.reload();
  await expect(page.locator('.week-hero h2')).toHaveText('A steady week of study.');
  expect(await weeklyCalls()).toHaveLength(1); // saved, not asked again
});

test('a quiz covers what was on the shared screen, not yesterday\'s slides; "Quiz me on" switches sources', async ({ page }) => {
  test.setTimeout(150_000);
  // The shared "window" shows Python code, not the philosophy deck that's selected.
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const ctx = c.getContext('2d')!;
      const paint = () => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = '#111'; ctx.font = '44px monospace';
        ['def total(numbers):', '    result = 0', '    for n in numbers:', '        result += n', '    return result', 'print(total([1, 2, 3]))']
          .forEach((l, i) => ctx.fillText(l, 60, 110 + i * 80));
      };
      paint();
      setInterval(paint, 200);
      return c.captureStream(5);
    };
    localStorage.setItem('studybuddy.screenConsent', '1');
  });
  await page.goto('/');
  await page.locator('#docInput').setInputFiles(fixture('lecture.pptx'));
  await expect(page.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Share screen to track slides' }).click();
  await expect(page.locator('.watch-pill').first()).toContainText(/Sharing|Watching/);
  await page.getByRole('button', { name: /Start studying/ }).click();
  // Wait until the screen has been read (the text lands on the live session).
  await expect.poll(async () => page.evaluate(() => (JSON.parse(localStorage.getItem('studybuddy.v1') || '{}').state?.timer?.session?.screen ?? '').length), { timeout: 60_000 }).toBeGreaterThan(40);

  await page.getByRole('button', { name: /Finish session now/ }).click();
  const picker = page.locator('.quiz-pick');
  await expect(picker.getByRole('button', { name: 'What was on my screen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByRole('button', { name: /lecture\.pptx/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.locator('#qText')).toContainText('On your screen');

  // What reached the AI: the screen's text and a snapshot, and not the slides.
  const quizCalls = (await sent(page)).filter((s) => textOf(s).includes('retrieval-practice quizzes'));
  const last = quizCalls.at(-1)!;
  expect(textOf(last)).toContain('<<<SCREEN');
  expect(textOf(last)).not.toContain('<<<MATERIAL');
  expect(JSON.stringify(last.body.contents.at(-1))).toContain('inlineData');
});

test('"Quiz me on" can switch to the document, and plans can be cleared or made from the to-do list', async ({ page }) => {
  await page.goto('/');
  await page.locator('#docInput').setInputFiles(fixture('lecture.pptx'));
  await expect(page.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 60_000 });
  await page.fill('#taskInput', 'Python quiz on loops');
  await page.keyboard.press('Enter');

  // Plan from the to-do list, then clear it.
  await page.locator('#planCard').getByRole('button', { name: 'Plan my next session' }).click();
  await expect(page.locator('#planCard')).toContainText('Next up: Python quiz on loops', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Clear plan' }).click();
  await expect(page.locator('#planCard')).toContainText('Or make one now from your to-do list (1 open)');

  // Quiz me on: no screen shared, so the document is on; turning it off rewrites the quiz from the topic alone.
  await page.getByRole('button', { name: /Start studying/ }).click();
  await page.getByRole('button', { name: /Finish session now/ }).click();
  const docChip = page.locator('.quiz-pick').getByRole('button', { name: /lecture\.pptx/ });
  await expect(docChip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeVisible({ timeout: 15_000 });
  await docChip.click();
  await expect(docChip).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.locator('#qText')).not.toContainText('slide');
});
