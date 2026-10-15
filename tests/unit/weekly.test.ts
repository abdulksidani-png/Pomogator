import { describe, expect, it } from 'vitest';
import { focusSteps, plainSummary, reportSig, unseenLastWeek, weekReport, weeklyInput, weeksWithStudy } from '@/lib/weekly';
import { weeklyPrompt } from '@/lib/ai/prompts';
import { cleanWeekly } from '@/lib/quiz';
import type { DocMeta, QuizItemResult, SessionRecord } from '@/lib/types';

let n = 0;
/** A session on a local date at a local hour (UTC is fine here: the report uses the stored date). */
function sess(date: string, o: Partial<SessionRecord> = {}): SessionRecord {
  const startedAt = Date.parse(`${date}T15:00:00Z`);
  return { id: `w${++n}`, date, startedAt, endedAt: startedAt + 25 * 60_000, plannedMin: 25, studiedMin: 25, subject: '', topic: 'Philosophy', level: 'intro', goal: '', ...o };
}
const item = (concept: string, correct: boolean): QuizItemResult => ({ concept, question: `About ${concept}?`, chosen: 'a', answer: correct ? 'a' : 'b', correct });
const quiz = (...items: QuizItemResult[]) => ({ status: 'done' as const, score: items.filter((i) => i.correct).length, total: items.length, items });

// Weeks start on Monday: 2026-10-05 → 10-11 (last week) and 2026-10-12 → 10-18 (this week). Today is Thursday 10-15.
const TODAY = '2026-10-15';
const doc: DocMeta = { id: 'd1', name: 'lecture.pptx', kind: 'pptx', size: 1, pageCount: 10, titles: [], createdAt: 0, furthest: 0 } as DocMeta;
const history: SessionRecord[] = [
  // last week: 2 counted sessions on 2 days, 1 of 3 right, Forms missed
  sess('2026-10-06', { quiz: quiz(item('Forms', false), item('Cave', true), item('Virtue', false)) }),
  sess('2026-10-08', { studiedMin: 30, plannedMin: 30 }),
  // this week: 3 counted sessions on 2 days (+1 too short to count), 5 of 6 right, Forms mastered (missed, then right twice)
  sess('2026-10-12', { quiz: quiz(item('Forms', true), item('Cave', true), item('Virtue', false)), docId: 'd1', startPage: 1, endPage: 4, goalPage: 4, goalMet: true }),
  sess('2026-10-14', { quiz: quiz(item('Forms', true), item('Cave', true), item('Virtue', true)), docId: 'd1', startPage: 4, endPage: 6, goalPage: 8, goalMet: false }),
  sess('2026-10-14', { studiedMin: 45, plannedMin: 45 }),
  sess('2026-10-15', { studiedMin: 5, plannedMin: 25 }),
];

