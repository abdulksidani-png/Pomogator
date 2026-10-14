import type { BreakKind, Tier } from './types';

/** Break length in minutes for a quiz score. No quiz (total 0) gets the "none" length. */
export function breakFor(score: number, total: number, tier: Tier): number {
  if (!total) return tier.none;
  const pct = score / total;
  return pct >= 1 ? tier.max : pct >= 0.5 ? tier.mid : tier.min;
}

/** The break after the next counted session is long when it completes the cycle. */
export const nextBreakKind = (cycleDone: number, longEvery: number): BreakKind =>
  cycleDone + 1 >= longEvery ? 'long' : 'short';

/** Every possible score for an n-question quiz, best first, with the break it earns. */
export function tierRows(n: number, tier: Tier): { score: number; mins: number }[] {
  const rows = [];
  for (let k = n; k >= 0; k--) rows.push({ score: k, mins: breakFor(k, n, tier) });
  return rows;
}

export function tierSentence(n: number, tier: Tier): string {
  if (n === 1) return `1/1 earns ${tier.max} minutes, 0/1 earns ${tier.min}.`;
  return tierRows(n, tier).map((r) => `${r.score}/${n} = ${r.mins} min`).join(', ') + '.';
}
