import { describe, expect, it } from 'vitest';
import { addDays, computeStats, hourIn, quizCounts, streakOf, timeOfDay, weekStartOf, weekdayOf } from '@/lib/stats';
import { localDate } from '@/lib/dates';
import type { DocMeta, QuizItemResult, SessionRecord } from '@/lib/types';

const NY = 'America/New_York';
let n = 0;
/** A session that started at `iso` (a UTC instant), with its local date worked out in `tz`. */
function sess(iso: string, o: Partial<SessionRecord> = {}, tz = NY, rollover = 0): SessionRecord {
  const startedAt = Date.parse(iso);
  return {
    id: `s${++n}`, date: localDate(startedAt, tz, rollover), startedAt, endedAt: startedAt + 25 * 60_000,
    plannedMin: 25, studiedMin: 25, subject: 'Biology', topic: 'Krebs cycle', level: 'intro', goal: '', ...o,
  };
}
const items = (...right: boolean[]): QuizItemResult[] => right.map((c, i) => ({ concept: `Idea ${i + 1}`, question: `Q${i}`, chosen: 'x', answer: 'y', correct: c }));
const quiz = (...right: boolean[]) => ({ status: 'done' as const, score: right.filter(Boolean).length, total: right.length, items: items(...right) });

describe('dates', () => {
  it('finds weekdays and week starts without depending on the device time zone', () => {
    expect(weekdayOf('2026-10-15')).toBe(4); // a Thursday
    expect(weekStartOf('2026-10-15', 1)).toBe('2026-10-12'); // Monday
    expect(weekStartOf('2026-10-15', 0)).toBe('2026-10-11'); // Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('sorts hours into times of day', () => {
    expect([4, 5, 11, 12, 16, 17, 20, 21, 23].map(timeOfDay)).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
    expect(hourIn(Date.parse('2026-10-15T13:30:00Z'), NY)).toBe(9);
  });
});

describe('quiz counts', () => {
  it('excludes skipped and unavailable quizzes', () => {
    expect(quizCounts(sess('2026-10-14T14:00:00Z', { quiz: quiz(true, false, true) }))).toEqual({ correct: 2, answered: 3 });
    expect(quizCounts(sess('2026-10-14T14:00:00Z', { quiz: { status: 'skipped' } }))).toEqual({ correct: 0, answered: 0 });
    expect(quizCounts(sess('2026-10-14T14:00:00Z', { quiz: { status: 'partial', score: 1, total: 2 } }))).toEqual({ correct: 1, answered: 2 });
  });
});

