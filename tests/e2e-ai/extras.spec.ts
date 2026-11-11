import { test, expect, type Page } from '../pw';

const FAKE = 'http://localhost:4010';
test.beforeEach(async ({ page }) => { await page.request.post(`${FAKE}/__reset?what=extras`); });

const openLook = async (page: Page) => {
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page.locator('#lookDlg')).toBeVisible();
};
const bgImage = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-image'));

test('Unsplash: pick a background by mood, credit the photographer, and get a new photo each day', async ({ page }) => {
  await page.goto('/');
  await openLook(page);
  const dlg = page.locator('#lookDlg');
  await dlg.getByRole('button', { name: 'Rainy window' }).click();
  await expect(dlg.locator('.photo-tile')).toHaveCount(12);
  await dlg.getByRole('button', { name: /Use photo by Photographer 0/ }).click();

  await expect(page.locator('html')).toHaveAttribute('data-bg', 'image');
  expect(await bgImage(page)).toContain('/img/rain-on-window-0.svg');
  expect(await bgImage(page)).toContain('w=2400');
  await expect(page.locator('.foot .photo-credit')).toHaveText('Photo by Photographer 0 on Unsplash');
  await expect(page.locator('.foot .photo-credit a').first()).toHaveAttribute('href', /utm_source=pomogator/);
  await expect.poll(async () => (await (await page.request.get(`${FAKE}/__unsplash`)).json()).join(' ')).toContain('/photos/rain-on-window-0/download');

  await dlg.getByRole('button', { name: 'More photos' }).click();
  await expect(dlg.locator('.photo-tile')).toHaveCount(24);

  // Glass cards.
  await dlg.getByRole('button', { name: 'Glass' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-cards', 'glass');

  // A new photo every day: today keeps the chosen one; on a new day the mood brings a fresh one.
  await dlg.locator('#photoDaily').check();
  expect(await bgImage(page)).toContain('/img/rain-on-window-0.svg');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('studybuddy.v1')!);
    raw.state.settings.bgPhoto.day = '2000-01-01';
    localStorage.setItem('studybuddy.v1', JSON.stringify(raw));
  });
  await page.reload();
  await expect.poll(() => bgImage(page)).toContain('/img/rain-on-window-99.svg');
});

test('Last.fm: anyone can show what they play by username, from any music app', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#musicCard');
  await expect(card.locator('.music-steps li')).toHaveCount(3);
  await expect(card.getByRole('button', { name: /Spotify/ })).toHaveCount(0);
  const field = card.getByLabel(/Your Last.fm username/);
  await field.fill('has space');
  await expect(card.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
  await field.fill('nowplayer');
  await card.getByRole('button', { name: 'Connect', exact: true }).click();

  // The song and art come through the site's /api/lastfm route; Last.fm can't control playback, so no buttons.
  await expect(card.locator('.music-title')).toHaveText('Gator Groove');
  await expect(card.locator('.music-artist')).toHaveText('The Swamp Band');
  await expect(card).toContainText('Now playing');
  await expect(card).toContainText('via Last.fm · nowplayer');
  await expect(card.getByRole('button', { name: 'Next song' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Open on Last.fm' })).toHaveAttribute('href', /last\.fm\/music/);
  expect(await (await page.request.get(`${FAKE}/__lastfm`)).json()).toContain('nowplayer');

  // Album art: a square by default; the spinning record is a choice in Settings → Music.
  await expect(card.locator('.music-disc')).toHaveAttribute('data-art', 'square');
  await expect(card.locator('.music-hole')).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#settingsDlg').locator('#musicArt-disc').click();
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();
  await expect(card.locator('.music-disc')).toHaveAttribute('data-art', 'disc');
  await expect(card.locator('.music-hole')).toBeVisible();
  await expect(card.locator('.music-disc')).toHaveCSS('border-radius', '50%');
  await expect(card.locator('.music-disc.spinning')).toHaveCSS('animation-name', 'disc-spin');
  await page.reload();
  await expect(card.locator('.music-disc')).toHaveAttribute('data-art', 'disc'); // remembered

  // Settings → Music: change the username. A missing user says so plainly; a past play shows as "Last played".
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dlg = page.locator('#settingsDlg');
  await expect(dlg.locator('#lastfmUser')).toHaveValue('nowplayer');
  await dlg.locator('#lastfmUser').fill('nobody');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card).toContainText('Last.fm has no user called "nobody"');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dlg.locator('#lastfmUser').fill('quietone');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card.locator('.music-title')).toHaveText('Yesterday Tune');
  await expect(card).toContainText(/Last played · \d min ago/);

  // A song saved long ago is usually not what was last heard, so it isn't shown: the card waits for music instead.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dlg.locator('#lastfmUser').fill('longago');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card).toContainText('Nothing playing right now');
  await expect(card.locator('.music-title')).toHaveCount(0);

  // A pause: Last.fm stops saying "playing" and its newest saved song is an older one. The card keeps the song that
  // was playing (as paused) instead of jumping to that older song, also after closing and reopening the site.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dlg.locator('#lastfmUser').fill('flipper');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card.locator('.music-title')).toHaveText('Gator Groove');
  await expect(card).toContainText('Now playing');
  await page.request.get(`${FAKE}/__flip?playing=0`);
  await expect(card).toContainText('Paused', { timeout: 20_000 });
  await expect(card.locator('.music-title')).toHaveText('Gator Groove');
  await page.reload();
  await expect(card.locator('.music-title')).toHaveText('Gator Groove');
  await expect(card).toContainText('Paused');
  await expect(card).not.toContainText('Older Song');
  // Playing again shows within a few seconds.
  await page.request.get(`${FAKE}/__flip?playing=1`);
  await expect(card).toContainText('Now playing', { timeout: 8_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dlg.locator('#lastfmUser').fill('quietone');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card.locator('.music-title')).toHaveText('Yesterday Tune');

  // The route only accepts real usernames; Remove goes back to the connect card.
  expect((await page.request.get('/api/lastfm?user=../etc')).status()).toBe(400);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dlg.getByRole('button', { name: 'Remove' }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(card.getByLabel(/Your Last.fm username/)).toBeVisible();
});
