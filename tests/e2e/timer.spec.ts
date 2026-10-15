import { test, expect, type Page } from '@playwright/test';

const look = (page: Page) => page.locator('#lookDlg');

async function setLength(page: Page, min: number) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#settingsDlg').getByRole('button', { name: `${min} min`, exact: true }).click();
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();
}

test('saved timers: name a look and length, switch back to it, and delete it', async ({ page }) => {
  await page.goto('/');
  // Set up a late-night look: Panther theme, mono clock, ring, 45-minute sessions.
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await look(page).getByRole('button', { name: 'Panther', exact: true }).click();
  await look(page).getByRole('button', { name: 'Mono' }).click();
  await look(page).getByRole('button', { name: 'Ring' }).click();
  await look(page).getByRole('button', { name: 'Done' }).click();
  await setLength(page, 45);

  const menuBtn = page.locator('#timerMenuBtn');
  await menuBtn.click();
  const menu = page.locator('#timerMenu');
  await expect(menu).toContainText('Nothing saved yet');
  await expect(menu.locator('.tm-now')).toContainText('45 min · Panther · Mono · Ring · Panfer');
  await menu.getByLabel('Name for this setup').fill('Late night');
  await menu.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toast')).toContainText('Saved "Late night"');
  await expect(menuBtn).toContainText('Late night');

  // Change everything back, then switch to the saved timer in one click.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await look(page).getByRole('button', { name: 'Notebook' }).click();
  await look(page).getByRole('button', { name: 'Classic' }).click();
  await look(page).getByRole('button', { name: 'Done' }).click();
  await setLength(page, 25);
  await expect(menuBtn).toContainText('My timers');
  await expect(page.locator('.clock')).toHaveText('25:00');

  await menuBtn.click();
  await menu.getByRole('button', { name: /Late night/ }).first().click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-skin', 'panther');
  await expect(html).toHaveAttribute('data-clockfont', 'mono');
  await expect(page.locator('.timer-ring')).toBeVisible();
  await expect(page.locator('.clock')).toHaveText('45:00');
  await expect(page.locator('.mascot-wrap .mascot.panther')).toBeVisible();
  await expect(menuBtn).toContainText('Late night');

  // Saved timers stay after a reload; deleting one takes two clicks.
  await page.reload();
  await expect(menuBtn).toContainText('Late night');
  await menuBtn.click();
  const del = menu.getByRole('button', { name: 'Delete Late night' });
  await del.click();
  await menu.getByRole('button', { name: 'Press again to delete Late night' }).click();
  await expect(menu).toContainText('Nothing saved yet');
});

test('full-screen timer: F or the button, the clock fills the screen, Esc leaves', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await page.getByRole('button', { name: 'Full screen timer' }).click();
  await expect(html).toHaveAttribute('data-focus', 'on');
  await expect(page.locator('header.top')).toBeHidden();
  await expect(page.locator('#ctxCard')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  const box = await page.locator('#stage').boundingBox();
  const vp = page.viewportSize()!;
  expect(box?.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box?.height).toBeGreaterThanOrEqual(vp.height - 1);

  // The timer still works in full screen.
  await page.keyboard.press('Space');
  await expect(page.locator('#stage')).toHaveAttribute('data-status', 'running');
  await page.keyboard.press('Escape');
  await expect(html).not.toHaveAttribute('data-focus', 'on');
  await expect(page.locator('#ctxCard')).toBeVisible();
  await expect(page.locator('#stage')).toHaveAttribute('data-status', 'running');

  await page.keyboard.press('f');
  await expect(html).toHaveAttribute('data-focus', 'on');
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(html).not.toHaveAttribute('data-focus', 'on');
});

test('the next-session plan folds shut and stays that way', async ({ page }) => {
  await page.goto('/');
  const head = page.locator('#planCard').getByRole('button', { name: 'Next-session plan' });
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#planCard .loop-steps')).toBeVisible();
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#planBody')).toHaveAttribute('inert', '');
  await expect.poll(async () => (await page.locator('#planBody').boundingBox())?.height ?? 0).toBeLessThan(2);
  await page.reload();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await page.locator('#planBody').boundingBox())?.height ?? 0).toBeGreaterThan(40);
});
