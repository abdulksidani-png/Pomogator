/**
 * Study points: pure, unit-tested in tests/unit/points.test.ts.
 *
 * Points are worked out from what's already saved (check-in days and finished sessions), so two devices
 * can never count the same day twice. What you've bought is subtracted; the balance never goes below zero.
 *
 * - Every check-in day: 10 points, with a streak bonus of +10% per day in a row after the first, up to +50%.
 * - Every session studied for at least 20 minutes without skipping (90% or more of its planned length):
 *   1 point per 5 minutes, plus 5 for a session of 45 minutes or more.
 */
import { addDays } from './stats';
import { COSMETICS } from './cosmetics';
import type { SessionRecord } from './types';

export const CHECKIN_POINTS = 10;
export const POINT_RULES = [
  'Check in each day: +10 points, up to +15 with a streak going',
  'Study 20+ minutes without skipping: +1 point per 5 minutes',
  'Sessions of 45 minutes or more: +5 bonus',
];

/** The streak bonus on day `n` of a streak: ×1.0 on day 1, +0.1 a day, at most ×1.5. */
export const streakMultiplier = (n: number) => 1 + Math.min(0.5, 0.1 * Math.max(0, n - 1));

/** Points for each check-in day, by date. Freezes (when on) keep a streak going over a missed day, as in streaks. */
export function checkinPointsByDay(dates: string[], freezes = false): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return out;
  const set = new Set(sorted);
  let run = 0, held = 0, sinceEarn = 0;
  for (let d = sorted[0]; d <= sorted[sorted.length - 1]; d = addDays(d, 1)) {
    if (set.has(d)) {
      run++; sinceEarn++;
      if (freezes && sinceEarn >= 7) { held = Math.min(2, held + 1); sinceEarn = 0; }
      out.set(d, Math.round(CHECKIN_POINTS * streakMultiplier(run)));
    } else if (freezes && run > 0 && held > 0) {
      held--;
    } else {
      run = 0; sinceEarn = 0;
    }
  }
  return out;
}

/** Points for one finished session (0 if it was short or skipped). */
export function sessionPoints(h: Pick<SessionRecord, 'studiedMin' | 'plannedMin'>): number {
  const min = h.studiedMin ?? 0;
  if (min < 20 || min < h.plannedMin * 0.9) return 0;
  return Math.floor(min / 5) + (min >= 45 ? 5 : 0);
}

export interface PointsInput { checkins: string[]; history: Pick<SessionRecord, 'studiedMin' | 'plannedMin'>[]; owned: string[]; bank?: number; freezes?: boolean }

export function pointsSummary({ checkins, history, owned, bank = 0, freezes = false }: PointsInput) {
  let fromCheckins = 0;
  for (const p of checkinPointsByDay(checkins, freezes).values()) fromCheckins += p;
  const fromStudy = history.reduce((n, h) => n + sessionPoints(h), 0) + bank;
  const spent = owned.reduce((n, id) => n + (COSMETICS.find((c) => c.id === id)?.price ?? 0), 0);
  const earned = fromCheckins + fromStudy;
  return { earned, spent, balance: Math.max(0, earned - spent), fromCheckins, fromStudy };
}
