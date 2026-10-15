'use client';
/**
 * All of PomoGator's state and actions in one store. The timer is timestamp based:
 * remaining = endAt - now, so it stays right across refreshes and sleeping tabs.
 * Phase 1 persists to this browser's localStorage. Phase 2 adds account sync.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
  Account, AiStatus, Asked, BreakKind, BreakReason, ConceptStat, DayState, PlanState, QuizOutcome, QuizResult,
  DocMeta, QuizState, SessionRecord, Settings, StudyContext, SyncState, Task, TimerPreset, TimerState, Tier, WeeklySaved,
} from './types';
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS, freshQuiz, freshSync, freshTimer } from './defaults';
import { breakFor } from './breaks';
import { addAsked, askedToday, ctxKey, hasTopic, recordConcepts, topicKey, topicLabel, weakConcepts } from './context';
import { aiErrorText } from './quiz';
import { AI } from './ai-client';
import { Sound } from './sound';
import { MIN, clamp, mergeDeep, round1, timeOf, uid } from './util';
import { applyPreset, cleanName, savePreset } from './presets';
import { dayOf, detectTimeZone, todayFor } from './dates';

export interface Data {
  settings: Settings;
  context: StudyContext;
  timer: TimerState;
  quiz: QuizState;
  plan: PlanState;
  day: DayState;
  tasks: Task[];
  history: SessionRecord[];
  stats: Record<string, ConceptStat>;
  asked: Asked;
  sync: SyncState;
  docs: DocMeta[];
  /** Weekly report summaries by week (its first day), and the last week whose review was opened or dismissed. */
  weekly: Record<string, WeeklySaved>;
  weeklySeen: string;
}
interface Flash { msg: string; id: number }
interface Ui { toast: Flash | null; announce: Flash | null; aiStatus: AiStatus; booted: boolean; account: Account }
interface EndOpts { quiet?: boolean; auto?: boolean }

interface Actions {
  boot: () => Promise<void>;
  showToast: (msg: string) => void;
  say: (msg: string) => void;
  // settings and context
  updateSettings: (fn: (s: Settings) => void) => void;
  setStudyMin: (m: number) => void;
  setLoop: (on: boolean) => void;
  /** Saved timers: save the current setup under a name, switch to one, or delete one. */
  saveTimer: (name: string) => TimerPreset | null;
  applyTimer: (id: string) => void;
  deleteTimer: (id: string) => void;
  /** Fold a card shut or open it again. */
  toggleFold: (id: string) => void;
  setContext: (patch: Partial<StudyContext>) => void;
  appendNotes: (text: string, name: string) => void;
  // timer
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  addFive: () => void;
  skip: () => void;
  markDone: () => void;
  complete: (opts?: EndOpts) => void;
  tick: () => void;
  switchMode: (mode: 'study' | BreakKind) => void;
  endStudy: (reason: 'time' | 'done' | 'skip', opts?: EndOpts) => void;
  finishSession: (quiz: QuizOutcome) => void;
  startBreak: (kind: BreakKind, result: QuizResult | null, reason: BreakReason, opts?: EndOpts) => void;
  endBreak: (reason: 'time' | 'skip', opts?: EndOpts) => void;
  // quiz
  prefetchQuiz: () => Promise<void>;
  retryQuiz: () => void;
  beginQuiz: () => void;
  answer: (i: number) => void;
  nextQ: () => void;
  finishQuiz: (early: boolean) => void;
  skipQuiz: () => void;
  // plan and day summary
  generatePlan: (result: QuizResult) => Promise<void>;
  retryPlan: () => void;
  applyPlan: () => void;
  summarizeDay: () => Promise<void>;
  // tasks and data
  addTask: (text: string) => void;
  /** Add several tasks at once, optionally replacing the list (used by the assistant). */
  addTasks: (texts: string[], replace?: boolean) => void;
  /** Keep a weekly summary (only the newest 26 weeks), and remember that a week's review was seen. */
  saveWeekly: (week: string, data: WeeklySaved) => void;
  markWeekSeen: (week: string) => void;
  toggleTask: (id: string, done: boolean) => void;
  deleteTask: (id: string) => void;
  clearDone: () => void;
  resetTasks: () => void;
  clearHistory: () => void;
  // sync plumbing
  /** Change any part of the state directly (used by the sync engine). */
  mutate: (fn: (d: Data & Ui) => void) => void;
  setAccount: (patch: Partial<Account>) => void;
  /** Forget everything on this device (after signing out, or before loading a different account). */
  resetLocalData: () => void;
  // documents and progress
  addDoc: (doc: DocMeta) => void;
  removeDoc: (id: string) => void;
  selectDoc: (id: string) => void;
  setDocGoal: (text: string, page: number) => void;
  setStartPage: (page: number) => void;
  /** During a session: the page now on screen (or picked by hand). */
  recordProgress: (page: number, title: string, source: 'screen' | 'manual', conf?: number) => void;
  /** Add speech heard from a shared tab to the live session's notes. */
  addHeard: (text: string) => void;
  /** After a session: how far it really got. */
  setReached: (sessionId: string, page: number) => void;
  /** Delete the screen-tracking log for the current session, or for every session. */
  clearSeen: (scope: 'session' | 'all') => void;
}

