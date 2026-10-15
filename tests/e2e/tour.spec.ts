import { test, expect } from '../pw';

test.use({ tour: true });

test('a first-time visitor gets a tour from their buddy, step by step, once', async ({ page }) => {
  await page.goto('/');
  const tour = page.getByRole('dialog', { name: 'Hi, I\'m Albert!' });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Show me around' }).click();
  const card = page.locator('.tour-card');
  await expect(card).toContainText('Tell me what you\'re studying');
  await expect(page.locator('.tour-spot')).toBeVisible();
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Start a focus session');
  await card.getByRole('button', { name: 'Back' }).click();
  await expect(card).toContainText('Tell me what you\'re studying');
  // Arrow keys work too; walk to the end.
  for (let k = 0; k < 12 && !(await card.textContent())?.includes('You\'re all set!'); k++) await page.keyboard.press('ArrowRight');
  await expect(card.getByRole('heading')).toHaveText('You\'re all set!');
  await card.getByRole('button', { name: 'Let\'s study' }).click();
  await expect(page.locator('.tour')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Start studying/ }).waitFor();
  await page.waitForTimeout(1600);
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('the tour can be skipped from any step, and taken again later', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.tour-card');
  await card.getByRole('button', { name: 'Show me around' }).click();
  await card.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.locator('.tour')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('studybuddy.tour'))).toBe('skipped');

  // Escape skips too; the shortcuts dialog brings it back.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await expect(card).toContainText('Hi, I\'m Albert!');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('someone who has studied before never gets the tour by itself', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('studybuddy.v1')) localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { checkins: ['2026-01-05'] }, version: 1 }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Start studying/ }).waitFor();
  await page.waitForTimeout(1600);
  await expect(page.locator('.tour')).toHaveCount(0);
});
