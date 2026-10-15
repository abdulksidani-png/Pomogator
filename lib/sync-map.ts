/**
 * Pure helpers that translate between the app's local records and database rows,
 * and merge copies of history coming from different devices.
 */
import type { Asked, ConceptStat, DocKind, DocMeta, QuizOutcomeStatus, SeenEvent, SessionRecord, Task } from './types';
import { recordConcepts, topicKey } from './context';
import { hash } from './util';

export interface SessionRow {
  user_id: string;
  id: string;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  planned_min: number;
  studied_min: number | null;
  counted: boolean;
  subject: string;
  topic: string;
  level: string;
  goal: string;
  quiz_status: string | null;
  quiz_score: number | null;
  quiz_total: number | null;
  break_min: number | null;
  break_kind: string | null;
  document_id: string | null;
  start_page: number | null;
  end_page: number | null;
  goal_page: number | null;
  goal_met: boolean | null;
  progress_source: string | null;
}

export interface EventRow {
  user_id: string;
  id: string;
  session_id: string;
  at: string;
  page_index: number | null;
  title: string;
  source: 'screen' | 'manual';
  confidence: number | null;
}

export interface DocRow {
  user_id: string;
  id: string;
  name: string;
  kind: DocKind;
  size_bytes: number;
  page_count: number;
  titles: string[];
  furthest_page: number;
  storage_path: string | null;
  created_at: string;
}

export interface AttemptRow {
  user_id: string;
  id: string;
  session_id: string;
  topic_key: string;
  concept: string;
  question: string;
  chosen: string;
  answer: string;
  correct: boolean;
  created_at: string;
}

export interface TaskRow { id: string; text: string; done: boolean; position: number }

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);
const num = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));

export const isCounted = (h: SessionRecord) => (h.studiedMin ?? 0) >= h.plannedMin / 2;

export function sessionToRow(h: SessionRecord, userId: string): SessionRow {
  return {
    user_id: userId,
    id: h.id,
    started_at: iso(h.startedAt),
    ended_at: h.endedAt ? iso(h.endedAt) : null,
    local_date: h.date,
    planned_min: h.plannedMin,
    studied_min: h.studiedMin ?? null,
    counted: isCounted(h),
    subject: h.subject || '',
    topic: h.topic || '',
    level: h.level || 'intro',
    goal: h.goal || '',
    quiz_status: h.quiz?.status ?? null,
    quiz_score: h.quiz?.score ?? null,
    quiz_total: h.quiz?.total ?? null,
    break_min: h.breakMin ?? null,
    break_kind: h.breakKind ?? null,
    document_id: h.docId ?? null,
    start_page: h.startPage ?? null,
    end_page: h.endPage ?? null,
    goal_page: h.goalPage ?? null,
    goal_met: h.goalMet ?? null,
    progress_source: h.progressSource ?? null,
  };
}

export function eventsFor(h: SessionRecord, userId: string): EventRow[] {
  return (h.seen ?? []).map((e, i) => ({
    user_id: userId, id: `${h.id}:${i}`, session_id: h.id, at: iso(e.at),
    page_index: e.page || null, title: e.title || '', source: e.source, confidence: e.conf ?? null,
  }));
}

export function rowToEvent(r: EventRow): SeenEvent {
  const e: SeenEvent = { at: ms(r.at)!, page: r.page_index ?? 0, title: r.title || '', source: r.source };
  if (r.confidence !== null && r.confidence !== undefined) e.conf = Number(r.confidence);
  return e;
}

export function docToRow(d: DocMeta, userId: string): DocRow {
  return {
    user_id: userId, id: d.id, name: d.name.slice(0, 200), kind: d.kind, size_bytes: d.size, page_count: d.pageCount,
    titles: d.titles.slice(0, 400).map((t) => t.slice(0, 120)), furthest_page: d.furthest, storage_path: d.storagePath ?? null,
    created_at: iso(d.createdAt),
  };
}

export function rowToDoc(r: DocRow): DocMeta {
  const d: DocMeta = {
    id: r.id, name: r.name, kind: r.kind, size: Number(r.size_bytes) || 0, pageCount: Number(r.page_count) || 0,
    titles: Array.isArray(r.titles) ? r.titles.map(String) : [], createdAt: ms(r.created_at) ?? Date.now(), furthest: Number(r.furthest_page) || 0,
  };
  if (r.storage_path) d.storagePath = r.storage_path;
  return d;
}

export const docHash = (d: DocMeta) => hash(JSON.stringify([d.name, d.kind, d.pageCount, d.furthest, d.storagePath ?? null]));

export function attemptsFor(h: SessionRecord, userId: string): AttemptRow[] {
  const tk = topicKey(h);
  const at = iso(h.endedAt ?? h.startedAt);
  return (h.quiz?.items ?? []).map((it, i) => ({
    user_id: userId,
    id: `${h.id}:${i}`,
    session_id: h.id,
    topic_key: tk,
    concept: it.concept,
    question: it.question,
    chosen: it.chosen,
    answer: it.answer,
    correct: it.correct,
    created_at: at,
  }));
}

