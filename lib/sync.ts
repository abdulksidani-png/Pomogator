'use client';
/**
 * Cloud sync. The app keeps working from this device's copy (fast, works offline);
 * this module mirrors it to Supabase and pulls in changes made on other devices.
 *
 * - Settings, the study panel, the in-progress timer/quiz state and the to-do list are
 *   "slices", each stamped with the time it last changed. The newest copy wins.
 * - Finished sessions (and their quiz answers) are merged by id, so nothing is lost
 *   when two devices both studied.
 * - Guests are anonymous Supabase users. Signing in links Google or an email to that
 *   same user, so their data simply stays. If the login already belongs to another
 *   account, the guest's data is merged into that account instead.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase/client';
import { normalizeData, useStudy, type Data } from './store';
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS } from './defaults';
import { todayFor } from './dates';
import { mergeDeep } from './util';
import {
  attemptsFor, mergeHistory, rebuildAsked, rebuildStats, rowToSession, rowsToTasks, sessionHash, sessionToRow,
  type AttemptRow, type SessionRow, type TaskRow,
} from './sync-map';
import type { SliceVersions } from './types';

type Slice = keyof SliceVersions;
const SLICES: Slice[] = ['settings', 'context', 'app', 'tasks'];

let sb: SupabaseClient | null = null;
let userId = '';
let started = false;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing: Promise<void> | null = null;
let pushAgain = false;
let queue: Promise<unknown> = Promise.resolve();

/** Run auth handling one step at a time, in order. */
const serial = (fn: () => Promise<void>) => { queue = queue.then(fn, fn); return queue; };

const state = () => useStudy.getState();
const setAccount = (patch: Parameters<ReturnType<typeof state>['setAccount']>[0]) => state().setAccount(patch);

function friendly(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) return 'You\'re offline. Changes will sync when you reconnect.';
  return m;
}

function accountFrom(user: User) {
  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  return {
    status: user.is_anonymous ? ('guest' as const) : ('user' as const),
    userId: user.id,
    email: user.email || undefined,
    name: meta.full_name || meta.name || user.email || undefined,
    avatarUrl: meta.avatar_url || meta.picture || undefined,
  };
}

/* ------------------------------------------------------------------ */

export function startSync() {
  if (started) return;
  started = true;
  sb = getSupabase();
  if (!sb) { setAccount({ status: 'local' }); return; }
  setAccount({ status: 'connecting' });
  watchLocalChanges();

  sb.auth.onAuthStateChange((event, session) => {
    // Supabase asks that this callback not await other Supabase calls directly.
    setTimeout(() => {
      if (event === 'SIGNED_OUT') void serial(onSignedOut);
      else if (session?.user && event !== 'INITIAL_SESSION') void serial(() => adoptUser(session.user));
    }, 0);
  });

  void serial(init);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
    else void maybePull();
  });
  window.addEventListener('online', () => { void flush(); void maybePull(); });
  window.addEventListener('pagehide', () => { void flush(); });
}

async function init() {
  const { data } = await sb!.auth.getSession();
  let user = data.session?.user ?? null;
  if (!user) user = await startGuest();
  if (user) await adoptUser(user);
}

async function startGuest(): Promise<User | null> {
  const { data, error } = await sb!.auth.signInAnonymously();
  if (error || !data.user) {
    setAccount({ status: 'local', syncing: false, error: 'Guest saving to the cloud is off. Your progress stays on this device until you sign in.' });
    return null;
  }
  return data.user;
}

async function onSignedOut() {
  userId = '';
  state().resetLocalData();
  setAccount({ status: 'connecting', userId: undefined, email: undefined, name: undefined, avatarUrl: undefined, error: undefined });
  const user = await startGuest();
  if (user) await adoptUser(user);
}

/** Make `user` the owner of this device's data, merging or replacing as needed. */
async function adoptUser(user: User) {
  const info = accountFrom(user);
  if (user.id === userId) { // same person, maybe just upgraded from guest
    setAccount(info);
    if (!user.is_anonymous) state().mutate((d) => { d.sync.ownerAnon = false; });
    return;
  }
  const { ownerId, ownerAnon } = state().sync;
  // Data on this device that belongs to a different real account must not leak into this one.
  const replace = !!ownerId && ownerId !== user.id && !ownerAnon;
  const adopt = !ownerId || (ownerId !== user.id && ownerAnon);
  if (replace) state().resetLocalData();
  userId = user.id;
  state().mutate((d) => {
    d.sync.ownerId = user.id;
    d.sync.ownerAnon = !!user.is_anonymous;
    if (adopt || replace) { d.sync.acked = { settings: 0, context: 0, app: 0, tasks: 0 }; d.sync.pushed = {}; }
    if (!d.settings.displayName && info.name && info.name !== info.email) d.settings.displayName = info.name;
  });
  setAccount({ ...info, syncing: true, error: undefined });
  try {
    await pull({ adopt });
    await push();
  } catch (e) {
    setAccount({ syncing: false, error: friendly(e) });
  }
}

