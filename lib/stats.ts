/**
 * The stats engine: pure functions over the session history, unit-tested in tests/unit/stats.test.ts.
 * Every "day" is the session's stored local date (`date`), which was worked out with the time zone
 * and rollover hour in effect when the session happened, so changing time zones later doesn't move it.
 */
import { rebuildStats, isCounted } from './sync-map';
import type { DocMeta, SessionRecord } from './types';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What each number means, shown as a tooltip next to it. */
export const DEFINITIONS = {
  studyTime: 'Minutes studied in sessions that reached at least half their planned length.',
  sessions: 'Sessions that reached at least half their planned length. Average length is study time ÷ these sessions.',
  accuracy: 'Questions answered right ÷ questions answered. Skipped quizzes don\'t count.',
  goals: 'Sessions where you reached your document goal ÷ sessions that had one.',
  streak: 'Days in a row with at least one counted session. Today counts once you finish a session; until then the streak runs through yesterday.',
  breaks: 'Break minutes earned from quizzes and sessions.',
  bestDay: 'The weekday with the most minutes per study day, and the weekday with the best quiz accuracy (at least 3 answers).',
  bestTime: 'Morning (5–12), afternoon (12–5), evening (5–9) or night (9–5), by quiz accuracy (at least 3 answers).',
  docProgress: 'The furthest page reached ÷ the number of pages. Studied pages came up in a session; quizzed pages were in a session that ended with a quiz.',
  mastered: 'Missed at least once, then answered right twice in a row.',
} as const;

/** "2026-10-14" → weekday (0 = Sunday), independent of the device's time zone. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** The first day of the week holding `date` (weekStart 1 = Monday, 0 = Sunday). */
export function weekStartOf(date: string, weekStart: number): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>();
/** The local hour (0–23) of a moment in a time zone. */
export function hourIn(ts: number, timeZone = ''): number {
  let f = hourFormatters.get(timeZone);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || undefined, hour: 'numeric', hourCycle: 'h23' }); }
    catch { f = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23' }); }
    hourFormatters.set(timeZone, f);
  }
  return Number(f.format(ts)) % 24;
}

