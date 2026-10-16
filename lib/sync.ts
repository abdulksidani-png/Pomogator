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
import { cleanBadges, cleanDates, mergeBadges, mergeDates } from './checkins';
import { cleanOwned } from './cosmetics';
import {
  attemptsFor, docHash, docToRow, eventsFor, mergeHistory, rebuildAsked, rebuildStats, rowToDoc, rowToSession, rowsToTasks,
  sessionHash, sessionToRow, type AttemptRow, type DocRow, type EventRow, type SessionRow, type TaskRow,
} from './sync-map';
import type { DocMeta, DocPage, SliceVersions } from './types';
import { idb } from './docs/idb';

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
/** The account's database is missing the documents update (part 2); sync the rest anyway. */
let legacySchema = false;

const SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST200']);
function isSchemaError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? '';
  return SCHEMA_CODES.has(code) || /does not exist|Could not find the .* (column|table)/i.test((e as { message?: string })?.message ?? '');
}
function noteLegacy() {
  if (legacySchema) return;
  legacySchema = true;
  setAccount({ notice: 'Documents aren\'t syncing yet: run the second database update (see the README, step B).' });
}
const DOC_COLS = ['document_id', 'start_page', 'end_page', 'goal_page', 'goal_met', 'progress_source'] as const;
const withoutDocCols = (r: SessionRow): SessionRow => { const c: Record<string, unknown> = { ...r }; for (const k of DOC_COLS) delete c[k]; return c as unknown as SessionRow; };

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
  if (user) {
    // Ask the server: the saved copy can be stale (e.g. a guest who just confirmed their email).
    const fresh = await sb!.auth.getUser().catch(() => null);
    if (fresh?.data.user) {
      if (user.is_anonymous && !fresh.data.user.is_anonymous) void sb!.auth.refreshSession().catch(() => undefined);
      user = fresh.data.user;
    }
  }
  if (!user) user = await startGuest();
  if (user) await adoptUser(user);
}

/** Re-check the account, e.g. after an email link was opened in another tab. */
export async function recheckAccount() {
  if (!sb) return;
  const { data } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  if (data.user) { await sb.auth.refreshSession().catch(() => undefined); await serial(() => adoptUser(data.user!)); }
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
  await idb.clearPrefix('doc:'); // documents belonged to the signed-out account
  await idb.clearPrefix('digest:');
  setAccount({ status: 'connecting', userId: undefined, email: undefined, name: undefined, avatarUrl: undefined, error: undefined });
  const user = await startGuest();
  if (user) await adoptUser(user);
}