/* ------------------------------------------------------------------ */

function watchLocalChanges() {
  useStudy.subscribe((s, prev) => {
    if (applyingRemote || !userId) return;
    const now = Date.now();
    const bump: Partial<SliceVersions> = {};
    if (s.settings !== prev.settings) bump.settings = now;
    if (s.context !== prev.context) bump.context = now;
    if (s.timer !== prev.timer || s.quiz !== prev.quiz || s.plan !== prev.plan || s.day !== prev.day || s.asked !== prev.asked) bump.app = now;
    if (s.tasks !== prev.tasks) bump.tasks = now;
    const historyChanged = s.history !== prev.history || s.sync.clearPending !== prev.sync.clearPending;
    if (Object.keys(bump).length) {
      applyingRemote = true;
      try { s.mutate((d) => { Object.assign(d.sync.v, bump); }); } finally { applyingRemote = false; }
    }
    if (Object.keys(bump).length || historyChanged) schedulePush();
  });
}

function schedulePush(delay = 1200) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void push(); }, delay);
}

/** Send anything not yet saved, right now. */
export async function flush() {
  clearTimeout(pushTimer);
  await push();
}

const appStateOf = (s: Data) => ({ timer: s.timer, quiz: s.quiz, plan: s.plan, day: s.day, asked: s.asked });

async function push(): Promise<void> {
  if (!sb || !userId) return;
  if (pushing) { pushAgain = true; return pushing; }
  pushing = (async () => {
    const s = state();
    const { v, acked } = s.sync;
    const sent: Partial<SliceVersions> = {};
    setAccount({ syncing: true });
    try {
      if (s.sync.clearPending) {
        const { error } = await sb!.from('study_sessions').delete().eq('user_id', userId);
        if (error) throw error;
        state().mutate((d) => { d.sync.clearPending = false; d.sync.pushed = {}; });
      }

      const patch: Record<string, unknown> = {};
      if (v.settings > acked.settings) {
        Object.assign(patch, {
          settings: s.settings, settings_v: v.settings,
          display_name: s.settings.displayName.slice(0, 80), timezone: s.settings.timezone || 'UTC',
          week_start: s.settings.weekStart === 0 ? 0 : 1, rollover_hour: Math.min(6, Math.max(0, s.settings.rollover)),
          streak_freeze: s.settings.streakFreeze,
        });
        sent.settings = v.settings;
      }
      if (v.context > acked.context) { patch.context = s.context; patch.context_v = v.context; sent.context = v.context; }
      if (v.app > acked.app) { patch.app_state = appStateOf(s); patch.app_state_v = v.app; sent.app = v.app; }
      if (Object.keys(patch).length) {
        const { error } = await sb!.from('profiles').upsert({ id: userId, ...patch });
        if (error) throw error;
      }
      if (v.tasks > acked.tasks) {
        const { error } = await sb!.rpc('sync_tasks', { items: s.tasks.map((t) => ({ id: t.id, text: t.text, done: t.done })), version: v.tasks });
        if (error) throw error;
        sent.tasks = v.tasks;
      }

      const changed = s.history.filter((h) => h.endedAt && s.sync.pushed[h.id] !== sessionHash(h));
      for (let i = 0; i < changed.length; i += 100) {
        const batch = changed.slice(i, i + 100);
        const { error } = await sb!.from('study_sessions').upsert(batch.map((h) => sessionToRow(h, userId)), { onConflict: 'user_id,id' });
        if (error) throw error;
        const attempts = batch.flatMap((h) => attemptsFor(h, userId));
        if (attempts.length) {
          const { error: e2 } = await sb!.from('quiz_attempts').upsert(attempts, { onConflict: 'user_id,id' });
          if (e2) throw e2;
        }
      }

      applyingRemote = true;
      try {
        state().mutate((d) => {
          for (const k of SLICES) if (sent[k] !== undefined) d.sync.acked[k] = Math.max(d.sync.acked[k], sent[k]!);
          for (const h of changed) d.sync.pushed[h.id] = sessionHash(h);
        });
      } finally { applyingRemote = false; }
      setAccount({ syncing: false, error: undefined, lastSynced: Date.now() });
    } catch (e) {
      setAccount({ syncing: false, error: friendly(e) });
      schedulePush(15_000); // try again later
    }
  })();
  try { await pushing; } finally {
    pushing = null;
    if (pushAgain) { pushAgain = false; schedulePush(300); }
  }
}

