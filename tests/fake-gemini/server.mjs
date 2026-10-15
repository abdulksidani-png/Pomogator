// Stand-ins for Google's Gemini API and Unsplash, for the browser tests in playwright.ai.config.ts.
// Gemini: answers generateContent with canned JSON for each kind of prompt, and remembers what it was sent
// (GET /__requests returns every request body, so tests can check what reached the AI).
// Unsplash: /search/photos, /photos/random, /photos/:id/download, and tiny colored images under /img/.
import http from 'node:http';

const PORT = Number(process.env.FAKE_GEMINI_PORT || 4010);
const requests = [];

const reply = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const answer = (res, obj) => reply(res, 200, { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

function quiz(prompt) {
  const n = Number(prompt.match(/Write exactly (\d+)/)?.[1] || 3);
  const screenLine = prompt.match(/<<<SCREEN\n([^\n]+)/)?.[1];
  if (screenLine) {
    return { questions: Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`, concept: 'From your screen', question: `Q${i + 1}: On your screen: "${screenLine.slice(0, 60)}". What does it do?`,
      options: ['The right answer', 'A near miss', 'A common mistake', 'Something else'], correctIndex: 0, explanation: 'Because.', memoryAid: 'Picture it.',
      optionFeedback: ['Yes.', 'Close, but no.', 'A classic mix-up.', 'Unrelated.'],
    })) };
  }
  const slide = prompt.match(/\[Slide (\d+)\] ([^\n]+)/);
  return {
    questions: Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`,
      concept: slide ? `From slide ${slide[1]}` : `Idea ${i + 1}`,
      question: slide ? `Q${i + 1}: What does slide ${slide[1]} ("${slide[2]}") say?` : `Q${i + 1}: Which is right?`,
      options: ['The right answer', 'A near miss', 'A common mistake', 'Something else'],
      correctIndex: 0,
      explanation: slide ? `Because the slide says so. (See slide ${slide[1]}.)` : 'Because.',
      memoryAid: 'Picture it.',
      optionFeedback: ['Yes.', 'Close, but no.', 'A classic mix-up.', 'Unrelated.'],
    })),
  };
}

function assistant(system, turns) {
  const last = turns.at(-1)?.parts?.map((p) => p.text).join('') ?? '';
  if (/LIMIT_TEST/.test(last)) return null;
  if (/to-do|todo|plan/i.test(last)) {
    return {
      reply: 'Here\'s your plan:\n- **Session 1** (25 min): Read chapter 4\n- 5-min break\n- **Session 2** (25 min): Essay outline',
      tasks: [{ text: 'Read chapter 4', sessions: 1 }, { text: 'Outline the history essay', sessions: 2 }],
    };
  }
  const doc = system.match(/The document open now, "([^"]+)"/)?.[1];
  return { reply: `You asked: "${last}". ${doc ? `I can see ${doc}.` : 'No document is open.'} Turns so far: ${turns.length}.`, tasks: [] };
}

const COLORS = ['#7A9E7E', '#C98B5E', '#5E7FC9', '#B65E8F', '#5EB3B3', '#C9B85E'];
function unsplashPhoto(i, q) {
  const id = `${q.replace(/\W+/g, '-')}-${i}`;
  return {
    id, color: COLORS[i % COLORS.length], alt_description: `${q} photo ${i}`,
    urls: { raw: `http://localhost:${PORT}/img/${id}.svg?ixid=test`, small: `http://localhost:${PORT}/img/${id}.svg?w=400` },
    user: { name: `Photographer ${i}`, links: { html: `https://unsplash.com/@photographer${i}` } },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `http://localhost:${PORT}/photos/${id}/download?ixid=test` },
  };
}
const unsplashCalls = [];