describe('weekReport', () => {
  const r = weekReport({ history, docs: [doc], week: TODAY, today: TODAY, weekStartDay: 1 });

  it('covers the right week and knows it is still going', () => {
    expect([r.start, r.end]).toEqual(['2026-10-12', '2026-10-18']);
    expect(r.inProgress).toBe(true);
    expect(r.daysLeft).toBe(3);
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(r.days.map((d) => d.future)).toEqual([false, false, false, false, true, true, true]);
  });

  it('counts this week and compares with last week', () => {
    expect(r.now).toEqual({ studyMin: 95, sessions: 3, accuracy: 83, goalsPct: 50, streak: 1, studyDays: 2 });
    expect(r.prev).toMatchObject({ studyMin: 55, sessions: 2, accuracy: 33, goalsPct: null, studyDays: 2 });
    expect(r.delta).toEqual({ studyMin: 40, sessions: 1, accuracy: 50, goalsPct: null, streak: r.now.streak - r.prev.streak });
    expect(r.days[2]).toMatchObject({ minutes: 70, sessions: 2, correct: 3, answered: 3, accuracy: 100 });
  });

  it('lists pages covered, concepts missed and concepts mastered this week', () => {
    expect(r.docs).toEqual([{ docId: 'd1', name: 'lecture.pptx', unit: 'slides', pageCount: 10, reached: 6, pct: 60, coveredThisWeek: 6 }]);
    expect(r.missed).toEqual([{ concept: 'Virtue', topic: 'Philosophy', missed: 1, seen: 2 }]);
    expect(r.mastered.map((m) => m.concept)).toEqual(['Forms']);
  });

  it('suggests three concrete focus steps', () => {
    expect(r.focus).toHaveLength(3);
    expect(r.focus[0]).toContain('Virtue');
    expect(r.focus[1]).toContain('Finish lecture.pptx: 4 slides to go');
  });

  it('handles an empty week kindly', () => {
    const e = weekReport({ history, docs: [doc], week: '2026-09-21', today: TODAY, weekStartDay: 1 });
    expect(e.empty).toBe(true);
    expect(e.inProgress).toBe(false);
    expect(e.now).toMatchObject({ studyMin: 0, sessions: 0, accuracy: null });
    expect(plainSummary(e).headline).toBe('A quiet week');
    expect(focusSteps(e)).toHaveLength(3);
    expect(plainSummary(weekReport({ history: [], docs: [], week: TODAY, today: TODAY, weekStartDay: 1 })).headline).toBe('A fresh week');
  });

  it('starts weeks on Sunday when asked', () => {
    const s = weekReport({ history, docs: [doc], week: TODAY, today: TODAY, weekStartDay: 0 });
    expect(s.start).toBe('2026-10-11');
    expect(s.now.sessions).toBe(3);
  });

  it('writes a plain summary from the numbers', () => {
    const p = plainSummary(r);
    expect(p.headline).toBe('1 h 35 min so far this week');
    expect(p.summary).toContain('You studied 1 h 35 min over 2 days, 40 min more than last week.');
    expect(p.summary).toContain('83% of quiz questions right, up 50 points');
    expect(p.summary).toContain('You mastered Forms.');
  });
});

describe('the weekly archive and review', () => {
  it('lists weeks with study, newest first, including this week', () => {
    expect(weeksWithStudy(history, TODAY, 1)).toEqual(['2026-10-12', '2026-10-05']);
    expect(weeksWithStudy([], TODAY, 1)).toEqual(['2026-10-12']);
  });
  it('offers last week\'s review once', () => {
    expect(unseenLastWeek(history, TODAY, 1, '')).toBe('2026-10-05');
    expect(unseenLastWeek(history, TODAY, 1, '2026-10-05')).toBeNull();
    expect(unseenLastWeek(history.slice(2), TODAY, 1, '')).toBeNull(); // nothing studied last week
  });
  it('fingerprints the numbers so a saved summary knows it is out of date', () => {
    const a = weekReport({ history, docs: [doc], week: TODAY, today: TODAY, weekStartDay: 1 });
    const b = weekReport({ history: [...history, sess('2026-10-15')], docs: [doc], week: TODAY, today: TODAY, weekStartDay: 1 });
    expect(reportSig(a)).not.toBe(reportSig(b));
  });
});

describe('the weekly AI summary', () => {
  const r = weekReport({ history, docs: [doc], week: TODAY, today: TODAY, weekStartDay: 1 });
  it('sends the AI the real numbers', () => {
    const p = weeklyPrompt(weeklyInput(r));
    expect(p).toContain('weekly report for 2026-10-12 to 2026-10-18 (the week is still going: 3 days left)');
    expect(p).toContain('THIS WEEK: study 95 min in 3 sessions on 2 days · quiz accuracy 83%');
    expect(p).toContain('LAST WEEK: study 55 min in 2 sessions');
    expect(p).toContain('Newly mastered: Forms');
    expect(p).toContain('never shaming');
  });
  it('validates the reply and falls back to the worked-out steps', () => {
    expect(cleanWeekly({ headline: 'Nice week', summary: 'You did well.', focus: ['a', 'b', 'c', 'd'] })).toEqual({ headline: 'Nice week', summary: 'You did well.', focus: ['a', 'b', 'c'] });
    expect(cleanWeekly({ headline: 'x', summary: 'y' }, ['one', 'two']).focus).toEqual(['one', 'two']);
    expect(() => cleanWeekly({ headline: 'x', summary: '' })).toThrow();
  });
});
