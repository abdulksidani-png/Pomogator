/**
 * Studying together, the pure part (unit-tested in tests/unit/collab.test.ts).
 *
 * A room keeps one shared timer on the server's clock. Nobody has to write "the study session ended" or
 * "the break ended": every device works out the current phase from the stored state and the server time,
 * so they all agree. A press (start, pause, finish…) writes a new state for everyone.
 */
import type { CollabTimer } from './types';

const MIN = 60_000;

/** The timer as it stands at server time `now`: a running study session that has ended is the shared break, and so on. */
export function effective(s: CollabTimer, now: number, breakMin: number): CollabTimer {
  let t: CollabTimer = { phase: s.phase === 'break' ? 'break' : 'study', status: s.status ?? 'idle', round: s.round || 1, ...(s.endAt ? { endAt: s.endAt } : {}), ...(s.remainingMs !== undefined ? { remainingMs: s.remainingMs } : {}), ...(s.by ? { by: s.by } : {}) };
  if (t.phase === 'study' && t.status === 'running' && t.endAt !== undefined && now >= t.endAt) {
    t = { phase: 'break', status: 'running', endAt: t.endAt + breakMin * MIN, round: t.round, by: t.by };
  }
  if (t.phase === 'break' && t.status === 'running' && t.endAt !== undefined && now >= t.endAt) {
    t = { phase: 'study', status: 'idle', round: t.round + 1 };
  }
  return t;
}

export type Press = 'start' | 'pause' | 'reset' | 'addFive' | 'finish' | 'skipBreak';

/** The new shared state after someone presses a button, or null if the press does nothing right now. */
export function pressed(s: CollabTimer, p: Press, now: number, studyMin: number, breakMin: number, by: string): CollabTimer | null {
  const e = effective(s, now, breakMin);
  const left = e.status === 'running' ? Math.max(0, (e.endAt ?? now) - now) : (e.remainingMs ?? 0);
  switch (p) {
    case 'start':
      if (e.status === 'running') return null;
      if (e.status === 'paused') return { phase: e.phase, status: 'running', endAt: now + left, round: e.round, by };
      if (e.phase === 'study') return { phase: 'study', status: 'running', endAt: now + studyMin * MIN, round: e.round, by };
      return { phase: 'break', status: 'running', endAt: now + breakMin * MIN, round: e.round, by };
    case 'pause':
      return e.status === 'running' ? { phase: e.phase, status: 'paused', remainingMs: left, round: e.round, by } : null;
    case 'reset':
      return e.phase === 'study' && e.status !== 'idle' ? { phase: 'study', status: 'idle', round: e.round, by } : null;
    case 'addFive':
      if (e.phase !== 'study' || e.status === 'idle') return null;
      return e.status === 'running'
        ? { ...e, endAt: (e.endAt ?? now) + 5 * MIN, by }
        : { ...e, remainingMs: left + 5 * MIN, by };
    case 'finish':
      return e.phase === 'study' && e.status !== 'idle' ? { phase: 'break', status: 'running', endAt: now + breakMin * MIN, round: e.round, by } : null;
    case 'skipBreak':
      return e.phase === 'break' ? { phase: 'study', status: 'idle', round: e.round + 1, by } : null;
  }
}

/** "30 min study · 7 min breaks". */
export const roomTerms = (studyMin: number, breakMin: number) => `${studyMin} min study · ${breakMin} min breaks`;
