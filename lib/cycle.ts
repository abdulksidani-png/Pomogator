/**
 * The study cycle ("Study session 2 of 4"). The count belongs to a run of study, not to the app: after a long time
 * away (the next morning, say) it starts again at session 1, and it can be set by hand. Pure rules, used by the store.
 */

/** Choices for Settings → Timer → "New cycle after being away", in hours. 0 = never reset by itself. */
export const CYCLE_RESET_CHOICES = [1, 2, 3, 4, 6, 8, 12, 24, 0] as const;
export const DEFAULT_CYCLE_RESET_HOURS = 4;

export const cycleResetLabel = (h: number) => (h <= 0 ? 'Never' : h === 1 ? '1 hour' : `${h} hours`);

/** Keep the setting to one of the choices (a saved value from elsewhere, or a typo, falls back to the default). */
export const cleanCycleHours = (v: unknown): number => {
  const n = Number(v);
  return (CYCLE_RESET_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_CYCLE_RESET_HOURS;
};

/** When the person last did anything on the timer: the later of the timer's own stamp and the newest finished session. */
export const lastActiveAt = (cycleAt: number | undefined, history: { endedAt?: number }[]): number => {
  let last = cycleAt || 0;
  for (const h of history.slice(-5)) if (h.endedAt && h.endedAt > last) last = h.endedAt;
  return last;
};

/**
 * Has the person been away long enough that the cycle should start over? Only when there is something to start over
 * from (sessions counted, or a break left waiting). Without any record of when they were last here, it has.
 */
export function awayLong(a: { last: number; hours: number; now: number; hasState: boolean }): boolean {
  if (a.hours <= 0 || !a.hasState) return false;
  return !a.last || a.now - a.last >= a.hours * 3_600_000;
}

/** "Study session N of M" → the count to store (sessions already done). Out-of-range picks are pulled in. */
export const cycleDoneFor = (session: number, longEvery: number): number =>
  Math.min(Math.max(0, Math.round(session) - 1), Math.max(0, longEvery - 1));