/** Make `user` the owner of this device's data, merging or replacing as needed. */
async function adoptUser(user: User) {
  const info = accountFrom(user);
  if (user.id === userId) { // same person, maybe just upgraded from guest
    setAccount({ ...info, ...(user.is_anonymous ? {} : { pendingEmail: undefined }) });
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
    if (adopt || replace) { d.sync.acked = { settings: 0, context: 0, app: 0, tasks: 0 }; d.sync.pushed = {}; d.sync.docsPushed = {}; }
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
    // A change must always count as newer than anything this device has already seen,
    // even if another device's clock runs ahead of this one.
    const next = (k: Slice) => Math.max(Date.now(), s.sync.v[k] + 1, s.sync.acked[k] + 1);
    const bump: Partial<SliceVersions> = {};
    if (s.settings !== prev.settings) bump.settings = next('settings');
    if (s.context !== prev.context) bump.context = next('context');
    if (s.timer !== prev.timer || s.quiz !== prev.quiz || s.plan !== prev.plan || s.day !== prev.day || s.asked !== prev.asked || s.weekly !== prev.weekly || s.weeklySeen !== prev.weeklySeen
      || s.checkins !== prev.checkins || s.celebrated !== prev.celebrated || s.badges !== prev.badges || s.tour !== prev.tour
      || s.owned !== prev.owned || s.pointsBank !== prev.pointsBank || s.gifts !== prev.gifts) bump.app = next('app');
    if (s.tasks !== prev.tasks) bump.tasks = next('tasks');
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

const appStateOf = (s: Data) => ({
  timer: s.timer, quiz: s.quiz, plan: s.plan, day: s.day, asked: s.asked, weekly: s.weekly, weeklySeen: s.weeklySeen,
  checkins: s.checkins, celebrated: s.celebrated, badges: s.badges, tour: s.tour, owned: s.owned, pointsBank: s.pointsBank, gifts: s.gifts,
});

async function push(): Promise<void> {
  if (!sb || !userId || deleting) return;
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

      // Documents: metadata whenever it changes, pages the first time.
      const docsSent: Record<string, string> = {};
      let docsDeletedSent: string[] = [];
      if (!legacySchema) {
        try {
          for (const id of s.sync.docsDeleted) {
            const { error } = await sb!.from('documents').delete().eq('user_id', userId).eq('id', id);
            if (error) throw error;
          }
          docsDeletedSent = s.sync.docsDeleted;
          for (const doc of s.docs.filter((d) => s.sync.docsPushed[d.id] !== docHash(d))) {
            const { error } = await sb!.from('documents').upsert(docToRow(doc, userId), { onConflict: 'user_id,id' });
            if (error) throw error;
            if (!(doc.id in s.sync.docsPushed)) await pushPages(doc);
            docsSent[doc.id] = docHash(doc);
          }
        } catch (e) { if (isSchemaError(e)) noteLegacy(); else throw e; }
      }

      const changed = s.history.filter((h) => h.endedAt && s.sync.pushed[h.id] !== sessionHash(h));
      for (let i = 0; i < changed.length; i += 100) {
        const batch = changed.slice(i, i + 100);
        const rows = batch.map((h) => sessionToRow(h, userId));
        let { error } = await sb!.from('study_sessions').upsert(legacySchema ? rows.map(withoutDocCols) : rows, { onConflict: 'user_id,id' });
        if (error && !legacySchema && isSchemaError(error)) {
          noteLegacy();
          ({ error } = await sb!.from('study_sessions').upsert(rows.map(withoutDocCols), { onConflict: 'user_id,id' }));
        }
        if (error) throw error;
        const attempts = batch.flatMap((h) => attemptsFor(h, userId));
        if (attempts.length) {
          const { error: e2 } = await sb!.from('quiz_attempts').upsert(attempts, { onConflict: 'user_id,id' });
          if (e2) throw e2;
        }
        // The slides-seen log is replaced as a whole, so deleting it here deletes it there.
        if (!legacySchema) {
          const ids = batch.map((h) => h.id);
          const { error: e3 } = await sb!.from('progress_events').delete().eq('user_id', userId).in('session_id', ids);
          const events = batch.flatMap((h) => eventsFor(h, userId));
          const e4 = !e3 && events.length ? (await sb!.from('progress_events').insert(events)).error : null;
          const bad = e3 || e4;
          if (bad) { if (isSchemaError(bad)) noteLegacy(); else throw bad; }
        }
      }

      applyingRemote = true;
      try {
        state().mutate((d) => {
          for (const k of SLICES) if (sent[k] !== undefined) d.sync.acked[k] = Math.max(d.sync.acked[k], sent[k]!);
          for (const h of changed) d.sync.pushed[h.id] = sessionHash(h);
          for (const [id, h] of Object.entries(docsSent)) d.sync.docsPushed[id] = h;
          d.sync.docsDeleted = d.sync.docsDeleted.filter((id) => !docsDeletedSent.includes(id));
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
  let pushAfter = false;
  const [p, t, ss, aa, ev, dd] = await Promise.all([
    sb.from('profiles').select('settings,context,app_state,settings_v,context_v,app_state_v,tasks_v').eq('id', userId).maybeSingle(),
    sb.from('tasks').select('id,text,done,position').order('position'),
    sb.from('study_sessions').select('*').order('started_at', { ascending: false }).limit(400),
    sb.from('quiz_attempts').select('user_id,id,session_id,topic_key,concept,question,chosen,answer,correct,created_at').order('created_at', { ascending: false }).limit(1500),
    sb.from('progress_events').select('user_id,id,session_id,at,page_index,title,source,confidence').order('at', { ascending: false }).limit(3000),
    sb.from('documents').select('user_id,id,name,kind,size_bytes,page_count,titles,furthest_page,storage_path,created_at'),
  ]);
  for (const r of [p, t, ss, aa]) if (r.error) throw r.error;
  // Missing documents tables (part 2 not run yet) just mean "no documents".
  for (const r of [ev, dd]) if (r.error) { if (isSchemaError(r.error)) noteLegacy(); else throw r.error; }

  const prof = p.data as ProfileRow | null;
  const bySession = new Map<string, AttemptRow[]>();
  for (const a of (aa.data ?? []) as AttemptRow[]) {
    const list = bySession.get(a.session_id) ?? [];
    list.push(a); bySession.set(a.session_id, list);
  }
  const eventsBy = new Map<string, EventRow[]>();
  for (const e of (ev.data ?? []) as EventRow[]) {
    const list = eventsBy.get(e.session_id) ?? [];
    list.push(e); eventsBy.set(e.session_id, list);
  }
  const remote = ((ss.data ?? []) as SessionRow[]).map((r) => rowToSession(r, bySession.get(r.id) ?? [], eventsBy.get(r.id) ?? []));
  const remoteDocs = ((dd.data ?? []) as DocRow[]).map(rowToDoc);
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
          // Weekly summaries from either device are kept (the newer copy of a week wins).
          for (const [k, w] of Object.entries(a.weekly)) if (!d.weekly[k] || w.at > d.weekly[k].at) d.weekly[k] = w;
          if (a.weeklySeen > d.weeklySeen) d.weeklySeen = a.weeklySeen;
        }
        // Check-ins, badges and the celebration day are combined whichever copy is newer, so no device's check-in is lost
        // and the celebration shows once per day across devices. If this device knew something the server didn't, send it.
        if (prof.app_state) {
          const r = { checkins: cleanDates(prof.app_state.checkins), badges: cleanBadges(prof.app_state.badges), celebrated: typeof prof.app_state.celebrated === 'string' ? prof.app_state.celebrated : '' };
          const checkins = mergeDates(d.checkins, r.checkins);
          const badges = mergeBadges(d.badges, r.badges);
          const celebrated = r.celebrated > d.celebrated ? r.celebrated : d.celebrated;
          // What was bought is combined too (a purchase is never undone), and the larger points bank wins.
          const rOwned = cleanOwned(prof.app_state.owned), rBank = Math.max(0, Math.round(Number(prof.app_state.pointsBank) || 0));
          const owned = cleanOwned([...d.owned, ...rOwned]);
          const rGifts = cleanOwned(prof.app_state.gifts), gifts = cleanOwned([...d.gifts, ...rGifts]);
          const bank = Math.max(d.pointsBank, rBank);
          const localExtra = checkins.length > r.checkins.length || Object.keys(badges).some((k) => badges[k] !== r.badges[k]) || celebrated !== r.celebrated
            || owned.length > rOwned.length || bank > rBank || gifts.length > rGifts.length;
          if (owned.length !== d.owned.length) d.owned = owned;
          if (gifts.length !== d.gifts.length) d.gifts = gifts;
          if (bank !== d.pointsBank) d.pointsBank = bank;
          if (checkins.length !== d.checkins.length) d.checkins = checkins;
          if (Object.keys(badges).some((k) => badges[k] !== d.badges[k])) d.badges = badges;
          if (celebrated !== d.celebrated) d.celebrated = celebrated;
          if (!d.tour && typeof prof.app_state.tour === 'string' && prof.app_state.tour) d.tour = prof.app_state.tour; // seen on another device
          if (localExtra) { d.sync.v.app = Math.max(Date.now(), sv.app + 1, d.sync.v.app); pushAfter = true; }
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
      // Documents: union, furthest page = the higher of the two; drop ones deleted on another device.
      const remoteIds = new Set(remoteDocs.map((x) => x.id));
      const merged: DocMeta[] = d.docs
        .filter((x) => remoteIds.has(x.id) || !(x.id in d.sync.docsPushed))
        .map((x) => ({ ...x }));
      for (const r of remoteDocs) {
        if (d.sync.docsDeleted.includes(r.id)) continue;
        const l = merged.find((x) => x.id === r.id);
        if (l) { l.furthest = Math.max(l.furthest, r.furthest); if (!l.storagePath && r.storagePath) l.storagePath = r.storagePath; }
        else merged.push(r);
        d.sync.docsPushed[r.id] = docHash(r);
      }
      for (const id of Object.keys(d.sync.docsPushed)) if (!remoteIds.has(id) && !merged.some((x) => x.id === id)) delete d.sync.docsPushed[id];
      d.docs = merged.sort((a, b) => b.createdAt - a.createdAt);
      if (d.context.docId && !d.docs.some((x) => x.id === d.context.docId)) Object.assign(d.context, { docId: '', docGoal: '', goalPage: 0, startPage: 1 });
      d.sync.lastPull = Date.now();
    });
  } finally { applyingRemote = false; }
  if (pushAfter) schedulePush(300);
}

/** Bring in other devices' changes now (used before showing the daily celebration). Never throws. */
export async function pullNow(): Promise<void> {
  if (!sb || !userId) return;
  try { await pull(); } catch { /* offline: decide with what this device knows */ }
}

/* ------------------------------------------------------------------ */

/** The signed-in Supabase client, for features with their own tables (friends, studying together). */
export function syncClient(): { sb: SupabaseClient; userId: string } | null {
  return sb && userId ? { sb, userId } : null;
}

/**
 * Delete the account (or guest) and everything in it: uploaded files first (through Storage), then every row
 * (`delete_my_account()` in migration 4 removes the user, and the tables cascade). This device is then wiped
 * and starts again as a new guest. Without Supabase, it only wipes this device.
 */
export async function deleteAccount(): Promise<'deleted' | 'not_ready' | 'failed'> {
  if (sb && userId) {
    clearTimeout(pushTimer);
    deleting = true;
    try {
      const paths = state().docs.map((d) => d.storagePath).filter((x): x is string => !!x);
      if (paths.length) await sb.storage.from('documents').remove(paths).catch(() => undefined);
      const { error } = await sb.rpc('delete_my_account');
      if (error) {
        deleting = false;
        return /delete_my_account|PGRST202|42883/.test(`${error.code} ${error.message}`) ? 'not_ready' : 'failed';
      }
      await sb.auth.signOut({ scope: 'local' }); // → onSignedOut: wipes this device and starts a new guest
    } catch {
      deleting = false;
      return 'failed';
    }
    deleting = false;
  } else {
    state().resetLocalData();
    await idb.clearPrefix('doc:');
    await idb.clearPrefix('digest:');
  }
  return 'deleted';
}
let deleting = false;

export async function signOut() {
  if (!sb) return;
  await flush();
  setAccount({ syncing: true });
  await sb.auth.signOut();
}

export const syncInternals = { pull, push };

/* ------------------------------------------------------------------ */
/* Documents                                                            */

async function pushPages(doc: DocMeta) {
  const pages = await idb.get<DocPage[]>(`doc:${doc.id}`);
  if (!pages?.length) return;
  for (let i = 0; i < pages.length; i += 200) {
    const rows = pages.slice(i, i + 200).map((p) => ({
      user_id: userId, document_id: doc.id, page_index: p.index, title: p.title.slice(0, 120), text: p.text.slice(0, 20_000),
    }));
    const { error } = await sb!.from('document_pages').upsert(rows, { onConflict: 'user_id,document_id,page_index' });
    if (error) throw error;
  }
}

/** Keep the original file in the account's private storage. Returns its path, or undefined. */
export async function uploadDocFile(docId: string, file: File): Promise<string | undefined> {
  if (!sb || !userId) return undefined;
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'document';
  const path = `${userId}/${docId}/${safe}`;
  const { error } = await sb.storage.from('documents').upload(path, file, { upsert: true, contentType: file.type || undefined });
  return error ? undefined : path;
}

export async function deleteDocFiles(paths: string[]) {
  if (!sb || !userId || !paths.length) return;
  await sb.storage.from('documents').remove(paths);
}

/** A temporary link to download the original file. */
export async function docDownloadUrl(path: string): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.storage.from('documents').createSignedUrl(path, 300, { download: true });
  return data?.signedUrl ?? null;
}

/** Pages of a document uploaded on another device. */
export async function fetchDocPages(docId: string): Promise<DocPage[]> {
  if (!sb || !userId) return [];
  const { data, error } = await sb.from('document_pages').select('page_index,title,text').eq('document_id', docId).order('page_index');
  if (error) throw error;
  return ((data ?? []) as { page_index: number; title: string; text: string }[]).map((r) => ({ index: r.page_index, title: r.title, text: r.text }));
}
