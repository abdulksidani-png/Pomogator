import { test, expect, type Page } from '../pw';

test.use({ celebrate: true });

/** Check-ins on days before today (1 = yesterday), in the browser's own calendar. */
async function seed(page: Page, daysAgo: number[]) {
  await page.addInitScript((ago) => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const checkins = ago.map((n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); });
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { checkins }, version: 1 }));
  }, daysAgo);
}

async function addTask(page: Page, text: string) {
  await page.fill('#taskInput', text);
  await page.locator('#taskInput').press('Enter');
}

test('the first action of the day celebrates the streak once, with a badge on milestones', async ({ page }) => {
  await seed(page, [1, 2]);
  await page.goto('/');
  // Opening the page isn't a check-in: the streak still runs through yesterday, and the flame is unlit.
  const pills = page.locator('#streakPills');
  await expect(pills).toHaveAttribute('aria-label', /Check-in streak: 2 days \(check in today to keep it\)\. Study streak: 0 days/);
  await expect(page.locator('.celebrate-dlg')).toBeHidden();

  await addTask(page, 'Read chapter 4');
  const card = page.locator('.celebrate-dlg');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('3-day streak!');
  await expect(card.locator('.week-strip li[data-mark="done"]')).toHaveCount(3);
  await expect(card.locator('.week-strip li[data-today]')).toHaveAttribute('data-mark', 'done');
  await expect(card).toContainText('New badge: 3 days');
  await expect(card.locator('.confetti i').first()).toBeAttached();
  await card.getByRole('button', { name: 'Keep going' }).click();
  await expect(card).toBeHidden();
  await expect(pills).toHaveAttribute('aria-label', /^Check-in streak: 3 days\. Study streak: 0 days/);
  await expect(pills.locator('.sp').first()).toHaveAttribute('data-lit', '1');

  // Once a day: more actions and a reload don't bring it back.
  await addTask(page, 'Make flashcards');
  await page.reload();
  await addTask(page, 'Outline the essay');
  await expect(page.locator('#tasksCard li')).toHaveCount(3);
  await expect(card).toBeHidden();

  // The badge is on the Stats page.
  await pills.click();
  await expect(page).toHaveURL(/\/stats$/);
  const shelf = page.locator('#badgesCard');
  await expect(shelf.locator('li[data-earned="1"]')).toHaveCount(1);
  await expect(shelf).toContainText('Next: One week (4 to go)');
});

test('after a break the streak starts again kindly, with the best so far', async ({ page }) => {
  await seed(page, [10, 11, 12, 13, 14]);
  await page.goto('/');
  await page.getByRole('button', { name: /Start studying/ }).click();
  const card = page.locator('.celebrate-dlg');
  await expect(card.getByRole('heading')).toHaveText('Welcome back!');
  await expect(card).toContainText('New streak starts today. Your best is 5 days.');
  await expect(card.locator('.badge-earned')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible(); // the timer kept running underneath
});

test('a week in a row with reduced motion: the badge, no confetti; the card can be switched off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, [1, 2, 3, 4, 5, 6]);
  await page.goto('/');
  await addTask(page, 'Review notes');
  const card = page.locator('.celebrate-dlg');
  await expect(card.getByRole('heading')).toHaveText('7-day streak!');
  await expect(card).toContainText('New badge: One week');
  await expect(card.locator('.confetti')).toBeHidden();
  await card.getByRole('button', { name: 'See my badges' }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.locator('#badgesCard li[data-earned="1"]')).toHaveCount(2); // 3 days and one week

  // Off on this device: tomorrow's check-in still counts, with no card.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#celebrateToggle').uncheck();
  expect(await page.evaluate(() => localStorage.getItem('studybuddy.celebrate'))).toBe('off');
});
