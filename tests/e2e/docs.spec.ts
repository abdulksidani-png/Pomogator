import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = (name: string) => path.join(__dirname, '..', 'fixtures', name);

async function upload(page: Page, name: string) {
  await page.locator('#docInput').setInputFiles(fixture(name));
  await expect(page.locator('#docSelect')).toContainText(name, { timeout: 60_000 });
}

test('PowerPoint: plain-language goal, progress, goal met, and resuming next time', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await upload(page, 'lecture.pptx');
  await expect(page.locator('#docSelect option:checked')).toHaveText(/lecture\.pptx · 7 slides/);
  await expect(page.locator('#ctxTopic')).toHaveValue('lecture');

  await page.fill('#docGoal', 'study up until the Aristotle slide');
  await expect(page.locator('.goal-box')).toContainText('slides 1–5, ending at “Plato vs Aristotle on the Forms” (slide 5). Correct?');
  await page.getByRole('button', { name: 'Yes, set goal' }).click();
  await expect(page.locator('.goal-box.set')).toContainText('Goal: up to slide 5');

  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.locator('.doc-progress')).toContainText('Slide 1 of 7');
  await expect(page.locator('.doc-progress')).toContainText('Goal: slide 5 · 4 to go');
  await page.selectOption('#nowOn', '5');
  await expect(page.locator('.toast')).toContainText('Goal reached: slide 5');

  await page.clock.fastForward('25:02');
  await page.getByRole('button', { name: /Take a 5-min break/ }).click();
  await expect(page.locator('.reach')).toContainText('Goal met');
  await expect(page.locator('#reached')).toHaveValue('5');

  // Next session picks up right after where this one stopped.
  await page.getByRole('button', { name: 'Skip to the next phase' }).click();
  await expect(page.locator('#startPage')).toHaveValue('6');
  await expect(page.locator('#materialField')).toContainText('Resume at slide 6: Aristotle: Virtue Ethics');
  await expect(page.locator('#docGoal')).toHaveValue('');
});

test('PDF and Word files are split into pages and sections with their titles', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'lecture.pdf');
  await expect(page.locator('#startPage option')).toHaveCount(7);
  await expect(page.locator('#startPage option').nth(5)).toHaveText('Page 6 · Aristotle: Virtue Ethics');

  await upload(page, 'lecture.docx');
  await expect(page.locator('#startPage option')).toHaveCount(7);
  await expect(page.locator('#startPage option').nth(3)).toHaveText('Section 4 · Plato: The Theory of Forms');

  // The library lists both, with outlines.
  await page.getByRole('button', { name: 'Manage documents' }).click();
  await expect(page.locator('#docsDlg .doc-item')).toHaveCount(2);
  await page.locator('#docsDlg .doc-item').filter({ hasText: 'lecture.pdf' }).getByRole('button', { name: 'Outline' }).click();
  await expect(page.locator('#docsDlg .doc-outline li')).toHaveCount(7);
});

test('photos of notes are read on the device', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await upload(page, 'notes-photo.png');
  await expect(page.locator('#startPage option').first()).toContainText('Aristotle', { timeout: 60_000 });
});

test('the study panel is one topic box plus documents; an old subject folds into the topic', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('studybuddy.v1')) localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { context: { subject: 'Biology', topic: 'Krebs cycle', goal: 'Memorize the 8 steps' } }, version: 1 }));
  });
  await page.goto('/');
  await expect(page.locator('#ctxTopic')).toHaveValue('Biology · Krebs cycle');
  await expect(page.locator('#ctxCard input[type="text"]')).toHaveCount(1); // just the topic
  await expect(page.locator('#ctxCard textarea, #ctxCard select')).toHaveCount(0); // no notes box, no subject or level
  await expect(page.locator('#ctxGoal')).toContainText('Memorize the 8 steps');
  await page.getByRole('button', { name: 'Clear this goal' }).click();
  await expect(page.locator('#ctxGoal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#ctxLevel').selectOption('exam');
  await page.locator('#ctxExam').fill('MCAT');
  await expect(page.locator('#ctxExam')).toHaveValue('MCAT');
});

