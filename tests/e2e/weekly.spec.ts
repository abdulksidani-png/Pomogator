import { test, expect, type Page } from '@playwright/test';

// Last week: two 25-minute sessions (Tuesday and Wednesday), 4 of 6 quiz answers right. This week: one 30-minute session today.
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date(); today.setHours(10, 0, 0, 0);
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
    const at = (base: Date, plus: number) => { const d = new Date(base); d.setDate(d.getDate() + plus); return d; };
    const item = (concept: string, correct: boolean) => ({ concept, question: `About ${concept}?`, chosen: 'a', answer: correct ? 'a' : 'b', correct });
    const sess = (d: Date, min: number, items: ReturnType<typeof item>[], id: string) => ({
      id, date: iso(d), startedAt: d.getTime(), endedAt: d.getTime() + min * 60000, plannedMin: min, studiedMin: min, subject: '', topic: 'Philosophy',
      level: 'intro', goal: '', breakMin: 10, quiz: { status: 'done', score: items.filter((i) => i.correct).length, total: items.length, items },
    });
    const history = [
      sess(at(monday, 1), 25, [item('Forms', false), item('Cave', true), item('Virtue', false)], 'a'),
      sess(at(monday, 2), 25, [item('Forms', true), item('Cave', true), item('Virtue', true)], 'b'),
      sess(today, 30, [item('Forms', true), item('Virtue', true), item('Cave', true)], 'c'),
    ];
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { history }, version: 1 }));
  });
}

test('"Your week in review" leads to last week\'s report, with numbers, charts and focus steps', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const banner = page.locator('#weekBanner');
  await expect(banner).toContainText('Your week in review is ready');
  await expect(banner).toContainText('50 min studied');
  await banner.getByRole('button', { name: 'See your week' }).click();
  await expect(page).toHaveURL(/\/weekly\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText('Your week in review', { exact: true })).toBeVisible();

  const tile = (label: string) => page.locator('.tile', { hasText: label });
  await expect(tile('Study time')).toContainText('50 min');
  await expect(tile('Sessions')).toContainText('2');
  await expect(tile('Quiz accuracy')).toContainText('67%');
  await expect(tile('Study streak')).toContainText('2 days');
  // Without AI, the summary comes from the numbers.
  await expect(page.locator('.week-hero')).toContainText('You studied 50 min over 2 days');
  await expect(page.locator('.focus-list li')).toHaveCount(3);
  await expect(page.locator('.col-slot')).toHaveCount(7);
  await expect(page.locator('.line-dot')).toHaveCount(2);

  // The week's image downloads as a PNG.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save as image' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^pomogator-week-\d{4}-\d{2}-\d{2}\.png$/);

  // On to this week: one session so far, compared with last week.
  await page.getByRole('button', { name: 'Later week' }).click();
  await expect(page.getByText('This week so far', { exact: true })).toBeVisible();
  await expect(tile('Study time')).toContainText('30 min');
  await expect(tile('Study time')).toContainText('▼ 20 min vs. last week');
  await expect(tile('Quiz accuracy')).toContainText('▲ 33 pts vs. last week');

  // Focus steps can go straight onto the to-do list; the banner doesn't come back once the week was opened.
  await page.getByRole('button', { name: 'Add to my to-do list' }).click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await page.getByRole('button', { name: /Back to the timer/ }).click();
  await expect(page.locator('#tasksCard li')).toHaveCount(3);
  await expect(page.locator('#weekBanner')).toHaveCount(0);
});

test('an empty week says so kindly, and the banner can be dismissed', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.locator('#weekBanner').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#weekBanner')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#weekBanner')).toHaveCount(0);
  await page.goto('/weekly?week=2020-01-06');
  await expect(page.locator('.stats-empty')).toContainText('Nothing studied this week');
  await expect(page.locator('.week-hero')).toContainText('A quiet week');
});

test('the loading screen shows the logo, then fades away', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash .splash-mark')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('.splash')).toBeHidden({ timeout: 5000 });
  await page.getByRole('button', { name: /Start studying/ }).click(); // clicks were never blocked
});
