/**
 * Check-in streaks: pure functions, unit-tested in tests/unit/checkins.test.ts.
 *
 * A check-in is the first real action of a day (starting the timer, uploading a document, adding a
 * task or answering a quiz question; just opening the page doesn't count). Days are local dates
 * worked out with the time zone and rollover hour, like study sessions. The check-in streak uses
 * the same rules as the study streak (`streakOf`), including streak freezes.
 */
import { addDays, streakOf, weekdayOf, type Streak } from './stats';

/** Streak lengths that earn a badge (and confetti). */
export const MILESTONES = [3, 7, 14, 30, 50, 100, 365] as const;
/** How many days of check-ins are kept (about four years). */
const KEEP = 1500;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Dates in the right shape, sorted, without repeats. Whatever came back from storage or another device. */
export function cleanDates(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d): d is string => typeof d === 'string' && DATE.test(d)))].sort().slice(-KEEP);
}

/** Earned badges by milestone: { "7": "2026-10-15" }. */
export function cleanBadges(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const m of MILESTONES) {
    const d = (v as Record<string, unknown>)[m];
    if (typeof d === 'string' && DATE.test(d)) out[m] = d;
  }
  return out;
}

/** Two devices' check-ins together. */
export const mergeDates = (a: string[], b: string[]) => cleanDates([...a, ...b]);

/** Two devices' badges together; the earlier date wins. */
export function mergeBadges(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a };
  for (const [k, d] of Object.entries(b)) if (!out[k] || d < out[k]) out[k] = d;
  return out;
}

export const checkinStreak = (dates: string[], today: string, freezes = false): Streak => streakOf(dates, today, { freezes });

export type DayMark = 'done' | 'frozen' | 'missed' | 'future';
export interface StripDay { date: string; letter: string; mark: DayMark; today: boolean }

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The last `n` days ending today, each checked in, covered by a freeze, or missed. */
export function lastDays(dates: string[], today: string, freezes = false, n = 7): StripDay[] {
  const set = new Set(dates);
  const frozen = new Set(checkinStreak(dates, today, freezes).frozenDays);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1);
    const mark: DayMark = set.has(date) ? 'done' : frozen.has(date) ? 'frozen' : date > today ? 'future' : 'missed';
    return { date, letter: LETTERS[weekdayOf(date)], mark, today: date === today };
  });
}

export interface Celebration {
  date: string;
  /** The check-in streak including today. */
  streak: number;
  longest: number;
  /** The longest streak before today, for "Your best is 23 days". */
  bestBefore: number;
  /** The best streak before this one began; beating it today is a new personal best. */
  record: number;
  /** The very first check-in. */
  first: boolean;
  /** A streak ended since the last check-in and a new one starts today. */
  broken: boolean;
  /** A freeze covered a missed day just before today. */
  saved: boolean;
  freezesLeft: number;
  /** Milestones reached today that weren't earned before; `milestone` is the biggest. */
  newBadges: number[];
  milestone: number | null;
  days: StripDay[];
  line: string;
}

/** What to show for the first check-in of `today`. `dates` already includes today. */
export function celebrationFor(dates: string[], today: string, badges: Record<string, string>, freezes = false): Celebration {
  const s = checkinStreak(dates, today, freezes);
  const before = dates.filter((d) => d < today);
  const bestBefore = before.length ? checkinStreak(before, addDays(today, -1), freezes).longest : 0;
  const first = before.length === 0;
  const broken = !first && s.current === 1;
  const saved = s.frozenDays.includes(addDays(today, -1));
  const runStart = addDays(today, -(s.current + s.frozenDays.length - 1));
  const earlier = dates.filter((d) => d < runStart);
  const record = earlier.length ? checkinStreak(earlier, earlier[earlier.length - 1], freezes).longest : 0;
  const newBadges = MILESTONES.filter((m) => s.current >= m && !badges[m]);
  const milestone = newBadges.length ? newBadges[newBadges.length - 1] : null;
  const c: Celebration = {
    date: today, streak: s.current, longest: s.longest, bestBefore, record, first, broken, saved,
    freezesLeft: s.freezesLeft, newBadges: [...newBadges], milestone, days: lastDays(dates, today, freezes), line: '',
  };
  c.line = encouragement(c);
  return c;
}

/** The headline on the card: "🔥 12-day streak!" or a kind welcome back. */
export function headlineOf(c: Celebration): string {
  if (c.first) return 'Day 1. You checked in!';
  if (c.broken) return 'Welcome back!';
  return `${c.streak}-day streak!`;
}

/** One line of encouragement. Never guilt: a broken streak just starts again. */
export function encouragement(c: Pick<Celebration, 'streak' | 'bestBefore' | 'record' | 'first' | 'broken' | 'saved' | 'milestone'>): string {
  if (c.first) return 'Show up tomorrow and your streak begins. Small steps add up.';
  if (c.broken) return `New streak starts today. Your best is ${c.bestBefore} day${c.bestBefore === 1 ? '' : 's'}.`;
  if (c.saved) return 'A streak freeze covered the day you missed, so your streak is safe.';
  if (c.milestone) return MILESTONE_LINES[c.milestone] ?? `${c.milestone} days in a row. Amazing.`;
  if (c.record >= 3 && c.streak === c.record + 1) return `A new personal best! Your old record was ${c.record} days.`;
  const lines = [
    'Showing up is the hardest part, and you did it.',
    'Every day you study makes the next one easier.',
    'Consistency beats cramming. Keep it rolling.',
    'Your future self says thanks.',
    'One more day of progress. Nice.',
  ];
  return lines[c.streak % lines.length];
}

const MILESTONE_LINES: Record<number, string> = {
  3: 'Three days in a row: a habit is starting.',
  7: 'A full week! You earned a badge.',
  14: 'Two weeks straight. This is a real habit now.',
  30: 'A whole month of showing up. Incredible.',
  50: 'Fifty days! Very few people get here.',
  100: 'One hundred days. Legendary focus.',
  365: 'A full year of check-ins. Unbelievable.',
};

/** The check-in streak a week reached: as of its last check-in (so a finished week keeps its run). */
export function weekCheckinStreak(dates: string[], from: string, to: string, freezes = false): number {
  const last = dates.filter((d) => d >= from && d <= to).at(-1);
  return last ? checkinStreak(dates.filter((d) => d <= last), last, freezes).current : 0;
}

/** A badge's display name. */
export const badgeName = (m: number) => (m === 7 ? 'One week' : m === 14 ? 'Two weeks' : m === 30 ? 'One month' : m === 365 ? 'One year' : `${m} days`);
