/**
 * The weekly report engine: pure functions over the session history, unit-tested in tests/unit/weekly.test.ts.
 * A week runs from the profile's week start (Monday by default) for seven days. Every number comes from
 * computeStats (lib/stats.ts), so the report and the Stats page always agree.
 */
import { WEEKDAYS, addDays, computeStats, streakOf, weekStartOf, type DayStat, type Stats } from './stats';
import { isCounted, rebuildStats } from './sync-map';
import { topicKey } from './context';
import type { DocMeta, SessionRecord, WeeklyInput } from './types';

export interface WeekNumbers { studyMin: number; sessions: number; accuracy: number | null; goalsPct: number | null; streak: number; studyDays: number }

export interface WeekReport {
  start: string;
  end: string;
  /** The week is still going (it holds today). */
  inProgress: boolean;
  daysLeft: number;
  /** Nothing studied or quizzed this week. */
  empty: boolean;
  stats: Stats;
  now: WeekNumbers;
  prev: WeekNumbers;
  /** Change vs. last week: minutes, sessions, accuracy points, goal points, streak days (null when either side has no value). */
  delta: { studyMin: number; sessions: number; accuracy: number | null; goalsPct: number | null; streak: number };
  /** The seven days of the week; days after today are marked `future`. */
  days: (DayStat & { future: boolean; accuracy: number | null })[];
  /** Twelve weeks of days ending with this week, for the calendar heatmap. */
  heat: DayStat[];
  docs: { docId: string; name: string; unit: string; pageCount: number; reached: number; pct: number; coveredThisWeek: number }[];
  missed: { concept: string; topic: string; missed: number; seen: number }[];
  mastered: { concept: string; topic: string }[];
  /** Three concrete steps for next week, worked out without AI (the AI may rewrite them). */
  focus: string[];
}

export interface WeekInput {
  history: SessionRecord[];
  docs: DocMeta[];
  /** Any date in the week (YYYY-MM-DD). */
  week: string;
  today: string;
  weekStartDay: number;
  timezone?: string;
  freezes?: boolean;
}

const unitOf = (d: Pick<DocMeta, 'kind'>, n: number) => (d.kind === 'pptx' ? 'slide' : d.kind === 'docx' || d.kind === 'text' ? 'section' : 'page') + (n === 1 ? '' : 's');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const label = (h: SessionRecord) => [h.subject, h.topic].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || 'Unlabeled';
const conceptKey = (topic: string, concept: string) => `${topic}\u0000${concept.trim().toLowerCase()}`;

function numbers(s: Stats, streak: number): WeekNumbers {
  return { studyMin: s.studyMin, sessions: s.sessions, accuracy: s.accuracy, goalsPct: s.goalsPct, streak, studyDays: s.days.filter((d) => d.minutes > 0).length };
}
const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** Concepts mastered (missed at least once, then right twice in a row) as of the end of `history`. */
function masteredSet(history: SessionRecord[]) {
  const out = new Map<string, { concept: string; topic: string }>();
  for (const c of Object.values(rebuildStats(history))) if (c.missed > 0 && c.streak >= 2) out.set(`${c.topic}\u0000${c.concept}`, { concept: c.concept, topic: c.topic });
  return out;
}

