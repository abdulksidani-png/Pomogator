import { describe, expect, it } from 'vitest';
import { normalizeData, quizPick, quizSources, sourcesKey } from '@/lib/store';
import { quizPrompt, workPlanPrompt } from '@/lib/ai/prompts';
import { DEFAULT_CONTEXT } from '@/lib/defaults';
import type { DocMeta, SessionRecord } from '@/lib/types';

const doc = { id: 'd1', name: 'philosophy.pptx', kind: 'pptx', size: 1, pageCount: 10, titles: [], createdAt: 0, furthest: 0 } as DocMeta;
const session = (o: Partial<SessionRecord> = {}): SessionRecord => ({ id: 's1', date: '2026-10-15', startedAt: 0, plannedMin: 25, subject: '', topic: 'Philosophy', level: 'intro', goal: '', docId: 'd1', startPage: 1, ...o });
const data = (o: Partial<SessionRecord> = {}) => {
  const d = normalizeData({ docs: [doc], context: { ...DEFAULT_CONTEXT, topic: 'Philosophy', docId: 'd1', goalPage: 5 } });
  d.timer.session = session(o);
  return d;
};
const PY = 'def total(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\nprint(total([1, 2, 3]))';

describe('what the quiz covers', () => {
  it('uses the document when nothing was shared', () => {
    const d = data();
    expect(quizSources(d)).toMatchObject({ screen: false, doc: true });
    expect(quizPick(d)).toEqual({ screen: false, doc: true, heard: false });
  });
  it('leaves out a document that never showed up on a screen that showed something else (the Python case)', () => {
    const d = data({ screen: PY });
    expect(quizPick(d)).toEqual({ screen: true, doc: false, heard: false });
  });
  it('keeps the document when its slides were on the shared screen', () => {
    const d = data({ screen: PY, progressSource: 'screen', endPage: 4 });
    expect(quizPick(d)).toEqual({ screen: true, doc: true, heard: false });
  });
  it('follows the student\'s choice, and a new choice means a new quiz', () => {
    const d = data({ screen: PY });
    const before = sourcesKey(d);
    d.timer.session!.quizPick = { screen: false, doc: true, heard: false };
    expect(quizPick(d)).toEqual({ screen: false, doc: true, heard: false });
    expect(sourcesKey(d)).not.toBe(before);
  });
});

describe('prompts with the shared screen', () => {
  it('builds the quiz mainly from the screen, trusting it over an old topic', () => {
    const p = quizPrompt({ ctx: { ...DEFAULT_CONTEXT, topic: 'Philosophy' }, n: 3, difficulty: 'standard', weak: [], asked: [], screen: PY, images: [{ mimeType: 'image/jpeg', data: 'AAAA' }] });
    expect(p).toContain('<<<SCREEN\ndef total(xs):');
    expect(p).toContain('1 snapshot of the screen is attached');
    expect(p).toContain('trust the screen');
    expect(p).toContain('If it is code');
  });
  it('plans the next session from the to-do list, uploads and screen', () => {
    const p = workPlanPrompt({
      ctx: { ...DEFAULT_CONTEXT, topic: 'Python' }, studyMin: 25, weak: [],
      tasks: [{ text: 'Python quiz on loops', done: false }, { text: 'Read chapter 2', done: true }],
      uploads: [{ name: 'loops.pdf', topic: 'Python loops', summary: 'For and while loops.', concepts: ['range', 'break'] }],
      screen: PY,
    });
    expect(p).toContain('TO-DO LIST (still open):\n- Python quiz on loops');
    expect(p).toContain('Already done today:\n- Read chapter 2');
    expect(p).toContain('"loops.pdf": Python loops. For and while loops. Key concepts: range; break.');
    expect(p).toContain('<<<SCREEN\ndef total(xs):');
  });
});
