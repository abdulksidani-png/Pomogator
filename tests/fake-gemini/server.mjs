// A stand-in for Google's Gemini API, for the AI browser tests (playwright.ai.config.ts).
// Answers generateContent with canned JSON for each kind of prompt, and remembers what it was sent:
// GET /__requests returns every request body, so tests can check what reached the AI.
import http from 'node:http';

const PORT = Number(process.env.FAKE_GEMINI_PORT || 4010);
const requests = [];

const reply = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const answer = (res, obj) => reply(res, 200, { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

function quiz(prompt) {
  const n = Number(prompt.match(/Write exactly (\d+)/)?.[1] || 3);
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
  const doc = system.match(/The document "([^"]+)"/)?.[1];
  return { reply: `You asked: "${last}". ${doc ? `I can see ${doc}.` : 'No document is open.'} Turns so far: ${turns.length}.`, tasks: [] };
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__requests') return reply(res, 200, requests);
  if (req.method === 'POST' && req.url === '/__reset') { requests.length = 0; return reply(res, 200, {}); }
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
    if (system.includes('You are StudyBuddy')) {
      const a = assistant(system, body.contents);
      return a ? answer(res, a) : reply(res, 429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
    }
    if (prompt.includes('retrieval-practice quizzes')) return answer(res, quiz(prompt));
    if (prompt.includes('Write an actionable plan')) {
      return answer(res, { summary: 'Nice work.', strong: ['Forms'], review: ['Virtue'], actions: [{ minutes: 15, technique: 'Active recall', step: 'Recall the slides.' }, { minutes: 10, technique: 'Flashcards', step: 'Make 5 cards.' }], suggestedMinutes: 25, nextGoal: 'Finish the Aristotle slides' });
    }
    if (prompt.includes('end-of-day summary')) return answer(res, { headline: 'A good day.', wins: ['Studied'], gaps: ['Virtue'], tomorrow: ['Review'] });
    return reply(res, 400, { error: { code: 400, message: 'Unknown prompt' } });
  });
}).listen(PORT, () => console.log(`fake Gemini on ${PORT}`));
