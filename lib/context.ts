import type { Asked, ConceptStat, QuizItemResult, Settings, StudyContext } from './types';
import { hash } from './util';

export const LEVEL_NAMES: Record<StudyContext['level'], string> = {
  hs: 'High school',
  intro: 'Intro college',
  advanced: 'Advanced college',
  exam: 'Exam prep',
};

export const topicKey = (o: { subject?: string; topic?: string }) =>
  `${o.subject || ''}|${o.topic || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();

export const topicLabel = (o: { subject?: string; topic?: string }) =>
  [o.subject, o.topic].map((x) => (x || '').trim()).filter(Boolean).join(' · ');

export const hasTopic = (c: StudyContext) => !!(c.topic.trim() || c.subject.trim() || c.notes.trim());

/** Changes whenever anything that shapes the quiz changes. */
export const ctxKey = (c: StudyContext, s: Settings) =>
  hash(JSON.stringify([c.subject, c.topic, c.level, c.exam, c.goal, c.notes, s.difficulty, s.questions]));

/** One-word topics without notes make vague quizzes. */
export function isVagueTopic(c: StudyContext): boolean {
  const t = c.topic.trim();
  return !!t && t.split(/\s+/).length === 1 && t.length < 14 && !c.notes.trim();
}

/** Mutates `stats` (an immer draft or plain object) with this quiz's answers. */
export function recordConcepts(stats: Record<string, ConceptStat>, tk: string, items: QuizItemResult[], now = Date.now()) {
  for (const it of items) {
    const key = tk + '::' + it.concept.toLowerCase();
    const c = stats[key] ?? { topic: tk, concept: it.concept, seen: 0, missed: 0, streak: 0, last: 0 };
    c.seen++;
    if (it.correct) c.streak++;
    else { c.missed++; c.streak = 0; }
    c.last = now;
    stats[key] = c;
  }
}

/** Concepts missed on this topic that haven't been answered right twice in a row since. */
export function weakConcepts(stats: Record<string, ConceptStat>, tk: string, limit = 5): ConceptStat[] {
  return Object.values(stats)
    .filter((c) => c.topic === tk && c.missed > 0 && c.streak < 2)
    .sort((a, b) => (b.missed - a.missed) || (b.last - a.last))
    .slice(0, limit);
}

export const askedToday = (a: Asked, today: string): string[] => (a.date === today ? a.items : []);

/** Mutates `a` to remember today's questions so they aren't repeated. */
export function addAsked(a: Asked, qs: string[], today: string) {
  if (a.date !== today) { a.date = today; a.items = []; }
  a.items.push(...qs);
  a.items = a.items.slice(-60);
}