function unsplash(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/img/')) {
    const i = Number(url.pathname.match(/-(\d+)\.svg$/)?.[1] || 0);
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="${COLORS[i % COLORS.length]}"/><circle cx="220" cy="60" r="30" fill="#fff8"/></svg>`);
  }
  if (req.headers.authorization !== 'Client-ID test-unsplash') return reply(res, 401, { errors: ['OAuth error: The access token is invalid'] });
  unsplashCalls.push(url.pathname + url.search);
  const q = url.searchParams.get('query') || 'photo';
  if (url.pathname === '/search/photos') {
    const page = Number(url.searchParams.get('page') || 1);
    return reply(res, 200, { total: 24, total_pages: 2, results: Array.from({ length: 12 }, (_, i) => unsplashPhoto((page - 1) * 12 + i, q)) });
  }
  if (url.pathname === '/photos/random') return reply(res, 200, unsplashPhoto(99, q));
  if (/^\/photos\/[\w-]+\/download$/.test(url.pathname)) return reply(res, 200, { url: 'https://images.unsplash.com/x' });
  return reply(res, 404, { errors: ['Not found'] });
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__requests') return reply(res, 200, requests);
  if (req.method === 'GET' && req.url === '/__unsplash') return reply(res, 200, unsplashCalls);
  if (req.method === 'GET' && /^\/(img|search|photos)\//.test(req.url)) return unsplash(req, res);
  if (req.method === 'POST' && req.url === '/__reset') { requests.length = 0; unsplashCalls.length = 0; return reply(res, 200, {}); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const m = req.url.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
    if (!m || req.method !== 'POST') return reply(res, 404, { error: { code: 404, message: 'Not found' } });
    if (req.headers['x-goog-api-key'] !== 'test-key') return reply(res, 400, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT' } });
    const body = JSON.parse(raw || '{}');
    requests.push({ model: m[1], body });
    const system = body.systemInstruction?.parts?.map((p) => p.text).join('') ?? '';
    const prompt = body.contents?.at(-1)?.parts?.map((p) => p.text).join('') ?? '';
    if (system.includes('You are PomoGator')) {
      const a = assistant(system, body.contents);
      return a ? answer(res, a) : reply(res, 429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
    }
    if (prompt.includes('write compact study notes')) {
      const n = Number(prompt.match(/\((\d+) slides\)/)?.[1] || 1);
      return answer(res, { topic: 'Ancient Greek philosophy', summary: 'Plato and Aristotle on forms and virtue.', concepts: ['Theory of Forms', 'Allegory of the cave', 'Eudaimonia'], sections: [{ from: 1, to: n, title: 'The whole deck', summary: 'From Plato to Aristotle.' }] });
    }
    if (prompt.includes('retrieval-practice quizzes')) return answer(res, quiz(prompt));
    if (prompt.includes('from their to-do list and what they have been working on')) {
      const task = prompt.match(/TO-DO LIST \(still open\):\n- ([^\n]+)/)?.[1] || 'your list';
      const onScreen = /<<<SCREEN/.test(prompt);
      return answer(res, { summary: `Next up: ${task}.${onScreen ? ' Building on what was on your screen.' : ''}`, strong: [], review: [task], actions: [{ minutes: 15, technique: 'Practice problems', step: `Work on ${task}.` }, { minutes: 10, technique: 'Active recall', step: 'Recall what you did.' }], suggestedMinutes: 25, nextGoal: `Finish ${task}` });
    }
    if (prompt.includes('Write an actionable plan')) {
      return answer(res, { summary: 'Nice work.', strong: ['Forms'], review: ['Virtue'], actions: [{ minutes: 15, technique: 'Active recall', step: 'Recall the slides.' }, { minutes: 10, technique: 'Flashcards', step: 'Make 5 cards.' }], suggestedMinutes: 25, nextGoal: 'Finish the Aristotle slides' });
    }
    if (prompt.includes('weekly report for')) {
      const mins = Number(prompt.match(/THIS WEEK: study (\d+) min/)?.[1] || 0);
      return answer(res, { headline: 'A steady week of study.', summary: `You studied ${mins} minutes this week. Keep the momentum going.`, focus: ['Review the Forms first.', 'Finish the Aristotle slides.', 'Study in the morning.'] });
    }
    if (prompt.includes('end-of-day summary')) return answer(res, { headline: 'A good day.', wins: ['Studied'], gaps: ['Virtue'], tomorrow: ['Review'] });
    return reply(res, 400, { error: { code: 400, message: 'Unknown prompt' } });
  });
}).listen(PORT, () => console.log(`fake Gemini on ${PORT}`));