describe('computeStats', () => {
  const today = '2026-10-15';

  it('handles an empty week', () => {
    const s = computeStats({ history: [], docs: [], today, from: '2026-10-12', dayCount: 7 });
    expect(s).toMatchObject({ studyMin: 0, sessions: 0, avgSessionMin: null, accuracy: null, goalsPct: null, breakMin: 0, bestDayMinutes: null, bestTime: null });
    expect(s.streak).toMatchObject({ current: 0, longest: 0 });
    expect(s.days).toHaveLength(7);
    expect(s.days.every((d) => d.minutes === 0)).toBe(true);
  });

  it('counts only sessions that reached half their planned time, and skipped quizzes don\'t lower accuracy', () => {
    const history = [
      sess('2026-10-14T14:00:00Z', { studiedMin: 25, quiz: quiz(true, true, false), breakMin: 10 }),
      sess('2026-10-14T16:00:00Z', { studiedMin: 30, plannedMin: 30, quiz: { status: 'skipped' }, breakMin: 5 }),
      sess('2026-10-14T18:00:00Z', { studiedMin: 8, quiz: { status: 'too-short' }, breakMin: 5 }), // under half: not counted
    ];
    const s = computeStats({ history, docs: [], today, timezone: NY });
    expect(s.sessions).toBe(2);
    expect(s.studyMin).toBe(55);
    expect(s.avgSessionMin).toBe(28);
    expect(s.accuracy).toBe(67);
    expect(s.answered).toBe(3);
    expect(s.breakMin).toBe(20);
  });

  it('puts a session that crosses midnight on the day it started', () => {
    const s = sess('2026-10-15T03:50:00Z', { studiedMin: 40, plannedMin: 45 }); // 11:50 PM Oct 14 in New York, ends after midnight
    expect(s.date).toBe('2026-10-14');
    const stats = computeStats({ history: [s], docs: [], today, timezone: NY });
    expect(stats.days.find((d) => d.date === '2026-10-14')!.minutes).toBe(40);
    expect(stats.days.find((d) => d.date === '2026-10-15')!.minutes).toBe(0);
  });

  it('counts late-night study toward the previous day with a 4 AM rollover', () => {
    const late = sess('2026-10-15T06:30:00Z', {}, NY, 4); // 2:30 AM Oct 15 in New York
    expect(late.date).toBe('2026-10-14');
    const early = sess('2026-10-15T06:30:00Z', {}, NY, 0);
    expect(early.date).toBe('2026-10-15');
  });

  it('keeps old sessions on their own day after a time zone change', () => {
    const inTokyo = sess('2026-10-13T14:00:00Z', {}, 'Asia/Tokyo'); // 11 PM Oct 13 in Tokyo
    const inNY = sess('2026-10-14T14:00:00Z', {}, NY);
    const s = computeStats({ history: [inTokyo, inNY], docs: [], today, timezone: NY });
    expect(inTokyo.date).toBe('2026-10-13');
    expect(s.days.filter((d) => d.minutes > 0).map((d) => d.date)).toEqual(['2026-10-13', '2026-10-14']);
    expect(s.streak.current).toBe(2);
  });

  it('finds goals met, best days and best time of day', () => {
    const history = [
      sess('2026-10-12T13:00:00Z', { studiedMin: 45, plannedMin: 45, goalMet: true, quiz: quiz(true, true, true) }), // Monday 9 AM
      sess('2026-10-13T23:00:00Z', { studiedMin: 25, goalMet: false, quiz: quiz(false, false, true) }), // Tuesday 7 PM
      sess('2026-10-14T23:30:00Z', { studiedMin: 25, quiz: quiz(true, false, false) }), // Wednesday 7:30 PM
    ];
    const s = computeStats({ history, docs: [], today, timezone: NY });
    expect(s.goalsPct).toBe(50);
    expect(s.goalsSet).toBe(2);
    expect(s.bestDayMinutes).toEqual({ day: 1, avgMin: 45 });
    expect(s.bestDayAccuracy).toEqual({ day: 1, accuracy: 100 });
    expect(s.bestTime).toEqual({ slot: 'morning', accuracy: 100 });
  });

  it('limits everything but streaks to the chosen range', () => {
    const history = [sess('2026-10-01T14:00:00Z', { quiz: quiz(false) }), sess('2026-10-14T14:00:00Z', { quiz: quiz(true) })];
    const s = computeStats({ history, docs: [], today, timezone: NY, from: '2026-10-12' });
    expect(s.sessions).toBe(1);
    expect(s.accuracy).toBe(100);
    expect(s.streak.longest).toBe(1);
  });

  it('maps document progress, studied pages and quizzed pages', () => {
    const doc: DocMeta = { id: 'd1', name: 'lecture.pptx', kind: 'pptx', size: 1, pageCount: 8, titles: [], createdAt: 0, furthest: 5 };
    const history = [
      sess('2026-10-13T14:00:00Z', { docId: 'd1', startPage: 1, endPage: 3, quiz: quiz(true) }),
      sess('2026-10-14T14:00:00Z', { docId: 'd1', startPage: 4, endPage: 5, quiz: { status: 'skipped' } }),
    ];
    const s = computeStats({ history, docs: [doc], today, timezone: NY });
    const d = s.docs[0];
    expect(d).toMatchObject({ reached: 5, pct: 63 });
    expect(d.studied).toEqual([true, true, true, true, true, false, false, false]);
    expect(d.quizzed).toEqual([true, true, true, false, false, false, false, false]);
    expect(s.byDoc[0]).toMatchObject({ name: 'lecture.pptx', accuracy: 100 });
  });

  it('finds the most-missed concepts and the ones mastered', () => {
    const history = [
      sess('2026-10-12T14:00:00Z', { quiz: quiz(false, false) }),
      sess('2026-10-13T14:00:00Z', { quiz: quiz(true, false) }),
      sess('2026-10-14T14:00:00Z', { quiz: quiz(true, false) }),
    ];
    const s = computeStats({ history, docs: [], today, timezone: NY });
    expect(s.mostMissed[0]).toMatchObject({ concept: 'Idea 2', missed: 3, seen: 3, topic: 'biology · krebs cycle' });
    expect(s.mastered.map((c) => c.concept)).toEqual(['Idea 1']);
  });
});

describe('streaks', () => {
  const today = '2026-10-15';
  it('runs through yesterday until today has a session', () => {
    expect(streakOf(['2026-10-13', '2026-10-14'], today).current).toBe(2);
    expect(streakOf(['2026-10-13', '2026-10-14', today], today).current).toBe(3);
    expect(streakOf(['2026-10-12', '2026-10-13'], today).current).toBe(0); // missed yesterday
  });
  it('remembers the longest streak', () => {
    const s = streakOf(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10', today], today);
    expect(s).toMatchObject({ current: 1, longest: 4 });
  });
  it('uses a freeze earned by a 7-day streak on a missed day', () => {
    const week = Array.from({ length: 7 }, (_, i) => addDays('2026-10-05', i)); // Oct 5–11
    const dates = [...week, '2026-10-13', '2026-10-14']; // missed Oct 12
    expect(streakOf(dates, today).current).toBe(2);
    const frozen = streakOf(dates, today, { freezes: true });
    expect(frozen.current).toBe(9);
    expect(frozen.frozenDays).toEqual(['2026-10-12']);
    expect(frozen.freezesLeft).toBe(0);
  });
  it('holds at most two freezes, and breaks when they run out', () => {
    const run = Array.from({ length: 21 }, (_, i) => addDays('2026-09-01', i)); // 21 days: 3 earned, capped at 2
    const s = streakOf([...run, '2026-09-25'], '2026-09-25', { freezes: true }); // missed Sep 22, 23, 24
    expect(s.current).toBe(1);
    const t = streakOf([...run, '2026-09-24'], '2026-09-24', { freezes: true }); // missed Sep 22, 23: both freezes
    expect(t.current).toBe(22);
    expect(t.freezesLeft).toBe(0);
  });
});
