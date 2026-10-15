import { afterEach, describe, expect, it, vi } from 'vitest';
import { askJson, errorFrom, parseJson, replyText } from '@/lib/ai/gemini';
import { assistantSystem, digestPrompt, materialText, quizPrompt } from '@/lib/ai/prompts';
import { cleanAssistant, cleanDigest, taskLine } from '@/lib/quiz';
import { DEFAULT_CONTEXT } from '@/lib/defaults';
import type { Material } from '@/lib/types';

const deck: Material = {
  name: 'lecture.pptx', unit: 'slide', pageCount: 3,
  pages: [
    { n: 4, title: 'Plato: The Theory of Forms', text: 'Forms are perfect abstract realities.' },
    { n: 5, title: 'Plato vs Aristotle', text: 'Aristotle placed forms inside things.' },
  ],
};

describe('prompts', () => {
  it('numbers document pages and stops at the size cap', () => {
    expect(materialText(deck)).toContain('[Slide 4] Plato: The Theory of Forms\nForms are perfect abstract realities.');
    const cut = materialText(deck, 90);
    expect(cut).toContain('[Slide 4]');
    expect(cut).not.toContain('[Slide 5]');
    expect(cut).toContain('left out for length');
  });

  it('builds the quiz from the covered slides and asks for page citations', () => {
    const p = quizPrompt({ ctx: { ...DEFAULT_CONTEXT, topic: 'Plato' }, n: 2, difficulty: 'standard', weak: [], asked: [], material: deck, heard: 'today we discuss the cave' });
    expect(p).toContain('<<<MATERIAL');
    expect(p).toContain('[Slide 5] Plato vs Aristotle');
    expect(p).toContain('(See slide N.)');
    expect(p).toContain('<<<LECTURE\ntoday we discuss the cave');
    expect(p).toContain('Write exactly 2 multiple-choice questions.');
  });

  it('falls back to standard material without notes or a document', () => {
    const p = quizPrompt({ ctx: { ...DEFAULT_CONTEXT, topic: 'Krebs cycle' }, n: 1, difficulty: 'gentle', weak: ['NADH yield'], asked: [] });
    expect(p).toContain('No notes were given.');
    expect(p).toContain('Re-test at least one of them');
  });

  it('gives the assistant the timer, to-do list and document', () => {
    const s = assistantSystem({
      messages: [], ctx: { ...DEFAULT_CONTEXT, subject: 'Philosophy' }, material: deck, now: 'Tue, Oct 14, 3:05 PM',
      timer: { studyMin: 25, shortBreak: 5, longBreak: 15, longEvery: 4, state: 'The timer isn\'t running' },
      tasks: [{ text: 'Read ch. 4', done: true }],
    });
    expect(s).toContain('study sessions are 25 min, short breaks 5 min, a 15-min long break after every 4 sessions');
    expect(s).toContain('- [x] Read ch. 4');
    expect(s).toContain('The document open now, "lecture.pptx" (3 slides');
    expect(s).toContain('Current time: Tue, Oct 14, 3:05 PM');
  });
});

