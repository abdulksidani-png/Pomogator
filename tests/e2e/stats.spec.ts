import { test, expect } from '../pw';

// A few days of study, saved the way the app saves it, so the Stats page has something to show.
async function seed(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const item = (concept: string, correct: boolean) => ({ concept, question: `About ${concept}?`, chosen: 'a', answer: 'b', correct });
    const sess = (n: number, min: number, items: ReturnType<typeof item>[], extra = {}) => {
      const d = day(n); d.setHours(10, 0, 0, 0);
      return { id: `s${n}-${min}`, date: iso(d), startedAt: d.getTime(), endedAt: d.getTime() + min * 60000, plannedMin: 25, studiedMin: min,
        subject: 'Biology', topic: 'Krebs cycle', level: 'intro', goal: '', breakMin: 10,
        quiz: items.length ? { status: 'done', score: items.filter((i) => i.correct).length, total: items.length, items } : { status: 'skipped' }, ...extra };
    };
    const history = [
      sess(2, 25, [item('NADH yield', false), item('Location', true)]),
      sess(1, 30, [item('NADH yield', true), item('Location', true)], { docId: 'd1', startPage: 1, endPage: 3, goalPage: 3, goalMet: true }),
      sess(0, 25, [item('NADH yield', true), item('Location', true)]),
    ];
    const docs = [{ id: 'd1', name: 'lecture.pptx', kind: 'pptx', size: 1, pageCount: 6, titles: ['Intro', 'Cycle', 'Yield', 'More', 'Review', 'End'], createdAt: 0, furthest: 3 }];
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { history, docs }, version: 1 }));
  });
}

test('the Stats page shows totals, charts, documents and concepts, and leads back to the timer', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole('heading', { name: 'Your stats' })).toBeVisible();

  await page.getByRole('button', { name: 'All time' }).click();
  const tile = (label: string) => page.locator('.tile', { hasText: label });
  await expect(tile('Study time')).toContainText('1 h 20 min');
  await expect(tile('Quiz accuracy')).toContainText('83%');
  await expect(tile('Quiz accuracy')).toContainText('5 of 6 right');
  await expect(tile('Goals met')).toContainText('100%');
  await expect(tile('Study streak')).toContainText('3 days');
  await expect(page.locator('.def').first()).toHaveAttribute('data-def', /half their planned length/);

  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await expect(page.locator('.col-slot')).toHaveCount(30);
  await page.locator('.col-slot').last().hover();
  await expect(page.locator('.chart-tip')).toContainText('25 min');
  await expect(page.locator('.heat-cell.l2').first()).toBeVisible();

  await expect(page.locator('.doc-cov')).toContainText('3 of 6 · 50%');
  await expect(page.locator('.cov.c2')).toHaveCount(3);
  await expect(page.locator('.concept-list').first()).toContainText('NADH yield');
  await expect(page.locator('.concept-list').last()).toContainText('NADH yield'); // missed once, then right twice: mastered

  // Reloading /stats stays on Stats; Back returns to the timer.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your stats' })).toBeVisible();
  await page.getByRole('button', { name: /Back to the timer/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /Start studying/ })).toBeVisible();
});

test('a running timer keeps going on the Stats page, shown in the header', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.locator('.timer-pill')).toContainText(/2[45]:\d\d study/);
  await expect(page.getByText('Nothing to show yet')).toBeVisible();
  await page.locator('.timer-pill').click();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
});