/* ------------------------------------------------------------------ */

interface ProfileRow {
  settings: unknown; context: unknown; app_state: Partial<Data> | null;
  settings_v: number; context_v: number; app_state_v: number; tasks_v: number;
}

async function maybePull() {
  if (!sb || !userId) return;
  if (Date.now() - state().sync.lastPull < 30_000) return;
  try { await pull(); await push(); } catch (e) { setAccount({ error: friendly(e) }); }
}

/**
 * Bring in whatever other devices saved since we last looked.
 * `adopt`: this device's data is joining the account (a guest signing in), so to-do
 * lists are combined instead of the newer one replacing the older.
 */
async function pull({ adopt = false }: { adopt?: boolean } = {}) {
  if (!sb || !userId) return;
  const [p, t, ss, aa] = await Promise.all([
    sb.from('profiles').select('settings,context,app_state,settings_v,context_v,app_state_v,tasks_v').eq('id', userId).maybeSingle(),
    sb.from('tasks').select('id,text,done,position').order('position'),
    sb.from('study_sessions').select('*').order('started_at', { ascending: false }).limit(400),
    sb.from('quiz_attempts').select('user_id,id,session_id,topic_key,concept,question,chosen,answer,correct,created_at').order('created_at', { ascending: false }).limit(1500),
  ]);
  for (const r of [p, t, ss, aa]) if (r.error) throw r.error;

  const prof = p.data as ProfileRow | null;
  const bySession = new Map<string, AttemptRow[]>();
  for (const a of (aa.data ?? []) as AttemptRow[]) {
    const list = bySession.get(a.session_id) ?? [];
    list.push(a); bySession.set(a.session_id, list);
  }
  const remote = ((ss.data ?? []) as SessionRow[]).map((r) => rowToSession(r, bySession.get(r.id) ?? []));
  const local = state();
  const history = local.sync.clearPending ? local.history : mergeHistory(local.history, remote);

  applyingRemote = true;
  try {
    state().mutate((d) => {
      if (prof) {
        const sv = { settings: Number(prof.settings_v), context: Number(prof.context_v), app: Number(prof.app_state_v), tasks: Number(prof.tasks_v) };
        if (sv.settings > d.sync.v.settings) d.settings = mergeDeep(DEFAULT_SETTINGS, prof.settings);
        if (sv.context > d.sync.v.context) d.context = mergeDeep(DEFAULT_CONTEXT, prof.context);
        if (sv.app > d.sync.v.app && prof.app_state) {
          const a = normalizeData({ ...prof.app_state, settings: d.settings });
          d.timer = a.timer; d.quiz = a.quiz; d.plan = a.plan; d.day = a.day; d.asked = a.asked;
        }
        const serverTasks = rowsToTasks((t.data ?? []) as TaskRow[]);
        if (adopt && serverTasks.length && d.tasks.length) {
          const ids = new Set(serverTasks.map((x) => x.id));
          const extra = d.tasks.filter((x) => !ids.has(x.id)).map((x) => ({ ...x }));
          if (extra.length) { d.tasks = [...serverTasks, ...extra]; d.sync.v.tasks = Math.max(Date.now(), sv.tasks + 1); }
          else { d.tasks = serverTasks; d.sync.v.tasks = sv.tasks; }
        } else if (sv.tasks > d.sync.v.tasks) d.tasks = serverTasks;
        for (const k of SLICES) {
          if (sv[k] > d.sync.v[k]) d.sync.v[k] = sv[k];
          if (sv[k] === d.sync.v[k]) d.sync.acked[k] = Math.max(d.sync.acked[k], sv[k]);
        }
      }
      if (!d.sync.clearPending) {
        d.history = history;
        d.stats = rebuildStats(history);
        d.asked = rebuildAsked(history, d.asked, todayFor(d.settings));
        for (const r of remote) d.sync.pushed[r.id] = sessionHash(r);
      }
      d.sync.lastPull = Date.now();
    });
  } finally { applyingRemote = false; }
}

/* ------------------------------------------------------------------ */

export async function signOut() {
  if (!sb) return;
  await flush();
  setAccount({ syncing: true });
  await sb.auth.signOut();
}

export const syncInternals = { pull, push };