export function weekReport({ history, docs, week, today, weekStartDay, timezone = '', freezes = false }: WeekInput): WeekReport {
  const start = weekStartOf(week, weekStartDay);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7), prevEnd = addDays(start, -1);
  const upTo = end < today ? end : today;
  const inWeek = history.filter((h) => h.date >= start && h.date <= end);

  const stats = computeStats({ history, docs, today: end, timezone, from: start, dayCount: 84, freezes });
  const prevStats = computeStats({ history, docs, today: prevEnd, timezone, from: prevStart, dayCount: 7, freezes });
  // A week's streak is the run of study days it reached: as of its last study day (so a finished week keeps its run).
  const countedDates = history.filter(isCounted).map((h) => h.date);
  const reached = (from: string, to: string) => {
    const last = countedDates.filter((d) => d >= from && d <= to).sort().at(-1);
    return last ? streakOf(countedDates.filter((d) => d <= last), last, { freezes }) : { current: 0, longest: 0, freezesLeft: 0, frozenDays: [] };
  };
  stats.streak = reached(start, upTo);
  const streak = stats.streak.current;
  const prevStreak = reached(prevStart, prevEnd).current;

  const week7 = stats.days.slice(-7);
  const now = { ...numbers(stats, streak), studyDays: week7.filter((d) => d.minutes > 0).length };
  const prev = numbers(prevStats, prevStreak);

  const days = week7.map((d) => ({ ...d, future: d.date > today, accuracy: pct(d.correct, d.answered) }));

  // Pages covered this week, per document (a document's overall progress comes from all sessions so far).
  const covered = new Map<string, Set<number>>();
  for (const h of inWeek) {
    if (!h.docId || !h.endPage) continue;
    const set = covered.get(h.docId) ?? new Set<number>();
    for (let p = Math.max(1, h.startPage ?? 1); p <= h.endPage; p++) set.add(p);
    covered.set(h.docId, set);
  }
  const docRows = stats.docs
    .map((d) => {
      const meta = docs.find((x) => x.id === d.docId);
      const n = [...(covered.get(d.docId) ?? [])].filter((p) => p <= d.pageCount).length;
      return { docId: d.docId, name: d.name, unit: meta ? unitOf(meta, 2) : 'pages', pageCount: d.pageCount, reached: d.reached, pct: d.pct, coveredThisWeek: n };
    })
    .filter((d) => d.coveredThisWeek > 0 || inWeek.some((h) => h.docId === d.docId));

  // Concepts missed this week, most first.
  const miss = new Map<string, { concept: string; topic: string; missed: number; seen: number }>();
  for (const h of inWeek) {
    for (const it of h.quiz?.items ?? []) {
      if (!it.concept) continue;
      const k = conceptKey(label(h), it.concept);
      const m = miss.get(k) ?? { concept: it.concept, topic: label(h), missed: 0, seen: 0 };
      m.seen++; if (!it.correct) m.missed++;
      miss.set(k, m);
    }
  }
  const missed = [...miss.values()].filter((m) => m.missed > 0).sort((a, b) => b.missed - a.missed || b.seen - a.seen).slice(0, 6);

  // Mastered during this week: mastered by its end but not before it began.
  const before = masteredSet(history.filter((h) => h.date < start));
  const after = masteredSet(history.filter((h) => h.date <= end));
  const names = new Map(history.map((h) => [topicKey(h), label(h)])); // "ancient greek philosophy" → as it was typed
  const mastered = [...after].filter(([k]) => !before.has(k))
    .map(([, v]) => ({ concept: v.concept, topic: names.get(v.topic) ?? (v.topic.split('|').map((x) => x.trim()).filter(Boolean).join(' · ') || 'Unlabeled') })).slice(0, 8);

  const report: WeekReport = {
    start, end, inProgress: today >= start && today <= end, daysLeft: today >= start && today <= end ? 6 - Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000) : 0,
    empty: inWeek.length === 0,
    stats, now, prev,
    delta: { studyMin: now.studyMin - prev.studyMin, sessions: now.sessions - prev.sessions, accuracy: diff(now.accuracy, prev.accuracy), goalsPct: diff(now.goalsPct, prev.goalsPct), streak: now.streak - prev.streak },
    days, heat: stats.days, docs: docRows, missed, mastered, focus: [],
  };
  report.focus = focusSteps(report);
  return report;
}

/** Three concrete steps for next week from the numbers alone: what was missed, what's unfinished, when to study. */
export function focusSteps(r: Pick<WeekReport, 'missed' | 'docs' | 'stats' | 'now' | 'empty'>): string[] {
  const out: string[] = [];
  const m = r.missed[0];
  if (m) out.push(`Start your first session with 5 minutes of recall on ${m.concept} (${m.topic}), which you missed ${m.missed === 1 ? 'once' : `${m.missed} times`}.`);
  const open = r.docs.filter((d) => d.reached < d.pageCount).sort((a, b) => b.pct - a.pct)[0];
  if (open) out.push(`Finish ${open.name}: ${open.pageCount - open.reached} ${open.unit} to go (you're ${open.pct}% through).`);
  const m2 = r.missed[1];
  if (m2 && out.length < 3) out.push(`Make 3 flashcards for ${m2.concept} and quiz yourself on them mid-week.`);
  if (r.stats.bestTime && out.length < 3) {
    const slot = r.stats.bestTime.slot === 'night' ? 'at night' : `in the ${r.stats.bestTime.slot}`;
    out.push(`Plan your hardest sessions ${slot}, when your quiz accuracy was ${r.stats.bestTime.accuracy}%.`);
  }
  if (out.length < 3) {
    const target = Math.min(7, Math.max(3, r.now.studyDays + 1));
    out.push(r.empty ? 'Pick three days next week and put one 25-minute session on each.' : `Aim for ${target} study days next week (you studied on ${r.now.studyDays}).`);
  }
  if (out.length < 3) out.push('End each session by taking the quiz, even when it\'s short: it\'s what makes the material stick.');
  if (out.length < 3) out.push('Upload the slides or notes for your next topic, so your quizzes come from your own material.');
  return out.slice(0, 3);
}

