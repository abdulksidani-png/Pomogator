// Screenshots for the README (docs/screenshots), the link preview (app/opengraph-image.png) and the home-screen icon
// (app/apple-icon.png), taken from the real app with sample study data and stand-in AI and Spotify replies.
// No account, key or personal data is involved.
//
//   npm run build && npx next start -p 3100     # in one terminal
//   node scripts/screenshots.mjs                # in another (PW_CHROMIUM_PATH=... to use an installed Chromium)
//   node scripts/screenshots.mjs stats          # just one group: loop, stats, assistant, focus or phones
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'pomogator-shots-'));
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'lecture.pptx');
const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const art = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset=".55" stop-color="#e2557a"/><stop offset="1" stop-color="#4b2c8f"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="95" r="44" fill="#fff3"/><path d="M0 230 Q75 190 150 230 T300 230 V300 H0z" fill="#0003"/></svg>`);

const quiz = { questions: [
  { id: 'q1', concept: 'Theory of Forms', question: 'According to Plato, what are the Forms?',
    options: ['Perfect, unchanging ideas that physical things imitate', 'The four elements everything is made of', 'Habits that make a person virtuous', 'Questions that expose contradictions'],
    correctIndex: 0, explanation: 'Plato held that the Forms are perfect, abstract realities. The things we see are imperfect copies of them, like shadows on a cave wall. (See slide 4.)',
    memoryAid: 'Picture the cave: the shadows on the wall are everyday things; the objects casting them are the Forms.',
    optionFeedback: ['Yes.', 'That was the Presocratics, looking for one basic stuff.', 'That is closer to Aristotle\'s idea of virtue.', 'That describes the Socratic method.'] },
  { id: 'q2', concept: 'Aristotle vs Plato', question: 'How did Aristotle disagree with Plato about the Forms?',
    options: ['Form exists inside matter, not in a separate world', 'The Forms are made of water', 'Knowledge of the Forms is impossible', 'Only numbers are real'],
    correctIndex: 0, explanation: 'Aristotle rejected a separate realm of Forms: the form of a thing is in the thing itself. (See slide 5.)',
    memoryAid: 'Aristotle kept his feet on the ground: form lives IN the thing.', optionFeedback: ['Right.', 'That was Thales.', 'Aristotle thought we learn forms from experience.', 'That was closer to Pythagoras.'] },
  { id: 'q3', concept: 'Socratic method', question: 'What is the Socratic elenchus?',
    options: ['Writing dialogues to entertain', 'Questioning someone until their beliefs show contradictions', 'Measuring the stars', 'Memorizing the laws of Athens'],
    correctIndex: 1, explanation: 'Socrates tested each answer with another question until the beliefs behind it clashed. (See slide 3.)',
    memoryAid: 'Elenchus means "test": every answer gets tested by a question.', optionFeedback: ['Plato wrote the dialogues.', 'Yes.', 'Unrelated.', 'Unrelated.'] },
] };
const plan = {
  summary: 'Strong on Plato\'s Forms and the Socratic method. Next, connect Aristotle\'s ethics to his view of form before the Hellenistic schools.',
  strong: ['Theory of Forms', 'Socratic method'], review: ['Aristotle vs Plato', 'The golden mean'],
  actions: [
    { minutes: 10, technique: 'Active recall', step: 'Without notes, sketch the allegory of the cave and label what each part stands for.' },
    { minutes: 10, technique: 'Elaboration', step: 'Explain in your own words why Aristotle put form inside matter, with one everyday example.' },
    { minutes: 5, technique: 'Flashcards', step: 'Make 5 cards for slides 5–6: eudaimonia, the golden mean, form and matter.' },
  ],
  suggestedMinutes: 25, nextGoal: 'Finish slides 6–7 and explain the golden mean with an example',
};
const digest = {
  topic: 'Ancient Greek philosophy',
  summary: 'From the Presocratics to Aristotle: Socrates\' questioning, Plato\'s Forms, Aristotle\'s answer to them and his virtue ethics, ending with the Hellenistic schools.',
  concepts: ['Theory of Forms', 'Allegory of the cave', 'Socratic method', 'Form and matter', 'Eudaimonia', 'Golden mean', 'Stoicism'],
  sections: [{ from: 1, to: 3, title: 'Before Plato', summary: 'Presocratics and Socrates.' }, { from: 4, to: 5, title: 'Plato and the Forms', summary: 'The Forms and Aristotle\'s reply.' }, { from: 6, to: 7, title: 'Aristotle and after', summary: 'Virtue ethics and the Hellenistic schools.' }],
};
const weekly = {
  headline: 'Your most consistent week yet',
  summary: 'You studied on six days and kept your quiz accuracy high across philosophy and biology. The Theory of Forms is the idea to revisit first, and the lecture deck is almost done.',
  focus: ['Open Monday\'s first session with 5 minutes of recall on the Theory of Forms.', 'Finish lecture.pptx: the last 2 slides on Aristotle and the Hellenistic schools.', 'Keep your hardest sessions in the morning, when your accuracy was highest.'],
};
const assistant = {
  reply: 'Here\'s tonight in 25-minute sessions:\n- **Sessions 1–2:** finish slides 6–7 (Aristotle\'s ethics, the Hellenistic schools)\n- **Session 3:** Krebs cycle flashcards, then draw the cycle from memory\n- **Session 4:** Calc II problem set 4, problems 1–3\n\nYour long break lands after session 4. Want a quick quiz on the Forms before you start?',
  tasks: [{ text: 'Finish philosophy slides 6–7', sessions: 2 }, { text: 'Krebs cycle flashcards', sessions: 1 }, { text: 'Calc II problem set 4: problems 1–3', sessions: 1 }],
};

async function newPage({ w = 1440, h = 900, dpr = 1.5, settings = {}, tasks = [], withHistory = true, withDoc = false, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.route('**/api/config', (r) => r.fulfill({ json: { ai: true, unsplash: false, spotifyClientId: 'demo' } }));
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/ai/digest', async (r) => { await wait(900); return r.fulfill({ json: digest }); });
  await page.route('**/api/ai/quiz', (r) => r.fulfill({ json: quiz }));
  await page.route('**/api/ai/plan', (r) => r.fulfill({ json: plan }));
  await page.route('**/api/ai/day-summary', (r) => r.fulfill({ json: { headline: 'A focused day.', wins: ['Forms'], gaps: ['Golden mean'], tomorrow: ['Slides 6–7'] } }));
  await page.route('**/api/ai/weekly', (r) => r.fulfill({ json: weekly }));
  await page.route('**/api/ai/assistant', async (r) => { await wait(600); return r.fulfill({ json: assistant }); });
  await page.route('https://api.spotify.com/v1/me/player**', (r) => r.fulfill({ json: { is_playing: true, progress_ms: 98000, device: { name: 'MacBook Air' },
    item: { name: 'Sunset Lover', duration_ms: 202000, artists: [{ name: 'Petit Biscuit' }], album: { name: 'Presence', images: [{ url: 'https://i.scdn.co/image/a', width: 300 }] }, external_urls: { spotify: 'https://open.spotify.com/' } } } }));
  await page.route('https://i.scdn.co/**', (r) => r.fulfill({ body: art, contentType: 'image/svg+xml' }));
  await page.addInitScript(() => {
    const real = Date.now.bind(Date); let off = 0;
    Date.now = () => real() + off;
    window.__skip = (ms) => { off += ms; };
    localStorage.setItem('studybuddy.celebrate', 'off'); // the daily streak card and the tour would cover the shots
    localStorage.setItem('studybuddy.tour', 'done');
  });
  await page.addInitScript(({ settings, tasks, withHistory, withDoc }) => {
    if (localStorage.getItem('studybuddy.v1')) return;
    localStorage.setItem('studybuddy.spotify', JSON.stringify({ access: 'at', refresh: 'rt', expiresAt: Date.now() + 3600e3 }));
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const topics = [
      ['Ancient Greek philosophy', ['Theory of Forms', 'Socratic method', 'Aristotle vs Plato', 'Golden mean']],
      ['Cellular respiration', ['Krebs cycle', 'NADH yield', 'Electron transport chain', 'Glycolysis']],
      ['Calculus II', ['Integration by parts', 'Partial fractions', 'Series convergence', 'Trig substitution']],
      ['Organic chemistry', ['SN1 vs SN2', 'Chirality', 'Resonance', 'E2 elimination']],
    ];
    const history = [];
    if (withHistory) {
      for (let back = 70; back >= 0; back--) {
        const d = new Date(); d.setDate(d.getDate() - back);
        const busy = back === 0 ? 2 : back < 30 ? (rnd() < 0.82 ? 1 + Math.floor(rnd() * 4) : 0) : (rnd() < 0.5 ? 1 + Math.floor(rnd() * 3) : 0);
        for (let k = 0; k < busy; k++) {
          const [topic, concepts] = topics[(back + k) % topics.length];
          d.setHours(9 + k * 2 + (back % 3), 10, 0, 0);
          const min = [25, 25, 30, 45, 25][(back + k) % 5];
          const items = concepts.slice(0, 3).map((c, i) => { const correct = rnd() < 0.62 + (70 - back) / 250; return { concept: c, question: `About ${c}?`, chosen: correct ? 'a' : 'b', answer: 'a', correct }; });
          const score = items.filter((i) => i.correct).length;
          const s = { id: `s${back}-${k}`, date: iso(d), startedAt: d.getTime(), endedAt: d.getTime() + min * 60000, plannedMin: min, studiedMin: min,
            subject: '', topic, level: 'intro', goal: '', breakMin: [5, 5, 10, 15][score], breakKind: 'short',
            quiz: rnd() < 0.9 ? { status: 'done', score, total: 3, items } : { status: 'skipped' } };
          if (withDoc && topic === 'Ancient Greek philosophy' && back < 20) Object.assign(s, { docId: 'd1', docName: 'lecture.pptx', startPage: 1, endPage: Math.min(7, 2 + Math.floor((20 - back) / 4)), goalPage: 5, goalMet: back < 10 });
          history.push(s);
        }
      }
    }
    const docs = withDoc ? [{ id: 'd1', name: 'lecture.pptx', kind: 'pptx', size: 1, pageCount: 7, titles: ['Ancient Philosophy', 'The Presocratics', 'Socrates and the Elenchus', 'Plato: The Theory of Forms', 'Plato vs Aristotle on the Forms', 'Aristotle: Virtue Ethics', 'Hellenistic Schools'], createdAt: 0, furthest: 5 }] : [];
    localStorage.setItem('studybuddy.v1', JSON.stringify({ state: { settings, history, tasks, docs, context: { topic: '' } }, version: 1 }));
  }, { settings, tasks, withHistory, withDoc });
  return page;
}
const TASKS = [
  { id: 't1', text: 'Plato and Aristotle slides · 2 sessions', done: true },
  { id: 't2', text: 'Krebs cycle flashcards · 1 session', done: false },
  { id: 't3', text: 'Calc II problem set 4 · 3 sessions', done: false },
];
const skip = (page, mins) => page.evaluate((ms) => window.__skip(ms), mins * 60000);
const shot = (page, name, opts = {}) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88, ...opts });

if (!only || only === 'loop') {
  const page = await newPage({ settings: { skin: 'gator', mascotKind: 'gator', mascot: 'on', musicWidget: true }, tasks: TASKS });
  await page.goto(BASE);
  await page.locator('.splash').waitFor({ state: 'hidden' }).catch(() => {});
  await page.locator('#docInput').setInputFiles(FIXTURE);
  await page.locator('#docSelect').waitFor();
  await page.getByText('Read by AI').waitFor({ timeout: 30000 });
  await page.fill('#docGoal', 'up to the Aristotle slide');
  await page.getByRole('button', { name: 'Yes, set goal' }).click();
  await page.getByRole('button', { name: /Start studying/ }).click();
  await skip(page, 7.37);
  await page.selectOption('#nowOn', '3');
  await page.getByText(/Quiz ready/).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(5, 5);
  await wait(6000);
  await shot(page, 'hero');
  await page.screenshot({ path: `${SCRATCH}/hero.png` });
  // The quiz: miss the first question (to show the feedback), get the other two.
  await skip(page, 17.7);
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await wait(800);
  await page.locator('.opt', { hasText: 'Questions that expose contradictions' }).click();
  await page.locator('.fb').waitFor();
  await wait(6000);
  await shot(page, 'quiz');
  await page.locator('#qNext').click();
  await wait(500);
  await page.locator('.opt', { hasText: 'Form exists inside matter' }).click();
  await wait(500);
  await page.locator('#qNext').click();
  await wait(500);
  await page.locator('.opt', { hasText: 'Questioning someone' }).click();
  await wait(500);
  await page.locator('#qNext').click();
  await page.locator('#planCard').getByText('Active recall').waitFor({ timeout: 15000 });
  await wait(3500);
  await page.evaluate(() => { const r = document.querySelector('#resultBanner').getBoundingClientRect(); window.scrollBy(0, r.top - 28); });
  await wait(600);
  await shot(page, 'plan');
  await page.context().close();
}

if (!only || only === 'weekly') {
  const page = await newPage({ settings: { skin: 'notebook', mascotKind: 'gator', mascot: 'on' }, withDoc: true });
  await page.goto(`${BASE}/weekly`);
  await page.locator('.week-hero h2', { hasText: 'consistent' }).waitFor();
  await wait(1500);
  await shot(page, 'weekly');
  await page.context().close();
}

if (!only || only === 'stats') {
  const page = await newPage({ settings: { skin: 'notebook', mascotKind: 'gator', mascot: 'on' }, withDoc: true });
  await page.goto(`${BASE}/stats`);
  await page.locator('.splash').waitFor({ state: 'hidden' }).catch(() => {});
  await page.getByRole('heading', { name: 'Your stats' }).waitFor();
  await page.getByRole('button', { name: 'Last 30 days' }).click().catch(() => {});
  await wait(1500);
  await shot(page, 'stats');
  await page.context().close();
}

if (!only || only === 'assistant') {
  const page = await newPage({ settings: { skin: 'midnight', mascotKind: 'robot', mascot: 'on' }, tasks: TASKS.slice(0, 1) });
  await page.goto(BASE);
  await page.locator('.splash').waitFor({ state: 'hidden' }).catch(() => {});
  await page.locator('#stage').waitFor();
  await page.fill('#ctxTopic', 'Ancient Greek philosophy');
  await page.locator('#ctxTopic').blur();
  await page.keyboard.press('a');
  const box = page.locator('.assistant textarea');
  await box.fill('Plan my evening: finish the philosophy slides, review the Krebs cycle, and start Calc problem set 4.');
  await box.press('Enter');
  await page.getByText('Your long break lands').waitFor();
  await wait(900);
  await shot(page, 'assistant');
  await page.context().close();
}

if (!only || only === 'focus') {
  const page = await newPage({ settings: { skin: 'midnight', mascotKind: 'gator', mascot: 'on', timerStyle: 'ring', clockFont: 'mono' }, withHistory: false });
  await page.goto(BASE);
  await page.locator('.splash').waitFor({ state: 'hidden' }).catch(() => {});
  await page.locator('#stage').waitFor();
  await page.keyboard.press('f');
  await page.keyboard.press('Space');
  await skip(page, 9.22);
  await wait(6000);
  await shot(page, 'focus');
  await page.context().close();
}

if (!only || only === 'phones') {
  const looks = [
    { skin: 'gator', mascotKind: 'gator', timerStyle: 'classic' },
    { skin: 'jungle', mascotKind: 'gorilla', timerStyle: 'ring' },
    { skin: 'robotlab', mascotKind: 'robot', timerStyle: 'minimal' },
    { skin: 'sakura', mascotKind: 'tomato', timerStyle: 'ring', clockFont: 'serif' },
  ];
  for (const [i, look] of looks.entries()) {
    const page = await newPage({ w: 390, h: 844, dpr: 2, mobile: true, settings: { ...look, mascot: 'on', musicWidget: false }, withHistory: false });
    await page.goto(BASE);
  await page.locator('.splash').waitFor({ state: 'hidden' }).catch(() => {});
    await page.locator('#stage').waitFor();
    await page.fill('#ctxTopic', ['Ancient Greek philosophy', 'Cellular respiration', 'Calculus II', 'Organic chemistry'][i]);
    await page.locator('#ctxTopic').blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(1400);
    await page.screenshot({ path: `${SCRATCH}/phone${i}.png` });
    await page.context().close();
  }
}

/* ---------- the phone collage, the link preview and the home-screen icon ---------- */
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(SCRATCH, f)).toString('base64');
const icon = fs.readFileSync(path.join(ROOT, 'app', 'icon.svg'), 'utf8');
const have = (f) => fs.existsSync(path.join(SCRATCH, f));
// 1. Four phones side by side
if (have('phone0.png')) {
  const page = await browser.newPage({ viewport: { width: 1640, height: 900 }, deviceScaleFactor: 1.25 });
  const phones = [0, 1, 2, 3].map((i) => `<div class="ph"><img src="${b64(`phone${i}.png`)}"></div>`).join('');
  await page.setContent(`<html><body style="margin:0;background:linear-gradient(135deg,#eef2fb,#fbeee8);display:flex;gap:28px;justify-content:center;align-items:center;height:900px">
    <style>.ph{width:360px;height:779px;border-radius:44px;padding:10px;background:#11151f;box-shadow:0 30px 60px -30px rgba(20,30,60,.55)}.ph img{width:100%;height:100%;border-radius:34px;object-fit:cover;object-position:top;display:block}</style>${phones}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'themes.jpg'), type: 'jpeg', quality: 88 });
  await page.close();
}
// 2. Link preview (Open Graph) 1200x630
if (have('hero.png')) {
  const heroB64 = b64('hero.png');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head></head><body style="margin:0;width:1200px;height:630px;overflow:hidden;font-family:system-ui;background:linear-gradient(135deg,#0B1F4D 0%,#12306E 55%,#FA4616 160%);color:#fff;position:relative">
    <div style="position:absolute;left:64px;top:70px;width:470px">
      <div style="display:flex;align-items:center;gap:16px">${icon.replace('<svg ', '<svg width="72" height="72" ')}<div style="font:800 54px/1 'Bricolage Grotesque',system-ui;letter-spacing:-1.5px">Pomo<span style="color:#FF8A5C">Gator</span></div></div>
      <div style="font:700 36px/1.2 system-ui;margin-top:46px;letter-spacing:-.5px">Study, quiz yourself,<br>earn your break.</div>
      <div style="font:400 21px/1.5 system-ui;margin-top:22px;color:#C9D6F5">A Pomodoro timer that writes a quiz on what you just studied. Your score sets your break.</div>
      <div style="display:flex;gap:10px;margin-top:34px;flex-wrap:wrap">${['AI quizzes', 'Slides & PDFs', 'Stats', 'Free'].map((t) => `<span style="font:600 16px system-ui;padding:8px 14px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)">${t}</span>`).join('')}</div>
    </div>
    <img src="${heroB64}" style="position:absolute;left:590px;top:70px;width:820px;border-radius:18px;box-shadow:0 30px 70px -20px rgba(0,0,0,.6)">
  </body></html>`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ROOT, 'app', 'opengraph-image.png') });
  await page.close();
}
// 3. Home-screen icon 180x180
{
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:180px;height:180px;background:#FFFFFF;display:grid;place-items:center">${icon.replace('<svg ', '<svg width="160" height="160" ')}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, 'app', 'apple-icon.png') });
  await page.close();
}
await browser.close();
fs.rmSync(SCRATCH, { recursive: true, force: true });
