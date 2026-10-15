import { test, expect, quietCelebrations, type Page } from '../pw';
import type { Browser } from '@playwright/test';
import path from 'node:path';

const FAKE = 'http://localhost:54321';
const rows = async (table: string) => (await (await fetch(`${FAKE}/test/rows?table=${table}`)).json()) as Record<string, unknown>[];
const linkFor = async (email: string) => (await (await fetch(`${FAKE}/test/link?email=${encodeURIComponent(email)}`)).json()).url as string;

const footer = (page: Page) => page.locator('.sync-status');

/** A second browser profile, i.e. another device. The streak card stays off unless a test wants it. */
async function device(browser: Browser, celebrate = false) {
  const ctx = await browser.newContext();
  await quietCelebrations(ctx, { celebrate });
  return ctx.newPage();
}

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
  const a = await device(browser);
  await a.clock.install();
  await a.goto('/');
  await expect(footer(a)).toContainText('studying as a guest', { timeout: 15_000 });
  await a.fill('#ctxTopic', 'Philosophy · Plato and Aristotle');
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
  await expect(a.locator('#ctxTopic')).toHaveValue('Philosophy · Plato and Aristotle');
  expect((await rows('profiles')).find((p) => p.id === guestId)).toBeTruthy(); // same user, upgraded in place

  // A lecture uploaded here is saved to the account, pages included.
  await a.locator('#docInput').setInputFiles(path.join(__dirname, '..', 'fixtures', 'lecture.pptx'));
  await expect(a.locator('#docSelect')).toContainText('lecture.pptx', { timeout: 30_000 });
  await expect.poll(async () => (await rows('documents')).length, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await rows('document_pages')).length, { timeout: 15_000 }).toBe(7);

  /* ---------- device B: a different guest with their own task signs in to the same account ---------- */
  const b = await device(browser);
  await b.goto('/');
  await expect(footer(b)).toContainText('studying as a guest', { timeout: 15_000 });
  await addTask(b, 'Make flashcards');
  await expect.poll(async () => (await rows('tasks')).length, { timeout: 15_000 }).toBe(2);

  await emailSignIn(b, 'ana@test.dev', /sign-in link/);
  // B now has the account's data, plus its own guest task merged in.
  await expect(b.locator('.task-list')).toContainText('Read lecture 3');
  await expect(b.locator('.task-list')).toContainText('Make flashcards');
  await expect(b.locator('#ctxTopic')).toHaveValue('Philosophy · Plato and Aristotle');
  await expect(b.locator('#todayCard .log')).toContainText('Philosophy · Plato and Aristotle');
  // The lecture is here too; its page text comes from the account, so a goal from a slide's body works.
  await expect(b.locator('#docSelect')).toContainText('lecture.pptx');
  await b.selectOption('#docSelect', { label: 'lecture.pptx · 7 slides' });
  await b.fill('#docGoal', 'the allegory of the cave');
  await expect(b.locator('.goal-box')).toContainText('(slide 4). Correct?', { timeout: 15_000 });
  await expect.poll(async () => (await rows('tasks')).filter((r) => r.user_id === guestId).map((r) => r.text).sort(), { timeout: 15_000 })
    .toEqual(['Make flashcards', 'Read lecture 3']);

  /* ---------- a change on B shows up on A ---------- */
  await b.fill('#ctxTopic', 'Aristotle on virtue');
  await expect.poll(async () => {
    const p = (await rows('profiles')).find((r) => r.id === guestId) as { context?: { topic?: string } } | undefined;
    return p?.context?.topic;
  }, { timeout: 15_000 }).toBe('Aristotle on virtue');
  await a.reload();
  await expect(a.locator('#ctxTopic')).toHaveValue('Aristotle on virtue', { timeout: 15_000 });

  /* ---------- signing out on B (from Settings) leaves nothing behind for the next person ---------- */
  await b.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(b.locator('#settingsDlg')).toContainText('ana@test.dev');
  await b.locator('#settingsDlg').getByRole('button', { name: 'Sign out' }).click();
  await expect(footer(b)).toContainText('studying as a guest', { timeout: 15_000 });
  await expect(b.locator('.task-list')).toContainText('Add what you want to get through today.');
  await expect(b.locator('#ctxTopic')).toHaveValue('');
  await expect(b.locator('#docSelect')).toHaveCount(0); // no documents left, so no picker
});

test('the streak celebration shows once a day per account, and both devices share the streak', async ({ browser }) => {
  // Device A: yesterday's check-in is already there; today's first action celebrates a 2-day streak.
  const a = await device(browser, true);
  await a.addInitScript(() => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const d = new Date(Date.now() - 86_400_000);
    const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { checkins: [y] }, version: 1 }));
  });
  await a.goto('/');
  await expect(footer(a)).toContainText('studying as a guest', { timeout: 15_000 });
  await emailSignIn(a, 'bo@test.dev', /click the link to finish/);
  await a.fill('#taskInput', 'Outline the essay');
  await a.locator('#taskInput').press('Enter');
  const card = a.locator('.celebrate-dlg');
  await expect(card).toContainText('2-day streak!');
  await card.getByRole('button', { name: 'Keep going' }).click();
  // Both days reach the account, with today marked as celebrated.
  await expect.poll(async () => (await rows('profiles')).some((r) => {
    const st = r.app_state as { checkins?: string[]; celebrated?: string } | null;
    return st?.checkins?.length === 2 && st.celebrated === st.checkins[1];
  }), { timeout: 15_000 }).toBe(true);

  // Device B signs in to the same account: same streak, and its first action of the day doesn't celebrate again.
  const b = await device(browser, true);
  await b.goto('/');
  await expect(footer(b)).toContainText('studying as a guest', { timeout: 15_000 });
  await emailSignIn(b, 'bo@test.dev', /sign-in link/);
  await expect(b.locator('#streakPills')).toHaveAttribute('aria-label', /Check-in streak: 2 days/);
  await b.fill('#taskInput', 'Make flashcards');
  await b.locator('#taskInput').press('Enter');
  await expect(b.locator('.task-list')).toContainText('Make flashcards');
  await b.waitForTimeout(1500);
  await expect(b.locator('.celebrate-dlg')).toBeHidden();
});

test('deleting an account removes its rows and starts this device over as a guest', async ({ browser }) => {
  const a = await device(browser);
  await a.goto('/');
  await expect(footer(a)).toContainText('studying as a guest', { timeout: 15_000 });
  await emailSignIn(a, 'cleo@test.dev', /click the link to finish/);
  await addTask(a, 'Delete me');
  await expect.poll(async () => (await rows('tasks')).some((r) => r.text === 'Delete me'), { timeout: 15_000 }).toBe(true);
  const id = (await rows('tasks')).find((r) => r.text === 'Delete me')!.user_id;

  await a.getByRole('button', { name: 'Settings', exact: true }).click();
  await a.getByRole('button', { name: 'Delete…' }).click();
  await a.fill('#deleteConfirm', 'DELETE');
  await a.getByRole('button', { name: 'Delete my account' }).click();
  await expect(footer(a)).toContainText('studying as a guest', { timeout: 15_000 });
  await expect(a.locator('.task-list')).toContainText('Add what you want to get through today.');
  expect((await rows('tasks')).filter((r) => r.user_id === id)).toEqual([]);
  expect((await rows('profiles')).filter((r) => r.id === id)).toEqual([]);
});