/** The weeks that have any study, newest first, always including the current week. */
export function weeksWithStudy(history: SessionRecord[], today: string, weekStartDay: number): string[] {
  const set = new Set<string>([weekStartOf(today, weekStartDay)]);
  for (const h of history) if (h.date <= today) set.add(weekStartOf(h.date, weekStartDay));
  return [...set].sort().reverse();
}

/** Last week, if it had study and hasn't been looked at yet ("Your week in review"). */
export function unseenLastWeek(history: SessionRecord[], today: string, weekStartDay: number, seen: string): string | null {
  const last = addDays(weekStartOf(today, weekStartDay), -7);
  if (seen >= last) return null;
  const end = addDays(last, 6);
  return history.some((h) => h.date >= last && h.date <= end && isCounted(h)) ? last : null;
}

/** A fingerprint of the numbers behind a summary, so a saved summary can tell when it's out of date. */
export const reportSig = (r: WeekReport) => [r.now.studyMin, r.now.sessions, r.stats.answered, r.stats.correct, r.stats.goalsSet].join('.');

/** What the AI gets to write the summary: the numbers, compactly. */
export function weeklyInput(r: WeekReport): WeeklyInput {
  return {
    week: `${r.start} to ${r.end}`,
    inProgress: r.inProgress,
    daysLeft: r.daysLeft,
    now: r.now, prev: r.prev,
    days: r.days.filter((d) => !d.future).map((d) => ({ day: WEEKDAYS[new Date(`${d.date}T12:00:00Z`).getUTCDay()].slice(0, 3), minutes: d.minutes, accuracy: d.accuracy })),
    topics: r.stats.byTopic.slice(0, 6).map((t) => ({ topic: t.topic, minutes: t.minutes, accuracy: t.accuracy })),
    missed: r.missed.slice(0, 5).map((m) => ({ concept: m.concept, topic: m.topic, missed: m.missed })),
    mastered: r.mastered.slice(0, 5).map((m) => m.concept),
    docs: r.docs.slice(0, 5).map((d) => ({ name: d.name, pct: d.pct, coveredThisWeek: d.coveredThisWeek, unit: d.unit })),
    bestDay: r.stats.bestDayMinutes ? WEEKDAYS[r.stats.bestDayMinutes.day] : '',
    bestTime: r.stats.bestTime ? `${r.stats.bestTime.slot} (${r.stats.bestTime.accuracy}% right)` : '',
    hints: r.focus,
  };
}

const hmText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

/** A headline and summary from the numbers alone, for when the AI is off or still writing. Never shaming. */
export function plainSummary(r: WeekReport): { headline: string; summary: string } {
  if (r.empty) {
    return r.inProgress
      ? { headline: 'A fresh week', summary: 'Nothing studied yet this week. Your first session starts the report: minutes, quiz scores and progress fill in as you go.' }
      : { headline: 'A quiet week', summary: 'No study sessions this week. That happens. One 25-minute session is all it takes to get going again.' };
  }
  const n = r.now, d = r.delta;
  const more = d.studyMin > 0 ? `, ${hmText(d.studyMin)} more than last week` : d.studyMin === 0 && r.prev.studyMin > 0 ? ', the same as last week' : '';
  const parts = [`You studied ${hmText(n.studyMin)} over ${n.studyDays} day${n.studyDays === 1 ? '' : 's'}${more}.`];
  if (n.accuracy !== null) parts.push(`You answered ${n.accuracy}% of quiz questions right${d.accuracy !== null && d.accuracy > 0 ? `, up ${d.accuracy} points` : ''}.`);
  if (r.mastered.length) parts.push(`You mastered ${r.mastered.length === 1 ? r.mastered[0].concept : `${r.mastered.length} concepts`}.`);
  else if (r.missed[0]) parts.push(`${r.missed[0].concept} is the one to review next.`);
  const headline = r.inProgress ? `${hmText(n.studyMin)} so far this week` : d.studyMin > 0 ? 'More study than last week' : n.streak >= 3 ? `A ${n.streak}-day streak going` : 'Another week of study done';
  return { headline, summary: parts.join(' ') };
}
