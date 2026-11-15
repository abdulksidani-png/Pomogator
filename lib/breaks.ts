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



/**
 * The same table for a long quiz, grouped so it stays short: consecutive scores that earn the same break share a row
 * ("10/10", "5–9", "0–4"). Best first. For up to four questions every score keeps its own row (see `tierRows`).
 */
export function tierGroups(n: number, tier: Tier): { label: string; mins: number }[] {
  const out: { hi: number; lo: number; mins: number }[] = [];
  for (const r of tierRows(n, tier)) {
    const last = out[out.length - 1];
    if (last && last.mins === r.mins) last.lo = r.score;
    else out.push({ hi: r.score, lo: r.score, mins: r.mins });
  }
  return out.map((g) => ({ label: g.hi === g.lo ? `${g.hi}/${n}` : `${g.lo}–${g.hi}/${n}`, mins: g.mins }));
}

/** What the break chips show: every score for a short quiz, grouped for a long one. */
export const tierChips = (n: number, tier: Tier): { label: string; mins: number }[] =>
  n <= 4 ? tierRows(n, tier).map((r) => ({ label: `${r.score}/${n}`, mins: r.mins })) : tierGroups(n, tier);

export function tierSentence(n: number, tier: Tier): string {
  if (n === 1) return `1/1 earns ${tier.max} minutes, 0/1 earns ${tier.min}.`;
  return tierChips(n, tier).map((r) => `${r.label} = ${r.mins} min`).join(', ') + '.';
}