/** Right and answered for one session's quiz. Skipped quizzes count as nothing answered. */
export function quizCounts(h: SessionRecord): { correct: number; answered: number } {
  const q = h.quiz;
  if (!q || (q.status !== 'done' && q.status !== 'partial')) return { correct: 0, answered: 0 };
  if (q.items?.length) return { correct: q.items.filter((i) => i.correct).length, answered: q.items.length };
  return { correct: q.score ?? 0, answered: q.total ?? 0 };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export interface Streak { current: number; longest: number; freezesLeft: number; frozenDays: string[] }

/**
 * Days in a row from a set of active dates. The current streak runs through today, or through
 * yesterday if today has nothing yet. With freezes on: every 7 days in a row earns one (holding at
 * most 2), and a missed day uses one up automatically instead of breaking the streak.
 */
export function streakOf(dates: Iterable<string>, today: string, opts: { freezes?: boolean } = {}): Streak {
  const set = new Set(dates);
  const sorted = [...set].filter((d) => d <= today).sort();
  if (!sorted.length) return { current: 0, longest: 0, freezesLeft: 0, frozenDays: [] };
  let run = 0, longest = 0, freezes = 0, sinceEarn = 0;
  let frozen: string[] = [];
  const end = set.has(today) ? today : addDays(today, -1);
  // Walk every day from the first active day to the end, so gaps are seen.
  for (let d = sorted[0]; d <= end; d = addDays(d, 1)) {
    if (set.has(d)) {
      run++; sinceEarn++;
      if (opts.freezes && sinceEarn >= 7) { freezes = Math.min(2, freezes + 1); sinceEarn = 0; }
      longest = Math.max(longest, run);
    } else if (opts.freezes && run > 0 && freezes > 0) {
      freezes--; frozen.push(d); // a missed day, covered by a freeze: the streak survives but doesn't grow
    } else {
      run = 0; sinceEarn = 0; frozen = [];
    }
  }
  return { current: run, longest, freezesLeft: opts.freezes ? freezes : 0, frozenDays: frozen };
}

export interface DayStat { date: string; minutes: number; sessions: number; correct: number; answered: number }

export interface Stats {
  studyMin: number;
  sessions: number;
  avgSessionMin: number | null;
  breakMin: number;
  correct: number;
  answered: number;
  accuracy: number | null;
  goalsMet: number;
  goalsSet: number;
  goalsPct: number | null;
  byTopic: { topic: string; minutes: number; correct: number; answered: number; accuracy: number | null }[];
  byDoc: { docId: string; name: string; correct: number; answered: number; accuracy: number | null }[];
  bestDayMinutes: { day: number; avgMin: number } | null;
  bestDayAccuracy: { day: number; accuracy: number } | null;
  bestTime: { slot: TimeOfDay; accuracy: number } | null;
  streak: Streak;
  days: DayStat[];
  docs: { docId: string; name: string; pageCount: number; reached: number; pct: number; studied: boolean[]; quizzed: boolean[] }[];
  mostMissed: { concept: string; topic: string; missed: number; seen: number }[];
  mastered: { concept: string; topic: string }[];
}

export interface StatsInput {
  history: SessionRecord[];
  docs: DocMeta[];
  today: string;
  timezone?: string;
  /** Only sessions on or after this date (YYYY-MM-DD); streaks always use everything. */
  from?: string;
  /** How many days the per-day series covers, ending today. */
  dayCount?: number;
  freezes?: boolean;
}

/** "biology|krebs cycle" (how concepts are filed) → "biology · krebs cycle". */
export const prettyTopic = (key: string) => key.split('|').map((x) => x.trim()).filter(Boolean).join(' · ') || 'Unlabeled';

const label = (h: SessionRecord) => [h.subject, h.topic].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || 'Unlabeled';

export function computeStats({ history, docs, today, timezone = '', from, dayCount = 14, freezes = false }: StatsInput): Stats {
  const all = history.filter((h) => h.date <= today);
  const inRange = from ? all.filter((h) => h.date >= from) : all;
  const counted = inRange.filter(isCounted);

  const studyMin = Math.round(counted.reduce((n, h) => n + (h.studiedMin ?? 0), 0));
  let correct = 0, answered = 0;
  const topics = new Map<string, { minutes: number; correct: number; answered: number }>();
  const byDocMap = new Map<string, { name: string; correct: number; answered: number }>();
  const dayMin = new Map<string, number>();
  const wdAcc = Array.from({ length: 7 }, () => ({ c: 0, a: 0 }));
  const slotAcc = new Map<TimeOfDay, { c: number; a: number }>();

  for (const h of inRange) {
    const q = quizCounts(h);
    correct += q.correct; answered += q.answered;
    const t = topics.get(label(h)) ?? { minutes: 0, correct: 0, answered: 0 };
    if (isCounted(h)) t.minutes += h.studiedMin ?? 0;
    t.correct += q.correct; t.answered += q.answered;
    topics.set(label(h), t);
    if (h.docId) {
      const d = byDocMap.get(h.docId) ?? { name: docs.find((x) => x.id === h.docId)?.name || h.docName || 'Document', correct: 0, answered: 0 };
      d.correct += q.correct; d.answered += q.answered;
      byDocMap.set(h.docId, d);
    }
    if (q.answered) {
      const wd = wdAcc[weekdayOf(h.date)]; wd.c += q.correct; wd.a += q.answered;
      const slot = timeOfDay(hourIn(h.startedAt, timezone));
      const s = slotAcc.get(slot) ?? { c: 0, a: 0 }; s.c += q.correct; s.a += q.answered; slotAcc.set(slot, s);
    }
  }
  for (const h of counted) dayMin.set(h.date, (dayMin.get(h.date) ?? 0) + (h.studiedMin ?? 0));

  // Best weekday by minutes: total minutes ÷ the number of that weekday's dates with any study.
  const wdMin = Array.from({ length: 7 }, () => ({ min: 0, days: 0 }));
  for (const [date, min] of dayMin) { const w = wdMin[weekdayOf(date)]; w.min += min; w.days++; }
  let bestDayMinutes: Stats['bestDayMinutes'] = null;
  wdMin.forEach((w, day) => { if (w.days && (!bestDayMinutes || w.min / w.days > bestDayMinutes.avgMin)) bestDayMinutes = { day, avgMin: Math.round(w.min / w.days) }; });
  let bestDayAccuracy: Stats['bestDayAccuracy'] = null;
  wdAcc.forEach((w, day) => { const p = w.a >= 3 ? pct(w.c, w.a)! : -1; if (p >= 0 && (!bestDayAccuracy || p > bestDayAccuracy.accuracy)) bestDayAccuracy = { day, accuracy: p }; });
  let bestTime: Stats['bestTime'] = null;
  for (const slot of ['morning', 'afternoon', 'evening', 'night'] as TimeOfDay[]) {
    const s = slotAcc.get(slot);
    const p = s && s.a >= 3 ? pct(s.c, s.a)! : -1;
    if (p >= 0 && (!bestTime || p > bestTime.accuracy)) bestTime = { slot, accuracy: p };
  }

  const withGoal = inRange.filter((h) => h.goalMet !== undefined);
  const goalsMet = withGoal.filter((h) => h.goalMet).length;

  const days: DayStat[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const on = all.filter((h) => h.date === date);
    const c = on.filter(isCounted);
    const q = on.map(quizCounts).reduce((a, b) => ({ correct: a.correct + b.correct, answered: a.answered + b.answered }), { correct: 0, answered: 0 });
    days.push({ date, minutes: Math.round(c.reduce((n, h) => n + (h.studiedMin ?? 0), 0)), sessions: c.length, ...q });
  }

  // Documents: furthest page, and which pages came up (all time, since progress through a document is cumulative).
  const docStats = docs.map((d) => {
    const studied = Array<boolean>(d.pageCount).fill(false);
    const quizzed = Array<boolean>(d.pageCount).fill(false);
    let reached = d.furthest || 0;
    for (const h of all) {
      if (h.docId !== d.id || !h.endPage) continue;
      reached = Math.max(reached, h.endPage);
      const a = Math.max(1, h.startPage ?? 1), b = Math.min(d.pageCount, h.endPage);
      const quiz = quizCounts(h).answered > 0;
      for (let p = a; p <= b; p++) { studied[p - 1] = true; if (quiz) quizzed[p - 1] = true; }
    }
    reached = Math.min(reached, d.pageCount);
    return { docId: d.id, name: d.name, pageCount: d.pageCount, reached, pct: d.pageCount ? Math.round((reached / d.pageCount) * 100) : 0, studied, quizzed };
  });

  const concepts = Object.values(rebuildStats([...all].sort((a, b) => a.startedAt - b.startedAt)));
  const mostMissed = concepts.filter((c) => c.missed > 0).sort((a, b) => (b.missed - a.missed) || (b.last - a.last)).slice(0, 6)
    .map((c) => ({ concept: c.concept, topic: prettyTopic(c.topic), missed: c.missed, seen: c.seen }));
  const mastered = concepts.filter((c) => c.missed > 0 && c.streak >= 2).sort((a, b) => b.last - a.last).slice(0, 8)
    .map((c) => ({ concept: c.concept, topic: prettyTopic(c.topic) }));

  return {
    studyMin,
    sessions: counted.length,
    avgSessionMin: counted.length ? Math.round(studyMin / counted.length) : null,
    breakMin: Math.round(inRange.reduce((n, h) => n + (h.breakMin ?? 0), 0)),
    correct, answered, accuracy: pct(correct, answered),
    goalsMet, goalsSet: withGoal.length, goalsPct: pct(goalsMet, withGoal.length),
    byTopic: [...topics].map(([topic, t]) => ({ topic, minutes: Math.round(t.minutes), correct: t.correct, answered: t.answered, accuracy: pct(t.correct, t.answered) }))
      .filter((t) => t.minutes > 0 || t.answered > 0).sort((a, b) => b.minutes - a.minutes),
    byDoc: [...byDocMap].map(([docId, d]) => ({ docId, ...d, accuracy: pct(d.correct, d.answered) })),
    bestDayMinutes, bestDayAccuracy, bestTime,
    streak: streakOf(all.filter(isCounted).map((h) => h.date), today, { freezes }),
    days, docs: docStats, mostMissed, mastered,
  };
}
