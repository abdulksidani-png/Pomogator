import { test, expect, type Page } from '@playwright/test';

const FAKE = 'http://localhost:4010';
test.beforeEach(async ({ page }) => { await page.request.post(`${FAKE}/__reset`); });

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

test('Spotify: connect, see what is playing, pause and skip', async ({ page }) => {
  let state = { name: 'Weightless', artist: 'Marconi Union', playing: true };
  const calls: string[] = [];
  await page.route('https://i.scdn.co/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#6a5acd"/></svg>' }));
  await page.route('https://accounts.spotify.com/authorize**', (r) => {
    const u = new URL(r.request().url());
    expect(u.searchParams.get('client_id')).toBe('test-spotify');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3102/spotify');
    return r.fulfill({ status: 302, headers: { location: `http://localhost:3102/spotify?code=abc&state=${u.searchParams.get('state')}` } });
  });
  await page.route('https://accounts.spotify.com/api/token', (r) => {
    const body = new URLSearchParams(r.request().postData() ?? '');
    expect(body.get('code')).toBe('abc');
    expect(body.get('code_verifier')).toHaveLength(64);
    return r.fulfill({ json: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } });
  });
  await page.route('https://api.spotify.com/v1/me/player**', (r) => {
    const req = r.request();
    const path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBe('Bearer at');
    if (req.method() !== 'GET') {
      calls.push(`${req.method()} ${path}`);
      if (path.endsWith('/pause')) state = { ...state, playing: false };
      if (path.endsWith('/play')) return r.fulfill({ status: 403, json: { error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } } });
      if (path.endsWith('/next')) state = { name: 'Electra', artist: 'Airstream', playing: true };
      return r.fulfill({ status: 204 });
    }
    return r.fulfill({ json: {
      is_playing: state.playing, progress_ms: 61_000, device: { name: 'MacBook' },
      item: { name: state.name, duration_ms: 480_000, artists: [{ name: state.artist }], album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/a', width: 300 }] }, external_urls: { spotify: 'https://open.spotify.com/track/x' } },
    } });
  });

  await page.goto('/');
  const card = page.locator('#musicCard');
  await card.getByRole('button', { name: 'Connect Spotify' }).click();
  await expect(page).toHaveURL('http://localhost:3102/');
  await expect(page.locator('.toast')).toContainText('Spotify connected');
  await expect(card.locator('.music-title')).toHaveText('Weightless');
  await expect(card.locator('.music-artist')).toHaveText('Marconi Union');
  await expect(card).toContainText('Now playing');
  await expect(card).toContainText('Playing on MacBook');
  await expect(card.locator('.music-disc')).toHaveClass(/spinning/);

  await card.getByRole('button', { name: 'Pause music' }).click();
  await expect(card).toContainText('Paused');
  await card.getByRole('button', { name: 'Next song' }).click();
  await expect(card.locator('.music-title')).toHaveText('Electra');
  expect(calls).toEqual(['PUT /v1/me/player/pause', 'POST /v1/me/player/next']);

  // Without Premium, Spotify refuses the controls: say so plainly.
  await card.getByRole('button', { name: 'Pause music' }).click();
  await card.getByRole('button', { name: 'Play music' }).click();
  await expect(card).toContainText('Premium');

  // The connection stays after a reload, and can be removed in Settings.
  await page.reload();
  await expect(card.locator('.music-title')).toHaveText('Electra');

  // Full-screen timer: the player moves to a corner, and can be hidden and brought back.
  await page.getByRole('button', { name: 'Full screen timer' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-focus', 'on');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await page.getByRole('button', { name: 'Hide music' }).click();
  await expect(card).toBeHidden();
  await page.getByRole('button', { name: 'Show music' }).click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-focus', 'on');
  expect(await card.evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#settingsDlg').getByRole('button', { name: 'Disconnect' }).click();
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();
  await expect(card.getByRole('button', { name: 'Connect Spotify' })).toBeVisible();
});