export function rowToSession(r: SessionRow, attempts: AttemptRow[], events: EventRow[] = []): SessionRecord {
  const items = attempts
    .slice()
    .sort((a, b) => Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()))
    .map((a) => ({ concept: a.concept, question: a.question, chosen: a.chosen, answer: a.answer, correct: a.correct }));
  const rec: SessionRecord = {
    id: r.id,
    date: String(r.local_date).slice(0, 10),
    startedAt: ms(r.started_at)!,
    endedAt: ms(r.ended_at),
    plannedMin: Number(r.planned_min),
    studiedMin: num(r.studied_min),
    subject: r.subject || '',
    topic: r.topic || '',
    level: (r.level || 'intro') as SessionRecord['level'],
    goal: r.goal || '',
  };
  if (r.quiz_status) {
    rec.quiz = { status: r.quiz_status as QuizOutcomeStatus };
    if (r.quiz_total !== null) { rec.quiz.score = num(r.quiz_score) ?? 0; rec.quiz.total = num(r.quiz_total); }
    if (items.length) rec.quiz.items = items;
  }
  if (r.break_min !== null) rec.breakMin = num(r.break_min);
  if (r.break_kind) rec.breakKind = r.break_kind as SessionRecord['breakKind'];
  if (r.document_id) {
    rec.docId = r.document_id;
    if (r.start_page != null) rec.startPage = Number(r.start_page);
    if (r.end_page != null) rec.endPage = Number(r.end_page);
    if (r.goal_page != null) rec.goalPage = Number(r.goal_page);
    if (r.goal_met != null) rec.goalMet = !!r.goal_met;
    if (r.progress_source) rec.progressSource = r.progress_source as SessionRecord['progressSource'];
  }
  if (events.length) {
    rec.seen = events.slice().sort((a, b) => Number(a.id.split(':').pop()) - Number(b.id.split(':').pop())).map(rowToEvent);
  }
  return rec;
}

/** Changes whenever any synced field of a session changes. */
export function sessionHash(h: SessionRecord): string {
  return hash(JSON.stringify([
    h.date, h.startedAt, h.endedAt ?? null, h.plannedMin, h.studiedMin ?? null, h.subject, h.topic, h.level, h.goal,
    h.quiz?.status ?? null, h.quiz?.score ?? null, h.quiz?.total ?? null,
    (h.quiz?.items ?? []).map((i) => [i.concept, i.question, i.chosen, i.answer, i.correct]),
    h.breakMin ?? null, h.breakKind ?? null,
    h.docId ?? null, h.startPage ?? null, h.endPage ?? null, h.goalPage ?? null, h.goalMet ?? null, h.progressSource ?? null,
    (h.seen ?? []).map((e) => [e.at, e.page, e.title, e.source, e.conf ?? null]),
  ]));
}

/** Prefer the copy that knows more: the one with its break recorded, then the one that ended later. */
function better(a: SessionRecord, b: SessionRecord): SessionRecord {
  const aBreak = a.breakMin !== undefined, bBreak = b.breakMin !== undefined;
  if (aBreak !== bBreak) return aBreak ? a : b;
  if ((a.endedAt ?? 0) !== (b.endedAt ?? 0)) return (a.endedAt ?? 0) > (b.endedAt ?? 0) ? a : b;
  return b;
}

/** Union of two histories by session id, oldest first, capped at `limit`. */
export function mergeHistory(local: SessionRecord[], remote: SessionRecord[], limit = 400): SessionRecord[] {
  const byId = new Map<string, SessionRecord>();
  for (const h of local) byId.set(h.id, h);
  for (const r of remote) {
    const l = byId.get(r.id);
    byId.set(r.id, l ? better(l, r) : r);
  }
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-limit);
}

/** Recompute concept stats from history, so every device ends up with the same numbers. */
export function rebuildStats(history: SessionRecord[]): Record<string, ConceptStat> {
  const stats: Record<string, ConceptStat> = {};
  const ordered = history.slice().sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));
  for (const h of ordered) {
    if (h.quiz?.items?.length) recordConcepts(stats, topicKey(h), h.quiz.items, h.endedAt ?? h.startedAt);
  }
  return stats;
}

/** Today's asked questions: whatever this device remembers plus what history shows. */
export function rebuildAsked(history: SessionRecord[], local: Asked, today: string): Asked {
  const items = new Set(local.date === today ? local.items : []);
  for (const h of history) if (h.date === today) for (const it of h.quiz?.items ?? []) items.add(it.question);
  return { date: today, items: [...items].slice(-60) };
}

export const rowsToTasks = (rows: TaskRow[]): Task[] =>
  rows.slice().sort((a, b) => a.position - b.position).map((r) => ({ id: r.id, text: r.text, done: !!r.done }));