export type Store = Data & Ui & Actions;

let quizCtl: AbortController | null = null;
let planCtl: AbortController | null = null;
let dayCtl: AbortController | null = null;
let flashId = 0;

const isCancel = (e: unknown) => (e as { code?: string })?.code === 'cancelled' || (e as { name?: string })?.name === 'AbortError';

export const remainingAt = (T: TimerState, now: number) => (T.status === 'running' ? Math.max(0, T.endAt - now) : T.remainingMs);

/** The document pages a quiz should cover, as [from, to]: where the session started up to the furthest
 *  slide seen on screen, or else up to the goal (or the next 10 pages). Null without a document. */
export function quizPages(d: Data): [number, number] | null {
  const c = d.context;
  const doc = c.docId ? d.docs.find((x) => x.id === c.docId) : undefined;
  if (!doc) return null;
  const s = d.timer.session;
  const from = clamp(s?.startPage ?? c.startPage, 1, doc.pageCount);
  const end = s?.progressSource === 'screen' && s.endPage ? s.endPage : c.goalPage || from + 9;
  return [from, clamp(end, from, doc.pageCount)];
}

/** What a quiz is written from, beyond the context: the covered pages and the lecture transcript so far. */
export function sourcesKey(d: Data): string {
  const p = quizPages(d);
  const heard = d.timer.session?.heard?.length ?? 0;
  return `${p ? `${d.context.docId}:${p[0]}-${p[1]}` : ''}|${Math.floor(heard / 1500)}`;
}

const quizReusable = (d: Data) =>
  d.quiz.gen === 'ready' && d.quiz.ctxKey === ctxKey(d.context, d.settings) && (d.quiz.sources ?? '') === sourcesKey(d) && !d.quiz.used && d.quiz.madeOn === todayFor(d.settings);
export const quizMatches = (d: Data) => d.quiz.gen === 'ready' && d.quiz.ctxKey === ctxKey(d.context, d.settings) && (d.quiz.sources ?? '') === sourcesKey(d) && !d.quiz.used;
export const quizReadyForTaking = (q: QuizState) => q.gen === 'ready' && !q.used && q.questions.length > 0;

function initialData(): Data {
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    context: { ...DEFAULT_CONTEXT },
    timer: freshTimer(DEFAULT_SETTINGS),
    quiz: freshQuiz(),
    plan: { status: 'none' },
    day: { date: '', status: 'none' },
    tasks: [],
    history: [],
    stats: {},
    asked: { date: '', items: [] },
    sync: freshSync(),
    docs: [],
    weekly: {},
    weeklySeen: '',
  };
}

/** Saved weekly summaries in the right shape, whatever came back from storage or another device. */
export function cleanWeeklyMap(v: unknown): Record<string, WeeklySaved> {
  const out: Record<string, WeeklySaved> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, Partial<WeeklySaved>>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !x || typeof x.summary !== 'string') continue;
    out[k] = { headline: String(x.headline ?? ''), summary: x.summary, focus: Array.isArray(x.focus) ? x.focus.filter((f) => typeof f === 'string').slice(0, 3) : [], sig: String(x.sig ?? ''), at: Number(x.at) || 0 };
  }
  return out;
}

/** Fill in defaults and undo half-finished states (requests that a reload interrupted). */
export function normalizeData(p: Partial<Data> | undefined): Data {
  const base = initialData();
  if (!p) return base;
  const settings = mergeDeep(DEFAULT_SETTINGS, p.settings);
  const quiz: QuizState = { ...freshQuiz(), ...(p.quiz || {}) };
  if (quiz.gen === 'loading') quiz.gen = 'none'; // a reload dropped the request in flight
  const plan: PlanState = { status: 'none', ...(p.plan || {}) };
  if (plan.status === 'loading') { plan.status = 'failed'; plan.error = 'The plan was interrupted by a reload.'; }
  const day: DayState = { date: '', status: 'none', ...(p.day || {}) };
  if (day.status === 'loading') day.status = 'none';
  const fs = freshSync();
  return {
    settings,
    context: mergeDeep(DEFAULT_CONTEXT, p.context),
    timer: { ...freshTimer(settings), ...(p.timer || {}) },
    quiz, plan, day,
    tasks: p.tasks ?? [],
    history: p.history ?? [],
    stats: p.stats ?? {},
    asked: p.asked ?? { date: '', items: [] },
    docs: p.docs ?? [],
    weekly: cleanWeeklyMap(p.weekly),
    weeklySeen: typeof p.weeklySeen === 'string' ? p.weeklySeen : '',
    sync: p.sync
      ? { ...fs, ...p.sync, v: { ...fs.v, ...p.sync.v }, acked: { ...fs.acked, ...p.sync.acked }, pushed: { ...(p.sync.pushed || {}) } }
      : fs,
  };
}

