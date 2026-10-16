import { test, expect } from '../pw';

test('study points unlock cosmetics that every buddy can wear', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('studybuddy.v1')) return;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const checkins = [3, 2, 1].map((n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); });
    // Three check-ins in a row (10 + 11 + 12) and 100 points from older sessions; the propeller hat was a gift.
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { checkins, pointsBank: 100, gifts: ['propeller'] }, version: 1 }));
  });
  await page.goto('/');
  const chip = page.locator('#pointsBtn');
  await expect(chip).toHaveText('133');
  await chip.click();

  const shop = page.locator('#shopDlg');
  await expect(shop).toBeVisible();
  await expect(shop.locator('#pointsBalance')).toHaveText('133');
  const item = (id: string) => shop.locator(`.shop-item[data-id="${id}"]`);
  await expect(item('cowboy').getByRole('button', { name: /Unlock · 120/ })).toBeEnabled();
  await expect(item('propeller')).toContainText('A gift, free to wear.');

  await item('sunglasses').getByRole('button', { name: /Unlock · 60/ }).click();
  await expect(shop.locator('#pointsBalance')).toHaveText('73');
  await expect(item('cowboy').getByRole('button', { name: /Unlock/ })).toBeDisabled();
  const stageBuddy = page.locator('#stage .mascot-wrap .mascot');
  await expect(stageBuddy).toHaveAttribute('data-wear', 'sunglasses');

  // Universal: switch to Rocket and the sunglasses stay on.
  await shop.getByRole('group', { name: 'Buddy' }).getByRole('button', { name: 'Rocket' }).click();
  await expect(page.locator('#stage .mascot-wrap .mascot.bulldog')).toHaveAttribute('data-wear', 'sunglasses');

  await item('sunglasses').getByRole('button', { name: 'Wearing' }).click();
  await expect(stageBuddy).not.toHaveAttribute('data-wear', /./);
  await item('sunglasses').getByRole('button', { name: 'Wear' }).click();

  // Save the look as an outfit, change everything, then put the outfit back on in one click.
  await shop.locator('#outfitName').fill('Game day');
  await shop.getByRole('button', { name: 'Save outfit' }).click();
  await shop.getByRole('group', { name: 'Buddy' }).getByRole('button', { name: 'Albert' }).click();
  await item('propeller').getByRole('button', { name: 'Wear' }).click();
  await expect(page.locator('#stage .mascot-wrap .mascot.gator')).toHaveAttribute('data-wear', 'sunglasses propeller');
  // The gear shows everywhere the buddy does, the assistant button too.
  await expect(page.locator('.assistant-fab .mascot')).toHaveAttribute('data-wear', 'sunglasses propeller');
  await shop.getByRole('button', { name: 'Wear the outfit "Game day"' }).click();
  await expect(page.locator('#stage .mascot-wrap .mascot.bulldog')).toHaveAttribute('data-wear', 'sunglasses');
  await shop.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await expect(page.locator('#pointsBtn')).toHaveText('73'); // the gift cost nothing
  await expect(page.locator('#stage .mascot-wrap .mascot.bulldog')).toHaveAttribute('data-wear', 'sunglasses');
  await page.locator('#pointsBtn').click();
  await shop.getByRole('button', { name: 'Delete the outfit "Game day"' }).click();
  await expect(shop.locator('.outfit')).toHaveCount(0);
});
