'use client';
/**
 * All of StudyBuddy's state and actions in one store. The timer is timestamp based:
 * remaining = endAt - now, so it stays right across refreshes and sleeping tabs.
 * Phase 1 persists to this browser's localStorage. Phase 2 adds account sync.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
  AiStatus, Asked, BreakKind, BreakReason, ConceptStat, DayState, PlanState, QuizOutcome, QuizResult,
  QuizState, SessionRecord, Settings, StudyContext, Task, TimerState, Tier,
} from './types';
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS, freshQuiz, freshTimer } from './defaults';
import { breakFor } from './breaks';
import { addAsked, askedToday, ctxKey, hasTopic, recordConcepts, topicKey, topicLabel, weakConcepts } from './context';
import { aiErrorText } from './quiz';
import { AI } from './ai-client';
import { Sound } from './sound';
import { MIN, clamp, mergeDeep, round1, timeOf, todayKey, uid } from './util';

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
}
interface Flash { msg: string; id: number }
interface Ui { toast: Flash | null; announce: Flash | null; aiStatus: AiStatus; booted: boolean }
interface EndOpts { quiet?: boolean; auto?: boolean }

interface Actions {
  boot: () => Promise<void>;
  showToast: (msg: string) => void;
  say: (msg: string) => void;
  // settings and context
  updateSettings: (fn: (s: Settings) => void) => void;
  setStudyMin: (m: number) => void;
  setLoop: (on: boolean) => void;
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
  toggleTask: (id: string, done: boolean) => void;
  deleteTask: (id: string) => void;
  clearDone: () => void;
  resetTasks: () => void;
  clearHistory: () => void;
}

export type Store = Data & Ui & Actions;

let quizCtl: AbortController | null = null;
let planCtl: AbortController | null = null;
let dayCtl: AbortController | null = null;
let flashId = 0;

const isCancel = (e: unknown) => (e as { code?: string })?.code === 'cancelled' || (e as { name?: string })?.name === 'AbortError';

export const remainingAt = (T: TimerState, now: number) => (T.status === 'running' ? Math.max(0, T.endAt - now) : T.remainingMs);

const quizReusable = (d: Data) =>
  d.quiz.gen === 'ready' && d.quiz.ctxKey === ctxKey(d.context, d.settings) && !d.quiz.used && d.quiz.madeOn === todayKey();
export const quizMatches = (d: Data) => d.quiz.gen === 'ready' && d.quiz.ctxKey === ctxKey(d.context, d.settings) && !d.quiz.used;
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
  };
}

function mergePersisted(p: Partial<Data> | undefined, cur: Store): Store {
  if (!p) return cur;
  const settings = mergeDeep(DEFAULT_SETTINGS, p.settings);
  const quiz: QuizState = { ...freshQuiz(), ...(p.quiz || {}) };
  if (quiz.gen === 'loading') quiz.gen = 'none'; // a reload dropped the request in flight
  const plan: PlanState = { status: 'none', ...(p.plan || {}) };
  if (plan.status === 'loading') { plan.status = 'failed'; plan.error = 'The plan was interrupted by a reload.'; }
  const day: DayState = { date: '', status: 'none', ...(p.day || {}) };
  if (day.status === 'loading') day.status = 'none';
  return {
    ...cur,
    settings,
    context: mergeDeep(DEFAULT_CONTEXT, p.context),
    timer: { ...freshTimer(settings), ...(p.timer || {}) },
    quiz, plan, day,
    tasks: p.tasks ?? [],
    history: p.history ?? [],
    stats: p.stats ?? {},
    asked: p.asked ?? { date: '', items: [] },
  };
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
            if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'studybuddy' });
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
        showToast: toast,
        say,

        async boot() {
          if (get().booted) return;
          set((d) => { d.booted = true; });
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
                id: uid(), date: todayKey(), startedAt: Date.now(), plannedMin: d.settings.studyMin,
                subject: d.context.subject, topic: d.context.topic, level: d.context.level, goal: d.context.goal,
              };
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
              : { id: uid(), date: todayKey(), startedAt: now - studiedMs, plannedMin: d.settings.studyMin, subject: '', topic: '', level: c.level, goal: '' };
            const s: SessionRecord = { ...base, endedAt: now, studiedMin: round1(studiedMs / MIN), subject: c.subject, topic: c.topic, level: c.level, goal: c.goal };
            T.session = s;
            const enough = studiedMs >= (s.plannedMin * MIN) / 2;
            T.countedCycle = enough;
            if (enough) T.cycleDone += 1;
            kind = enough && T.cycleDone >= d.settings.longEvery ? 'long' : 'short';
            T.breakKind = kind;
            next = reason === 'skip' ? 'skip' : !enough ? 'short' : 'quiz';
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
          if (!quizMatches(d) && !(d.quiz.gen === 'loading' && d.quiz.ctxKey === key) && !(d.quiz.gen === 'failed' && d.quiz.ctxKey === key)) void get().prefetchQuiz();
          say('Study session complete. Quiz time.');
        },
        finishSession(quiz) {
          set((d) => {
            const s = d.timer.session;
            if (!s) return;
            const rec: SessionRecord = { ...current(s), quiz, endedAt: s.endedAt || Date.now() };
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
          if (d0.quiz.gen === 'loading' && d0.quiz.ctxKey === key) return;
          quizCtl?.abort();
          const ctl = (quizCtl = new AbortController());
          set((d) => { d.quiz = { ...freshQuiz(), ctxKey: key, gen: 'loading', forTopic: topicLabel(d.context) || 'your notes', step: d.quiz.step }; });
          try {
            await AI.ready();
            if (ctl !== quizCtl) return;
            if (!AI.available()) throw { code: 'not_configured' };
            if (typeof navigator !== 'undefined' && navigator.onLine === false) throw { code: 'offline' };
            const s = get();
            const tk = topicKey(s.context);
            const qs = await AI.quiz({
              ctx: { ...s.context }, n: s.settings.questions, difficulty: s.settings.difficulty,
              weak: weakConcepts(s.stats, tk).map((c) => c.concept), asked: askedToday(s.asked).slice(-30),
            }, ctl.signal);
            if (ctl !== quizCtl) return;
            if (!qs.length) throw { code: 'invalid_json' };
            set((d) => { Object.assign(d.quiz, { questions: qs, gen: 'ready', madeOn: todayKey(), error: '' }); });
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
            if (total) { recordConcepts(d.stats, topicKey(d.context), items); addAsked(d.asked, items.map((x) => x.question)); }
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
          const today = s.history.filter((h) => h.date === todayKey());
          if (!today.length) return;
          dayCtl?.abort();
          const ctl = (dayCtl = new AbortController());
          set((d) => { d.day = { date: todayKey(), status: 'loading' }; });
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
            set((d) => { d.day = { date: todayKey(), status: 'ready', data }; });
          } catch (e) {
            if (ctl !== dayCtl || isCancel(e)) return;
            set((d) => { d.day = { date: todayKey(), status: 'failed', error: aiErrorText(e) }; });
          }
        },

        /* ---------- tasks & data ---------- */
        addTask(text) { const t = text.trim(); if (t) set((d) => { d.tasks.push({ id: uid(), text: t, done: false }); }); },
        toggleTask(id, done) { set((d) => { const t = d.tasks.find((x) => x.id === id); if (t) t.done = done; }); },
        deleteTask(id) { set((d) => { d.tasks = d.tasks.filter((x) => x.id !== id); }); },
        clearDone() { set((d) => { d.tasks = d.tasks.filter((x) => !x.done); }); },
        resetTasks() { set((d) => { d.tasks = []; }); },
        clearHistory() {
          set((d) => {
            d.history = []; d.stats = {}; d.asked = { date: '', items: [] };
            d.plan = { status: 'none' }; d.day = { date: '', status: 'none' };
          });
          toast('History cleared');
        },
      };
    }),
    {
      name: 'studybuddy.v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Data => ({
        settings: s.settings, context: s.context, timer: s.timer, quiz: s.quiz, plan: s.plan, day: s.day,
        tasks: s.tasks, history: s.history, stats: s.stats, asked: s.asked,
      }),
      merge: (persisted, cur) => mergePersisted(persisted as Partial<Data> | undefined, cur),
    },
  ),
);