describe('reading Gemini replies', () => {
  it('parses JSON, even inside a code fence or with stray text', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJson('Sure! {"a":3} Hope that helps')).toEqual({ a: 3 });
    expect(() => parseJson('no json here')).toThrow();
  });

  it('skips thinking parts and reports blocked replies', () => {
    expect(replyText({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":1}' }] } }] })).toBe('{"ok":1}');
    expect(() => replyText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(expect.objectContaining({ code: 'refused' }));
    expect(() => replyText({ candidates: [{ finishReason: 'SAFETY' }] })).toThrow(expect.objectContaining({ code: 'refused' }));
    expect(() => replyText({ candidates: [] })).toThrow(expect.objectContaining({ code: 'empty_completion' }));
  });

  it('maps Google errors to the app\'s error codes', () => {
    expect(errorFrom(429, {}).code).toBe('rate_limited');
    expect(errorFrom(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }).code).toBe('bad_key');
    expect(errorFrom(403, {}).code).toBe('bad_key');
    expect(errorFrom(404, {}).code).toBe('model_missing');
    expect(errorFrom(500, {}).code).toBe('upstream_error');
  });
});

describe('askJson', () => {
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('needs a key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(askJson({ turns: [{ role: 'user', text: 'hi' }] })).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('retries once when the reply isn\'t JSON, and sends the key only in a header', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'secret');
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('oops, not json')).mockResolvedValueOnce(ok('{"reply":"hi"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askJson({ system: 'be nice', turns: [{ role: 'user', text: 'hello' }] })).resolves.toEqual({ reply: 'hi' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1beta/models/gemini-flash-latest:generateContent');
    expect(url).not.toContain('secret');
    expect(init.headers['x-goog-api-key']).toBe('secret');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('be nice');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('switches to the backup model when the main one is out of free quota', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'secret');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }), { status: 429 }))
      .mockResolvedValueOnce(ok('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askJson({ turns: [{ role: 'user', text: 'x' }] })).resolves.toEqual({ a: 1 });
    expect(fetchMock.mock.calls[1][0]).toContain('gemini-flash-lite-latest');
  });

  it('stops at a bad key instead of trying the backup', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'wrong');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askJson({ turns: [{ role: 'user', text: 'x' }] })).rejects.toMatchObject({ code: 'bad_key' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('assistant replies', () => {
  it('keeps the message and cleans proposed tasks', () => {
    const r = cleanAssistant({ reply: 'Here you go', tasks: [{ text: '  Read  chapter 4 ', sessions: 2.4 }, { text: '', sessions: 1 }, { text: 'Essay outline', sessions: 99 }, 'Flashcards'] });
    expect(r.reply).toBe('Here you go');
    expect(r.tasks).toEqual([{ text: 'Read chapter 4', sessions: 2 }, { text: 'Essay outline', sessions: 12 }, { text: 'Flashcards', sessions: 1 }]);
    expect(taskLine(r.tasks[0])).toBe('Read chapter 4 · 2 sessions');
    expect(taskLine(r.tasks[2])).toBe('Flashcards · 1 session');
  });

  it('rejects an empty reply', () => {
    expect(() => cleanAssistant({ reply: '', tasks: [] })).toThrow();
    expect(() => cleanAssistant('nope')).toThrow();
  });
});

describe('document digests', () => {
  it('asks for study notes on the whole document', () => {
    const p = digestPrompt(deck);
    expect(p).toContain('DOCUMENT: "lecture.pptx" (3 slides)');
    expect(p).toContain('[Slide 5] Plato vs Aristotle');
    expect(p).toContain('"from" and "to" are slide numbers');
  });
  it('cleans the notes: keeps sections inside the document and caps the lists', () => {
    const d = cleanDigest({
      topic: 'Plato and Aristotle', summary: 'Two views of forms.', concepts: ['Forms', '', 'Virtue', ...Array(12).fill('x')],
      sections: [{ from: 0, to: 99, title: 'All', summary: 'Everything' }, { from: 2, to: 1, title: 'Back to front' }, 'junk'],
    }, 8);
    expect(d.topic).toBe('Plato and Aristotle');
    expect(d.concepts).toHaveLength(10);
    expect(d.concepts.slice(0, 2)).toEqual(['Forms', 'Virtue']);
    expect(d.sections).toEqual([{ from: 1, to: 8, title: 'All', summary: 'Everything' }, { from: 2, to: 2, title: 'Back to front', summary: '' }]);
    expect(() => cleanDigest({ topic: 'x', summary: '' }, 3)).toThrow();
  });
  it('tells the assistant about every document it has read', () => {
    const s = assistantSystem({
      messages: [], ctx: { ...DEFAULT_CONTEXT }, timer: { studyMin: 25, shortBreak: 5, longBreak: 15, longEvery: 4, state: '' }, tasks: [],
      library: [{ name: 'bio.pdf', pageCount: 12, unit: 'page', topic: 'Cell respiration', summary: 'How cells make ATP.', concepts: ['Krebs cycle', 'ATP'] }],
    });
    expect(s).toContain('- "bio.pdf" (12 pages): Cell respiration. How cells make ATP. Key concepts: Krebs cycle; ATP.');
    expect(s).toContain('No document is open right now.');
  });
});