/** "slide" for PowerPoint, "page" for everything else. */
export const unitWord = (doc: Pick<DocMeta, 'kind'>, n: number) => (doc.kind === 'pptx' ? 'slide' : doc.kind === 'docx' || doc.kind === 'text' ? 'section' : 'page') + (n === 1 ? '' : 's');

/** Make `doc` the one being studied, resuming after the furthest page reached. */
function pointAt(d: Data, doc: DocMeta) {
  const changed = d.context.docId !== doc.id;
  d.context.docId = doc.id;
  d.context.startPage = clamp(doc.furthest ? doc.furthest + 1 : 1, 1, doc.pageCount);
  if (changed) { d.context.docGoal = ''; d.context.goalPage = 0; }
  if (!d.context.topic.trim()) d.context.topic = doc.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 140);
}

/** After a session: move the document's resume point, and clear a goal that was met. */
function applyReached(d: Data, doc: DocMeta, rec: SessionRecord) {
  const end = rec.endPage ?? 0;
  doc.furthest = Math.max(doc.furthest, end);
  if (d.context.docId !== doc.id) return;
  d.context.startPage = clamp(end + 1, 1, doc.pageCount);
  if (rec.goalMet) { d.context.docGoal = ''; d.context.goalPage = 0; }
  else if (rec.goalPage && !d.context.goalPage) d.context.goalPage = rec.goalPage;
}

