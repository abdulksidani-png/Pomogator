import { describe, expect, it } from 'vitest';
import { celebrationFor, cleanBadges, cleanDates, headlineOf, lastDays, mergeBadges, mergeDates, weekCheckinStreak } from '@/lib/checkins';
import { addDays } from '@/lib/stats';
import { weekReport } from '@/lib/weekly';

const T = '2026-10-15'; // a Thursday
const run = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

describe('check-in celebrations', () => {
  it('the very first check-in starts day 1, kindly', () => {
    const c = celebrationFor([T], T, {});
    expect(c).toMatchObject({ streak: 1, first: true, broken: false, milestone: null });
    expect(headlineOf(c)).toBe('Day 1. You checked in!');
    expect(c.days.map((d) => d.mark)).toEqual(['missed', 'missed', 'missed', 'missed', 'missed', 'missed', 'done']);
    expect(c.days.map((d) => d.letter).join('')).toBe('FSSMTWT');
    expect(c.days[6].today).toBe(true);
  });

  it('days in a row grow the streak; 3 and 7 days earn badges once', () => {
    const c3 = celebrationFor(run(T, 3), T, {});
    expect(c3).toMatchObject({ streak: 3, milestone: 3, newBadges: [3] });
    expect(headlineOf(c3)).toBe('3-day streak!');
    expect(celebrationFor(run(T, 3), T, { 3: '2026-10-01' }).milestone).toBeNull(); // already earned
    // Catching up on several milestones at once: all are awarded, the biggest is shown.
    expect(celebrationFor(run(T, 15), T, {})).toMatchObject({ streak: 15, newBadges: [3, 7, 14], milestone: 14 });
  });

  it('a broken streak says welcome back with the best so far, no guilt', () => {
    const dates = [...run('2026-10-05', 23).filter((d) => d <= '2026-10-05'), ...run('2026-10-05', 23)];
    const c = celebrationFor([...cleanDates(dates), T], T, {});
    expect(c).toMatchObject({ streak: 1, broken: true, bestBefore: 23 });
    expect(headlineOf(c)).toBe('Welcome back!');
    expect(c.line).toBe('New streak starts today. Your best is 23 days.');
  });

  it('a streak freeze covers a missed day: shown as a snowflake, and the streak survives', () => {
    const dates = [...run('2026-10-13', 8), T]; // 8 days, missed the 14th, back on the 15th
    const off = celebrationFor(dates, T, {}, false);
    expect(off).toMatchObject({ streak: 1, broken: true });
    const on = celebrationFor(dates, T, {}, true);
    expect(on).toMatchObject({ streak: 9, broken: false, saved: true, freezesLeft: 0 });
    expect(on.days.at(-2)!.mark).toBe('frozen');
    expect(on.line).toContain('streak freeze');
  });

  it('a new personal best is called out', () => {
    const dates = [...run('2026-10-01', 4), ...run(T, 5)];
    expect(celebrationFor(dates, T, { 3: '2026-10-03' }).line).toBe('A new personal best! Your old record was 4 days.');
    // Only on the day the old record falls, not every day of a long run.
    expect(celebrationFor([...run('2026-10-01', 4), ...run(T, 6)], T, { 3: '2026-10-03' }).line).not.toContain('personal best');
    expect(celebrationFor(run(T, 12), T, { 3: '2026-10-03', 7: '2026-10-08' }).line).not.toContain('personal best');
  });
});

describe('check-in data', () => {
  it('cleans and merges dates and badges from storage or another device', () => {
    expect(cleanDates(['2026-10-02', 'bad', 3, '2026-10-01', '2026-10-02'])).toEqual(['2026-10-01', '2026-10-02']);
    expect(cleanDates('nope')).toEqual([]);
    expect(mergeDates(['2026-10-01'], ['2026-10-03', '2026-10-01'])).toEqual(['2026-10-01', '2026-10-03']);
    expect(cleanBadges({ 3: '2026-10-01', 4: '2026-10-02', 7: 'x' })).toEqual({ 3: '2026-10-01' });
    expect(mergeBadges({ 3: '2026-10-05' }, { 3: '2026-10-01', 7: '2026-10-09' })).toEqual({ 3: '2026-10-01', 7: '2026-10-09' });
  });

  it('the strip of the last 7 days marks missed days', () => {
    expect(lastDays(['2026-10-13', T], T).map((d) => d.mark)).toEqual(['missed', 'missed', 'missed', 'missed', 'done', 'missed', 'done']);
  });

  it('a week keeps the check-in streak it reached, and the weekly report compares it with last week', () => {
    const dates = [...run('2026-10-07', 3), ...run(T, 4)]; // Mon–Wed of last week; Mon–Thu this week
    expect(weekCheckinStreak(dates, '2026-10-05', '2026-10-11')).toBe(3);
    expect(weekCheckinStreak(dates, '2026-10-12', T)).toBe(4);
    expect(weekCheckinStreak([], '2026-10-12', T)).toBe(0);
    const r = weekReport({ history: [], docs: [], week: T, today: T, weekStartDay: 1, checkins: dates });
    expect(r.now.checkin).toBe(4);
    expect(r.prev.checkin).toBe(3);
    expect(r.delta.checkin).toBe(1);
  });
});