test('screen tracking reads the shared slides window and follows along', async ({ page }) => {
  test.setTimeout(150_000);
  // Stand in for the browser's screen-share picker: a canvas "window" showing lecture slides.
  await page.addInitScript(() => {
    const slides: Record<number, [string, string[]]> = {
      4: ['Plato: The Theory of Forms', ['Forms are perfect abstract realities', 'The allegory of the cave', 'Justice in the Republic']],
      6: ['Aristotle: Virtue Ethics', ['Eudaimonia is the highest good', 'Virtue is a mean between extremes', 'Habituation builds character']],
    };
    (window as unknown as { __slide: number }).__slide = 4;
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const ctx = c.getContext('2d')!;
      const paint = () => {
        const [title, lines] = slides[(window as unknown as { __slide: number }).__slide];
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = '#111'; ctx.font = 'bold 64px sans-serif'; ctx.fillText(title, 70, 130);
        ctx.font = '40px sans-serif';
        lines.forEach((l, i) => ctx.fillText('• ' + l, 90, 260 + i * 80));
      };
      paint();
      setInterval(paint, 200);
      return c.captureStream(5);
    };
  });
  await page.goto('/');
  await upload(page, 'lecture.pptx');

  // The share button sits right under the study material; it works before a session starts.
  await page.getByRole('button', { name: 'Share screen to track slides' }).click();
  await expect(page.locator('#screenDlg')).toBeVisible();          // first time: explain before sharing
  await page.getByRole('button', { name: 'Choose window to share' }).click();
  await expect(page.locator('.share-row .watch-pill')).toContainText('Sharing');
  // Sharing turned screen tracking on in Settings, where its options now show.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#scrToggle')).toBeChecked();
  await page.locator('#scrEvery').fill('1');
  await page.locator('#settingsDlg').getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.locator('#screenDlg')).not.toBeVisible();      // already sharing: no second ask
  await expect(page.locator('.watch-row .watch-pill')).toContainText('Watching');
  await expect(page.locator('.doc-progress')).toContainText('Slide 4 of 7', { timeout: 60_000 });

  await page.evaluate(() => { (window as unknown as { __slide: number }).__slide = 6; });
  await expect(page.locator('.doc-progress')).toContainText('Slide 6 of 7', { timeout: 60_000 });
  await page.locator('.seen-log summary').click();
  await expect(page.locator('.seen-log')).toContainText('Aristotle: Virtue Ethics');

  // Ending the session stops the sharing.
  await page.getByRole('button', { name: /Finish session now/ }).click();
  await expect(page.locator('.watch-pill')).toHaveCount(0);
  await expect(page.locator('.qcard')).toBeVisible(); // straight to the quiz, even early
  await page.getByRole('button', { name: /Take a 5-min break/ }).click();
  await expect(page.locator('#reached')).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Share screen to track slides' })).toBeVisible();
});

test('appearance: theme, accent, timer style and background stick after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Midnight' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Accent #7C4DDB' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Ring' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Grid paper' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Tall' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Done' }).click();
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-skin', 'midnight');
  await expect(html).toHaveAttribute('data-bg', 'grid');
  await expect(html).toHaveAttribute('data-clockfont', 'condensed');
  await expect(page.locator('.timer-ring')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#7C4DDB');
});

test('tab sound: a shared lecture tab\'s speech becomes notes for the session', async ({ page }) => {
  test.setTimeout(90_000);
  // A fake speech reader, so the test doesn't download the real model.
  await page.route('**/asr-worker.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `self.onmessage = (e) => {
      if (e.data.type === 'load') { self.postMessage({ type: 'progress', pct: 50 }); self.postMessage({ type: 'ready' }); return; }
      const secs = Math.round(e.data.audio.length / 16000);
      self.postMessage({ type: 'text', text: '[Music] The mitochondria makes energy, clip of ' + secs + ' seconds.' });
    };`,
  }));
  // Stand in for sharing a tab with its sound: a canvas plus a steady tone.
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async (opts?: DisplayMediaStreamOptions) => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 360;
      c.getContext('2d')!.fillRect(0, 0, 640, 360);
      const s = c.captureStream(5);
      if (opts?.audio) {
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest); osc.start();
        s.addTrack(dest.stream.getAudioTracks()[0]);
      }
      return s;
    };
  });
  await page.goto('/');
  await page.fill('#ctxTopic', 'Cell biology');
  await page.locator('#shareSound').check();
  await page.getByRole('button', { name: 'Share screen to track slides' }).click();
  await page.getByRole('button', { name: 'Choose window to share' }).click();
  await expect(page.locator('.share-row')).toContainText('Listening');
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.locator('.heard')).toContainText('Heard: “The mitochondria makes energy, clip of 12 seconds.”', { timeout: 40_000 });
  await page.locator('.heard summary').click();
  await expect(page.locator('.heard-text')).toContainText('mitochondria');
  await expect(page.locator('.heard-text')).not.toContainText('[Music]');
});

test('study buddies: pick Albert or the robot, and they study at a desk while the timer runs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mascot-wrap')).toBeHidden(); // the tomato only shows in its theme, until you pick it
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Notebook' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Tomato', exact: true }).click();
  await expect(page.locator('.mascot-wrap .mascot.tomato')).toBeVisible();
  await page.locator('#lookDlg').getByRole('button', { name: /Albert/ }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.mascot-wrap .mascot.gator')).toBeVisible();
  await expect(page.locator('.mascot-wrap .type-a')).toHaveCount(0);
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.locator('.mascot-wrap .mascot')).toHaveAttribute('data-mood', 'focus');
  await expect(page.locator('.mascot-wrap .type-a')).toHaveCount(1); // typing on a laptop
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Robot', exact: true }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Hidden' }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.mascot-wrap')).toBeHidden();
});

test('buddy themes bring their buddy: Jungle → gorilla, Panther → Panfer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.locator('#lookDlg').getByRole('button', { name: 'Jungle' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'jungle');
  await expect(page.locator('.mascot-wrap .mascot.gorilla')).toBeVisible();
  await page.locator('#lookDlg').getByRole('button', { name: 'Panther', exact: true }).click();
  await expect(page.locator('.mascot-wrap .mascot.panther')).toBeVisible();
  await page.locator('#lookDlg').getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Start studying/ }).click();
  await expect(page.locator('.mascot-wrap .pencil')).toHaveCount(1); // taking notes
});