export const useStudy = create<Store>()(
  persist(
    immer((set, get) => {
      const toast = (msg: string) => set((d) => { d.toast = { msg, id: ++flashId }; });
      const say = (msg: string) => set((d) => { d.announce = { msg, id: ++flashId }; });

      function signalEnd(title: string, body: string, opts: EndOpts = {}) {
        const { settings } = get();
        if (!opts.quiet) Sound.chime(settings.chime, settings.chimeVol);
        if (settings.notify && !opts.quiet) {
          try {
            if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'pomogator' });
          } catch { /* notifications not allowed here */ }
        }
        toast(title);
      }

      return {
        ...initialData(),
        toast: null,
        announce: null,
        aiStatus: 'checking',
        booted: false,
        account: { status: 'local', syncing: false },
        showToast: toast,
        say,

        async boot() {
          if (get().booted) return;
          set((d) => { d.booted = true; if (!d.settings.timezone) d.settings.timezone = detectTimeZone(); });
          // Recover a timer that ran out while the page was closed.
          const T = get().timer;
          if (T.status === 'running' && T.endAt <= Date.now()) {
            const overdue = Date.now() - T.endAt;
            get().complete({ quiet: overdue > 5000, auto: overdue < 2 * MIN });
          }
          const status = await AI.ready();
          set((d) => { d.aiStatus = status; });
          const d = get();
          if (d.timer.phase === 'study' && d.timer.session && d.quiz.gen === 'none' && hasTopic(d.context)) void get().prefetchQuiz();
          if (d.timer.phase === 'quiz' && d.quiz.gen === 'none' && hasTopic(d.context)) void get().prefetchQuiz();
        },

        /* ---------- settings & context ---------- */
        updateSettings(fn) { set((d) => { fn(d.settings); }); },
        setStudyMin(m) {
          set((d) => {
            d.settings.studyMin = clamp(Math.round(m), 1, 90);
            const T = d.timer;
            if (T.phase === 'study' && T.status === 'idle' && !T.session) T.totalMs = T.remainingMs = d.settings.studyMin * MIN;
          });
        },
        setLoop(on) {
          set((d) => { d.settings.loop = on; });
          toast(on ? 'Loop on: phases start automatically' : 'Loop off');
        },
        saveTimer(name) {
          if (!cleanName(name)) return null;
          const s = get().settings;
          const r = savePreset(s.savedTimers, name, s);
          set((d) => { d.settings.savedTimers = r.list; });
          toast(`Saved "${r.preset.name}"`);
          return r.preset;
        },
        applyTimer(id) {
          const p = get().settings.savedTimers.find((x) => x.id === id);
          if (!p) return;
          const T0 = get().timer;
          const later = T0.phase !== 'study' || T0.status !== 'idle' || !!T0.session;
          set((d) => {
            applyPreset(d.settings, p);
            const T = d.timer;
            if (T.phase === 'study' && T.status === 'idle' && !T.session) T.totalMs = T.remainingMs = d.settings.studyMin * MIN;
          });
          toast(`Switched to "${p.name}"${later && T0.totalMs !== get().settings.studyMin * MIN ? '. The new length starts with the next session.' : ''}`);
        },
        deleteTimer(id) {
          const p = get().settings.savedTimers.find((x) => x.id === id);
          set((d) => { d.settings.savedTimers = d.settings.savedTimers.filter((x) => x.id !== id); });
          if (p) toast(`Deleted "${p.name}"`);
        },
        toggleFold(id) {
          set((d) => {
            const f = d.settings.folded;
            d.settings.folded = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
          });
        },
        setContext(patch) { set((d) => { Object.assign(d.context, patch); }); },
        appendNotes(text, name) {
          const t = text.trim();
          if (!t) { toast('No text found in that file.'); return; }
          set((d) => { d.context.notes = (d.context.notes.trim() ? d.context.notes.trim() + '\n\n' : '') + t; });
          toast(`Added notes from ${name}`);
        },

        /* ---------- timer ---------- */
        start() {
          Sound.ensure();
          const s = get();
          if (s.timer.phase === 'quiz' || s.timer.status === 'running') return;
          let needQuiz = false;
          set((d) => {
            const T = d.timer;
            if (T.phase === 'study' && !T.session) {
              T.session = {
                id: uid(), date: dayOf(Date.now(), d.settings), startedAt: Date.now(), plannedMin: d.settings.studyMin,
                subject: d.context.subject, topic: d.context.topic, level: d.context.level, goal: d.context.goal,
              };
              const doc = d.docs.find((x) => x.id === d.context.docId);
              if (doc) {
                Object.assign(T.session, {
                  docId: doc.id, docName: doc.name, startPage: clamp(d.context.startPage || 1, 1, doc.pageCount),
                  goalPage: d.context.goalPage ? clamp(d.context.goalPage, 1, doc.pageCount) : undefined, seen: [],
                });
              }
              T.refreshTried = false;
              needQuiz = !quizReusable(d);
            }
            if (T.remainingMs <= 0) T.remainingMs = T.totalMs;
            T.status = 'running';
            T.endAt = Date.now() + T.remainingMs;
          });
          if (needQuiz) void get().prefetchQuiz();
        },
        pause() {
          set((d) => {
            const T = d.timer;
            if (T.status !== 'running') return;
            T.remainingMs = Math.max(0, T.endAt - Date.now());
            T.status = 'paused';
            T.endAt = 0;
          });
        },
        toggle() { if (get().timer.status === 'running') get().pause(); else get().start(); },
        reset() {
          set((d) => {
            const T = d.timer;
            if (T.phase === 'quiz') return;
            if (T.phase === 'study') { T.totalMs = d.settings.studyMin * MIN; T.session = null; }
            T.status = 'idle'; T.remainingMs = T.totalMs; T.endAt = 0;
          });
        },
        addFive() {
          Sound.ensure();
          const { timer: T, quiz: Q } = get();
          if (T.phase === 'quiz') {
            if (Q.step !== 'intro' && Q.answers.some(Boolean)) return; // only before any answer
            set((d) => {
              d.quiz.step = 'intro';
              const t = d.timer;
              t.phase = 'study'; t.status = 'idle';
              t.totalMs = (t.studiedMs || 0) + 5 * MIN; t.remainingMs = 5 * MIN;
              t.cycleDone = Math.max(0, t.cycleDone - (t.countedCycle ? 1 : 0));
              t.countedCycle = false;
            });
            get().start();
            toast('5 more minutes. The quiz waits for you.');
            return;
          }
          set((d) => {
            const t = d.timer;
            t.totalMs += 5 * MIN;
            if (t.status === 'running') t.endAt += 5 * MIN; else t.remainingMs += 5 * MIN;
          });
          if (get().timer.status !== 'running') get().start();
        },
        skip() {
          const T = get().timer;
          if (T.phase === 'study') { if (T.status === 'idle' && !T.session) return; get().endStudy('skip'); }
          else if (T.phase === 'break') get().endBreak('skip');
          else get().skipQuiz();
        },
        markDone() { const T = get().timer; if (T.phase === 'study' && T.session) get().endStudy('done'); },
        complete(opts = {}) {
          const T = get().timer;
          if (T.phase === 'study') get().endStudy('time', opts);
          else if (T.phase === 'break') get().endBreak('time', opts);
        },
        tick() {
          const d = get();
          const T = d.timer;
          if (T.status !== 'running') return;
          const r = T.endAt - Date.now();
          if (r <= 0) { get().complete(); return; }
          // Two minutes before the end: if the topic changed since the quiz was written, rewrite it once.
          if (T.phase === 'study' && r <= 2 * MIN && !T.refreshTried && hasTopic(d.context) && d.quiz.gen !== 'loading' && d.quiz.ctxKey !== ctxKey(d.context, d.settings)) {
            set((x) => { x.timer.refreshTried = true; });
            void get().prefetchQuiz();
          }
        },
        switchMode(mode) {
          set((d) => {
            const T = d.timer;
            if (T.status !== 'idle' || T.phase === 'quiz') return;
            if (mode === 'study') Object.assign(T, { phase: 'study', totalMs: d.settings.studyMin * MIN, breakReason: '', lastResult: null });
            else Object.assign(T, { phase: 'break', breakKind: mode, totalMs: d.settings.tiers[mode].none * MIN, breakReason: 'manual', lastResult: null, session: null });
            T.remainingMs = T.totalMs; T.endAt = 0;
          });
        },
        endStudy(reason, opts = {}) {
          const now = Date.now();
          // Assigned inside set(); typed wide so TypeScript doesn't narrow them to their initial values.
          let next = 'quiz' as 'skip' | 'short' | 'quiz';
          let kind = 'short' as BreakKind;
          set((d) => {
            const T = d.timer;
            const studiedMs = Math.max(0, T.totalMs - remainingAt(T, now));
            T.status = 'idle'; T.remainingMs = 0; T.endAt = 0; T.studiedMs = studiedMs;
            const c = d.context;
            const base: SessionRecord = T.session
              ? current(T.session)
              : { id: uid(), date: dayOf(now - studiedMs, d.settings), startedAt: now - studiedMs, plannedMin: d.settings.studyMin, subject: '', topic: '', level: c.level, goal: '' };
            const s: SessionRecord = { ...base, endedAt: now, studiedMin: round1(studiedMs / MIN), subject: c.subject, topic: c.topic, level: c.level, goal: c.goal };
            T.session = s;
            const enough = studiedMs >= (s.plannedMin * MIN) / 2;
            T.countedCycle = enough;
            if (enough) T.cycleDone += 1;
            kind = enough && T.cycleDone >= d.settings.longEvery ? 'long' : 'short';
            T.breakKind = kind;
            // "Finish session now" always offers the quiz; a timer that ran out on a short session doesn't.
            next = reason === 'skip' ? 'skip' : !enough && reason !== 'done' ? 'short' : 'quiz';
            if (next === 'quiz') {
              T.phase = 'quiz';
              d.quiz.step = d.settings.loop ? 'question' : 'intro';
              d.quiz.index = 0;
              d.quiz.answers = [];
            }
          });
          if (reason === 'time') signalEnd('Study session complete', hasTopic(get().context) ? 'Quiz time. Answer to earn your break.' : 'Time for a break.', opts);
          if (next === 'skip') { get().finishSession({ status: 'skipped' }); get().startBreak(kind, null, 'skipped'); return; }
          if (next === 'short') { get().finishSession({ status: 'too-short' }); get().startBreak(kind, null, 'short-session'); return; }
          const d = get();
          const key = ctxKey(d.context, d.settings);
          const same = d.quiz.ctxKey === key && (d.quiz.sources ?? '') === sourcesKey(d);
          if (!quizMatches(d) && !(d.quiz.gen === 'loading' && same) && !(d.quiz.gen === 'failed' && same)) void get().prefetchQuiz();
          say('Study session complete. Quiz time.');
        },
        finishSession(quiz) {
          set((d) => {
            const s = d.timer.session;
            if (!s) return;
            const rec: SessionRecord = { ...current(s), quiz, endedAt: s.endedAt || Date.now() };
            delete rec.heard; // the lecture transcript only feeds this session's quiz
            const doc = rec.docId ? d.docs.find((x) => x.id === rec.docId) : undefined;
            if (doc) {
              if (rec.endPage === undefined) { rec.endPage = rec.goalPage ?? rec.startPage; rec.progressSource = 'assumed'; }
              rec.goalMet = rec.goalPage ? (rec.endPage ?? 0) >= rec.goalPage : undefined;
              applyReached(d, doc, rec);
            }
            d.history.push(rec);
            if (d.history.length > 400) d.history.splice(0, d.history.length - 400);
            d.timer.lastSessionId = rec.id;
            d.timer.session = null;
          });
        },
        startBreak(kind, result, reason, opts = {}) {
          let mins = 0;
          set((d) => {
            const tier: Tier = d.settings.tiers[kind];
            mins = result ? breakFor(result.score, result.total, tier) : tier.none;
            const T = d.timer;
            if (kind === 'long') T.cycleDone = 0;
            Object.assign(T, {
              phase: 'break', breakKind: kind, breakReason: reason, totalMs: mins * MIN, remainingMs: mins * MIN, status: 'idle', endAt: 0, countedCycle: false,
              lastResult: { score: result?.score ?? null, total: result?.total ?? 0, items: result?.items ?? [], mins, kind, reason, at: Date.now() },
            });
            if (T.lastSessionId && reason !== 'manual') {
              const h = d.history.find((x) => x.id === T.lastSessionId);
              if (h) { h.breakMin = mins; h.breakKind = kind; }
            }
          });
          say(`${mins}-minute ${kind} break.`);
          if (get().settings.loop && opts.auto !== false) get().start();
        },
        endBreak(reason, opts = {}) {
          set((d) => {
            Object.assign(d.timer, {
              phase: 'study', status: 'idle', totalMs: d.settings.studyMin * MIN, remainingMs: d.settings.studyMin * MIN,
              endAt: 0, session: null, breakReason: '', lastResult: null,
            });
          });
          if (reason === 'time') signalEnd('Break is over', 'Ready for the next study session?', opts);
          say('Break over. Next study session ready.');
          if (get().settings.loop && reason === 'time' && opts.auto !== false) get().start();
        },

        /* ---------- quiz ---------- */
        async prefetchQuiz() {
          const d0 = get();
          if (!hasTopic(d0.context)) { if (d0.quiz.gen !== 'loading') set((d) => { d.quiz.gen = 'none'; }); return; }
          const key = ctxKey(d0.context, d0.settings);
          if (quizReusable(d0)) return;
          if (d0.quiz.gen === 'loading' && d0.quiz.ctxKey === key && d0.quiz.sources === sourcesKey(d0)) return;
          quizCtl?.abort();
          const ctl = (quizCtl = new AbortController());
          set((d) => { d.quiz = { ...freshQuiz(), ctxKey: key, sources: sourcesKey(d), gen: 'loading', forTopic: topicLabel(d.context) || 'your notes', step: d.quiz.step }; });
          try {
            await AI.ready();
            if (ctl !== quizCtl) return;
            if (!AI.available()) throw { code: 'not_configured' };
            if (typeof navigator !== 'undefined' && navigator.onLine === false) throw { code: 'offline' };
            const s = get();
            const tk = topicKey(s.context);
            const pages = quizPages(s);
            const material = pages ? await (await import('./ai/material')).materialFor(s.context.docId, pages[0], pages[1]) : undefined;
            const digest = s.context.docId ? (await import('./ai/digest')).useDigests.getState()[s.context.docId]?.data : undefined;
            if (ctl !== quizCtl) return;
            const qs = await AI.quiz({
              ctx: { ...s.context }, n: s.settings.questions, difficulty: s.settings.difficulty,
              weak: weakConcepts(s.stats, tk).map((c) => c.concept), asked: askedToday(s.asked, todayFor(s.settings)).slice(-30),
              ...(s.timer.session?.heard ? { heard: s.timer.session.heard.slice(-6000) } : {}),
              ...(material ? { material } : {}),
              ...(digest ? { digest: { summary: digest.summary, concepts: digest.concepts } } : {}),
            }, ctl.signal);
            if (ctl !== quizCtl) return;
            if (!qs.length) throw { code: 'invalid_json' };
            set((d) => { Object.assign(d.quiz, { questions: qs, gen: 'ready', madeOn: todayFor(d.settings), error: '' }); });
          } catch (e) {
            if (ctl !== quizCtl || isCancel(e)) return;
            set((d) => { d.quiz.gen = AI.available() ? 'failed' : 'off'; d.quiz.error = aiErrorText(e); d.aiStatus = AI.status(); });
          }
        },
        retryQuiz() { set((d) => { d.quiz.gen = 'none'; }); void get().prefetchQuiz(); },
        beginQuiz() {
          if (get().timer.phase !== 'quiz') return;
          set((d) => { d.quiz.step = 'question'; d.quiz.index = 0; d.quiz.answers = []; });
        },
        answer(i) {
          const { timer, quiz } = get();
          if (timer.phase !== 'quiz' || quiz.step !== 'question' || !quizReadyForTaking(quiz)) return;
          set((d) => {
            const q = d.quiz.questions[d.quiz.index];
            d.quiz.answers[d.quiz.index] = { chosen: i, correct: i === q.correctIndex };
            d.quiz.step = 'feedback';
          });
        },
        nextQ() {
          const Q = get().quiz;
          if (Q.step !== 'feedback') return;
          if (Q.index < Q.questions.length - 1) set((d) => { d.quiz.index++; d.quiz.step = 'question'; });
          else get().finishQuiz(false);
        },
        finishQuiz(early) {
          const d0 = get();
          const Q = d0.quiz;
          const items = Q.questions.flatMap((q, i) => {
            const a = Q.answers[i];
            return a ? [{ concept: q.concept, question: q.question, chosen: q.options[a.chosen], answer: q.options[q.correctIndex], correct: a.correct }] : [];
          });
          const score = items.filter((x) => x.correct).length;
          const total = items.length;
          set((d) => {
            if (total) { recordConcepts(d.stats, topicKey(d.context), items); addAsked(d.asked, items.map((x) => x.question), todayFor(d.settings)); }
            d.quiz.used = true; d.quiz.step = 'intro'; d.quiz.answers = [];
          });
          get().finishSession({ status: total === 0 ? 'skipped' : early && total < Q.questions.length ? 'partial' : 'done', score, total, items });
          const result = total ? { score, total, items } : null;
          get().startBreak(get().timer.breakKind, result, total ? 'quiz' : 'quiz-skipped');
          if (result) void get().generatePlan(result);
        },
        skipQuiz() {
          const { timer, quiz } = get();
          if (timer.phase !== 'quiz') return;
          if (quiz.step !== 'intro' && quiz.answers.some(Boolean)) { get().finishQuiz(true); return; }
          set((d) => { d.quiz.step = 'intro'; d.quiz.answers = []; });
          get().finishSession({ status: quiz.gen === 'ready' ? 'skipped' : quiz.gen === 'none' ? 'no-topic' : 'unavailable' });
          get().startBreak(get().timer.breakKind, null, 'quiz-skipped');
        },

        /* ---------- plan & day summary ---------- */
        async generatePlan(result) {
          planCtl?.abort();
          const ctl = (planCtl = new AbortController());
          const s = get();
          const tk = topicKey(s.context);
          const input = {
            ctx: { ...s.context }, result, studyMin: s.settings.studyMin,
            history: s.history.filter((h) => topicKey(h) === tk).slice(-8).map((h) => ({ date: h.date, studiedMin: h.studiedMin, score: h.quiz?.score ?? null, total: h.quiz?.total ?? 0 })),
            weak: weakConcepts(s.stats, tk, 6).map((c) => ({ concept: c.concept, missed: c.missed, seen: c.seen })),
          };
          set((d) => { d.plan = { status: 'loading', topic: topicLabel(d.context), applied: false, input }; });
          try {
            await AI.ready();
            if (!AI.available()) throw { code: 'not_configured' };
            const data = await AI.plan(input, ctl.signal);
            if (ctl !== planCtl) return;
            set((d) => { d.plan.data = data; d.plan.status = 'ready'; });
          } catch (e) {
            if (ctl !== planCtl || isCancel(e)) return;
            set((d) => { d.plan.status = 'failed'; d.plan.error = aiErrorText(e); });
          }
        },
        retryPlan() { const r = get().plan.input?.result; if (r) void get().generatePlan(r); },
        applyPlan() {
          const P = get().plan;
          if (P.status !== 'ready' || !P.data) return;
          const data = P.data;
          set((d) => { if (data.nextGoal) d.context.goal = data.nextGoal; d.plan.applied = true; });
          get().setStudyMin(data.suggestedMinutes);
          toast(`Plan applied: ${data.suggestedMinutes}-minute session, goal set`);
        },
        async summarizeDay() {
          const s = get();
          const day = todayFor(s.settings);
          const today = s.history.filter((h) => h.date === day);
          if (!today.length) return;
          dayCtl?.abort();
          const ctl = (dayCtl = new AbortController());
          set((d) => { d.day = { date: day, status: 'loading' }; });
          try {
            await AI.ready();
            if (!AI.available()) throw { code: 'not_configured' };
            const tks = new Set(today.map(topicKey));
            const weak = Object.values(s.stats).filter((c) => tks.has(c.topic) && c.missed > 0).sort((a, b) => b.missed - a.missed).slice(0, 6)
              .map((c) => ({ concept: c.concept, missed: c.missed, seen: c.seen }));
            const data = await AI.day({
              sessions: today.map((h) => ({
                time: timeOf(h.startedAt), topic: topicLabel(h) || 'Unlabeled', studiedMin: h.studiedMin,
                quiz: h.quiz?.total ? `${h.quiz.score}/${h.quiz.total}` : h.quiz?.status || 'none',
                missed: (h.quiz?.items || []).filter((x) => !x.correct).map((x) => x.concept),
              })),
              weak,
            }, ctl.signal);
            if (ctl !== dayCtl) return;
            set((d) => { d.day = { date: day, status: 'ready', data }; });
          } catch (e) {
            if (ctl !== dayCtl || isCancel(e)) return;
            set((d) => { d.day = { date: day, status: 'failed', error: aiErrorText(e) }; });
          }
        },

        /* ---------- tasks & data ---------- */
        addTask(text) { const t = text.trim(); if (t) set((d) => { d.tasks.push({ id: uid(), text: t, done: false }); }); },
        saveWeekly(week, data) {
          set((d) => {
            d.weekly[week] = data;
            const keep = Object.keys(d.weekly).sort().slice(-26);
            for (const k of Object.keys(d.weekly)) if (!keep.includes(k)) delete d.weekly[k];
          });
        },
        markWeekSeen(week) { set((d) => { if (week > d.weeklySeen) d.weeklySeen = week; }); },
        addTasks(texts, replace = false) {
          const items = texts.map((x) => x.trim().slice(0, 300)).filter(Boolean).map((text) => ({ id: uid(), text, done: false }));
          set((d) => { d.tasks = [...(replace ? [] : d.tasks), ...items]; });
        },
        toggleTask(id, done) { set((d) => { const t = d.tasks.find((x) => x.id === id); if (t) t.done = done; }); },
        deleteTask(id) { set((d) => { d.tasks = d.tasks.filter((x) => x.id !== id); }); },
        clearDone() { set((d) => { d.tasks = d.tasks.filter((x) => !x.done); }); },
        resetTasks() { set((d) => { d.tasks = []; }); },
        clearHistory() {
          set((d) => {
            d.history = []; d.stats = {}; d.asked = { date: '', items: [] };
            d.plan = { status: 'none' }; d.day = { date: '', status: 'none' };
            d.sync.pushed = {}; d.sync.clearPending = true; // the sync engine also clears the copy in your account
          });
          toast('History cleared');
        },
        mutate(fn) { set((d) => { fn(d); }); },
        setAccount(patch) { set((d) => { Object.assign(d.account, patch); }); },
        resetLocalData() {
          quizCtl?.abort(); planCtl?.abort(); dayCtl?.abort();
          set((d) => { Object.assign(d, initialData()); d.settings.timezone = detectTimeZone(); });
        },

        /* ---------- documents ---------- */
        addDoc(doc) {
          set((d) => {
            d.docs = [doc, ...d.docs.filter((x) => x.id !== doc.id)];
            pointAt(d, doc);
          });
          toast(`${doc.name} is ready: ${doc.pageCount} ${unitWord(doc, doc.pageCount)}`);
        },
        removeDoc(id) {
          set((d) => {
            d.docs = d.docs.filter((x) => x.id !== id);
            if (!d.sync.docsDeleted.includes(id)) d.sync.docsDeleted.push(id);
            delete d.sync.docsPushed[id];
            if (d.context.docId === id) Object.assign(d.context, { docId: '', docGoal: '', goalPage: 0, startPage: 1 });
          });
        },
        selectDoc(id) {
          set((d) => {
            const doc = d.docs.find((x) => x.id === id);
            if (!doc) { Object.assign(d.context, { docId: '', docGoal: '', goalPage: 0, startPage: 1 }); return; }
            pointAt(d, doc);
          });
        },
        setDocGoal(text, page) { set((d) => { d.context.docGoal = text; d.context.goalPage = Math.max(0, Math.round(page) || 0); }); },
        setStartPage(page) {
          set((d) => {
            const doc = d.docs.find((x) => x.id === d.context.docId);
            d.context.startPage = clamp(Math.round(page) || 1, 1, doc?.pageCount || 1);
            const s = d.timer.session;
            if (s && s.docId === d.context.docId && !(s.seen?.length)) s.startPage = d.context.startPage;
          });
        },
        addHeard(text) {
          const t = text.replace(/\s+/g, ' ').trim();
          if (!t) return;
          set((d) => {
            const s = d.timer.session;
            if (!s) return;
            s.heard = ((s.heard ? s.heard + ' ' : '') + t).slice(-20_000);
          });
        },
        recordProgress(page, title, source, conf) {
          let reached = 0;
          set((d) => {
            const s = d.timer.session;
            if (!s) return;
            const ev = { at: Date.now(), page, title: title.slice(0, 120), source, ...(conf !== undefined ? { conf: Math.round(conf * 100) / 100 } : {}) };
            const seen = s.seen ?? [];
            const last = seen[seen.length - 1];
            if (last && last.page === page && last.title === ev.title && ev.at - last.at < 60_000) return; // same slide, still on it
            s.seen = [...seen, ev].slice(-100);
            if (page > 0) {
              s.endPage = Math.max(s.endPage ?? 0, page);
              if (source === 'screen') s.progressSource = 'screen';
              else if (s.progressSource !== 'screen') s.progressSource = 'manual';
              if (s.goalPage && !s.goalMet && s.endPage >= s.goalPage) { s.goalMet = true; reached = s.goalPage; }
            }
          });
          if (reached) {
            const doc = get().docs.find((x) => x.id === get().timer.session?.docId);
            toast(`Goal reached: ${doc ? unitWord(doc, 1) : 'page'} ${reached}. Nice work.`);
          }
        },
        clearSeen(scope) {
          set((d) => {
            if (d.timer.session) d.timer.session.seen = [];
            if (scope === 'all') for (const h of d.history) if (h.seen?.length) h.seen = [];
          });
          toast(scope === 'all' ? 'Screen-tracking logs deleted' : 'Log deleted');
        },
        setReached(sessionId, page) {
          set((d) => {
            const live = d.timer.session?.id === sessionId ? d.timer.session : null;
            const rec = live ?? d.history.find((h) => h.id === sessionId);
            if (!rec?.docId) return;
            const doc = d.docs.find((x) => x.id === rec.docId);
            rec.endPage = clamp(Math.round(page), 1, doc?.pageCount || page);
            rec.progressSource = 'manual';
            rec.goalMet = rec.goalPage ? rec.endPage >= rec.goalPage : undefined;
            if (doc && !live) {
              // Recompute the document's furthest page from every session, so lowering a mistake works too.
              doc.furthest = Math.max(0, ...d.history.filter((h) => h.docId === doc.id).map((h) => h.endPage ?? 0));
              applyReached(d, doc, rec);
            }
          });
        },
      };
    }),
    {
      name: 'studybuddy.v1', // storage keys keep the app's first name, so nobody's saved data is lost
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Data => ({
        settings: s.settings, context: s.context, timer: s.timer, quiz: s.quiz, plan: s.plan, day: s.day,
        tasks: s.tasks, history: s.history, stats: s.stats, asked: s.asked, sync: s.sync, docs: s.docs,
        weekly: s.weekly, weeklySeen: s.weeklySeen,
      }),
      merge: (persisted, cur) => ({ ...cur, ...normalizeData(persisted as Partial<Data> | undefined) }),
    },
  ),
);
