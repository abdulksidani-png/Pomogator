import { test, expect, type Page } from '@playwright/test';

const FAKE = 'http://localhost:54321';
const rows = async (table: string) => (await (await fetch(`${FAKE}/test/rows?table=${table}`)).json()) as Record<string, unknown>[];
const linkFor = async (email: string) => (await (await fetch(`${FAKE}/test/link?email=${encodeURIComponent(email)}`)).json()).url as string;

const footer = (page: Page) => page.locator('.sync-status');

async function addTask(page: Page, text: string) {
  await page.fill('#taskInput', text);
  await page.locator('#taskInput').press('Enter');
  await expect(page.locator('.task-list')).toContainText(text);
}

async function emailSignIn(page: Page, email: string, expectNote: RegExp) {
  await page.getByRole('button', { name: /Sign in to save your progress/ }).click();
  await page.fill('#signinEmail', email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.locator('#signinDlg .note')).toContainText(expectNote);
  const link = await linkFor(email);
  expect(link).toBeTruthy();
  await page.goto(link); // what clicking the link in the email does
  await expect(footer(page)).toContainText(`Synced to ${email}`, { timeout: 15_000 });
}

test('guest progress survives sign-in, follows you to a second device, and stays private on sign-out', async ({ browser }) => {
  /* ---------- device A: study as a guest ---------- */
  const a = await (await browser.newContext()).newPage();
  await a.clock.install();
  await a.goto('/');
  await expect(footer(a)).toContainText('studying as a guest', { timeout: 15_000 });
  await a.fill('#ctxSubject', 'Philosophy');
  await a.fill('#ctxTopic', 'Plato and Aristotle');
  await addTask(a, 'Read lecture 3');

  await a.getByRole('button', { name: /Start studying/ }).click();
  await a.clock.fastForward('13:00');
  await a.getByRole('button', { name: /Finish session now/ }).click();
  await a.getByRole('button', { name: /Take a 5-min break/ }).click();
  await expect(a.locator('#todayCard .log')).toContainText('Philosophy · Plato and Aristotle');

  // It reaches the database as the guest's own rows.
  await expect.poll(async () => (await rows('tasks')).map((r) => r.text), { timeout: 15_000 }).toContain('Read lecture 3');
  await expect.poll(async () => (await rows('study_sessions')).length).toBe(1);
  const guestId = (await rows('tasks'))[0].user_id;

  /* ---------- device A: sign in with email; the guest becomes the account ---------- */
  await emailSignIn(a, 'ana@test.dev', /click the link to finish/);
  await expect(a.locator('.task-list')).toContainText('Read lecture 3');
  await expect(a.locator('#ctxTopic')).toHaveValue('Plato and Aristotle');
  expect((await rows('profiles')).find((p) => p.id === guestId)).toBeTruthy(); // same user, upgraded in place

  /* ---------- device B: a different guest with their own task signs in to the same account ---------- */
  const b = await (await browser.newContext()).newPage();
  await b.goto('/');
  await expect(footer(b)).toContainText('studying as a guest', { timeout: 15_000 });
  await addTask(b, 'Make flashcards');
  await expect.poll(async () => (await rows('tasks')).length, { timeout: 15_000 }).toBe(2);

  await emailSignIn(b, 'ana@test.dev', /sign-in link/);
  // B now has the account's data, plus its own guest task merged in.
  await expect(b.locator('.task-list')).toContainText('Read lecture 3');
  await expect(b.locator('.task-list')).toContainText('Make flashcards');
  await expect(b.locator('#ctxTopic')).toHaveValue('Plato and Aristotle');
  await expect(b.locator('#todayCard .log')).toContainText('Philosophy · Plato and Aristotle');
  await expect.poll(async () => (await rows('tasks')).filter((r) => r.user_id === guestId).map((r) => r.text).sort(), { timeout: 15_000 })
    .toEqual(['Make flashcards', 'Read lecture 3']);

  /* ---------- a change on B shows up on A ---------- */
  await b.fill('#ctxGoal', 'Get up to the Aristotle slide');
  await expect.poll(async () => {
    const p = (await rows('profiles')).find((r) => r.id === guestId) as { context?: { goal?: string } } | undefined;
    return p?.context?.goal;
  }, { timeout: 15_000 }).toBe('Get up to the Aristotle slide');
  await a.reload();
  await expect(a.locator('#ctxGoal')).toHaveValue('Get up to the Aristotle slide', { timeout: 15_000 });

  /* ---------- signing out on B leaves nothing behind for the next person ---------- */
  await b.getByRole('button', { name: /Account menu/ }).click();
  await b.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(footer(b)).toContainText('studying as a guest', { timeout: 15_000 });
  await expect(b.locator('.task-list')).toContainText('Add what you want to get through today.');
  await expect(b.locator('#ctxTopic')).toHaveValue('');
});
