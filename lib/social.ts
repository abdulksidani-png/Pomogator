'use client';
/**
 * Friends: friend codes, requests, what each friend shares (online and what they're doing, music, stats),
 * and one support message per friend per day, delivered by the sender's study buddy.
 *
 * Everything goes through the functions in migration 4, which check the friendship and the sharing switches
 * on the server. Only signed-in accounts can have friends (not guests). The data is refreshed by polling
 * while the tab is visible: a heartbeat every minute (and right away when you start, pause or finish),
 * friends every 30 seconds, and the inbox with them.
 */
import { create } from 'zustand';
import { useStudy, remainingAt } from './store';
import { useSpotify } from './spotify';
import { syncClient } from './sync';
import { isCounted } from './sync-map';
import { computeStats } from './stats';
import { checkinStreak } from './checkins';
import { todayFor } from './dates';
import { MIN } from './util';
import type { MascotKind } from './types';
import { refreshInvites, resetCollab, resumeRoom } from './collab';

export type Doing = 'studying' | 'paused' | 'quiz' | 'break' | 'idle';
export interface Activity { state: Doing; sessionMin?: number; todayMin: number; together?: boolean }
export interface Music { title: string; artist: string }
export interface SharedStats {
  day: string; todayMin: number; todaySessions: number; todayAccuracy: number | null;
  studyStreak: number; bestStudyStreak: number; checkinStreak: number; bestCheckinStreak: number;
  totalMin: number; totalSessions: number; accuracy: number | null; badges: number[];
}
export interface Friend {
  id: string; name: string; buddy: MascotKind; relation: 'friend' | 'sent' | 'received';
  online: boolean; activity: Activity | null; music: Music | null; stats: SharedStats | null; supportedToday: boolean;
}
export interface MyProfile { code: string; name: string; buddy: MascotKind; shareOnline: boolean; shareMusic: boolean; shareStats: boolean }
export interface Support { id: string; fromName: string; buddy: MascotKind; text: string; at: string }

export type SocialStatus = 'off' | 'guest' | 'loading' | 'ready' | 'not_ready' | 'error';
interface SocialState {
  status: SocialStatus;
  me: MyProfile | null;
  friends: Friend[];
  inbox: Support[];
  /** Server clock − this device's clock (ms), from the heartbeat. */
  skew: number;
  error: string;
}

export const useSocial = create<SocialState>(() => ({ status: 'off', me: null, friends: [], inbox: [], skew: 0, error: '' }));
const set = (p: Partial<SocialState>) => useSocial.setState(p);

/** Ready-made support messages; a custom one can be written too. */
export const SUPPORT_LINES = [
  'You\'ve got this! 💪',
  'Proud of you for showing up today.',
  'One session at a time. You can do it!',
  'Sending you focus vibes ✨',
  'Don\'t forget to take a breather.',
  'Your hard work is going to pay off.',
  'I believe in you!',
  'Study hard, then treat yourself 🍦',
];

const BUDDIES: MascotKind[] = ['tomato', 'robot', 'gorilla', 'gator', 'panther'];
const buddyOf = (v: unknown): MascotKind => (BUDDIES.includes(v as MascotKind) ? (v as MascotKind) : 'gator');
const notReady = (e: { code?: string; message?: string } | null) => !!e && /PGRST202|42883|42P01|social_me|friends_overview/.test(`${e.code} ${e.message}`);

/* ------------------------------------------------------------------ what I share */

export function myActivity(): Activity {
  const s = useStudy.getState();
  const T = s.timer;
  const today = todayFor(s.settings);
  const done = s.history.filter((h) => h.date === today && isCounted(h)).reduce((n, h) => n + (h.studiedMin || 0), 0);
  let state: Doing = 'idle';
  let sessionMin: number | undefined;
  if (T.phase === 'quiz') state = 'quiz';
  else if (T.phase === 'break' && T.status !== 'idle') state = 'break';
  else if (T.phase === 'study' && T.status !== 'idle') {
    state = T.status === 'paused' ? 'paused' : 'studying';
    sessionMin = Math.max(0, Math.round((T.totalMs - remainingAt(T, Date.now())) / MIN));
  }
  return { state, ...(sessionMin !== undefined ? { sessionMin } : {}), todayMin: Math.round(done + (sessionMin ?? 0)), ...(s.collab ? { together: true } : {}) };
}

function myMusic(): Music | null {
  const p = useSpotify.getState().playback;
  return p && p.isPlaying && p.title ? { title: p.title.slice(0, 120), artist: p.artist.slice(0, 120) } : null;
}

export function myStats(): SharedStats {
  const s = useStudy.getState();
  const today = todayFor(s.settings);
  const freezes = s.settings.streakFreeze;
  const all = computeStats({ history: s.history, docs: s.docs, today, timezone: s.settings.timezone, dayCount: 1, freezes });
  const day = computeStats({ history: s.history, docs: s.docs, today, timezone: s.settings.timezone, from: today, dayCount: 1, freezes });
  const c = checkinStreak(s.checkins, today, freezes);
  return {
    day: today, todayMin: Math.round(day.studyMin), todaySessions: day.sessions, todayAccuracy: day.accuracy,
    studyStreak: all.streak.current, bestStudyStreak: all.streak.longest, checkinStreak: c.current, bestCheckinStreak: c.longest,
    totalMin: Math.round(all.studyMin), totalSessions: all.sessions, accuracy: all.accuracy,
    badges: Object.keys(s.badges).map(Number).sort((a, b) => a - b),
  };
}

/* ------------------------------------------------------------------ loading */

let timers: ReturnType<typeof setInterval>[] = [];
let forUser = '';
let lastBeat = '';

/** Start (or stop) friends for whoever is signed in. Called whenever the account changes. */
export function startSocial(status: string) {
  const c = syncClient();
  const user = status === 'user' && c ? c.userId : '';
  if (user === forUser && useSocial.getState().status !== 'error') return;
  stopSocial();
  forUser = user;
  if (!c) { set({ status: 'off' }); return; }
  if (status !== 'user') { set({ status: status === 'guest' ? 'guest' : 'off' }); return; }
  set({ status: 'loading', error: '' });
  void (async () => {
    if (!(await loadMe())) return;
    const visible = () => document.visibilityState === 'visible';
    timers = [
      setInterval(() => { if (visible()) void heartbeat(true); }, 60_000),
      setInterval(() => { if (visible()) { void refreshFriends(); void refreshInbox(); } }, 30_000),
      setInterval(() => { if (visible()) void refreshInvites(); }, 10_000),
      setInterval(() => void heartbeat(false), 5_000), // only sends when what I'm doing changed
    ];
    await Promise.allSettled([refreshFriends(), refreshInbox(), heartbeat(true), publishStats(), resumeRoom(), refreshInvites()]);
  })();
}

export function stopSocial() {
  timers.forEach(clearInterval);
  timers = [];
  forUser = '';
  lastBeat = '';
  resetCollab();
  set({ status: 'off', me: null, friends: [], inbox: [], error: '' });
}

async function loadMe(): Promise<boolean> {
  const c = syncClient();
  if (!c) return false;
  const s = useStudy.getState();
  // A first name from Google, never an email address; it can be changed in the friends dialog.
  const first = s.account.name && !s.account.name.includes('@') ? s.account.name.split(' ')[0] : null;
  const { data, error } = await c.sb.rpc('social_me', { p_name: first, p_buddy: s.settings.mascotKind });
  if (error) { set({ status: notReady(error) ? 'not_ready' : 'error', error: error.message }); return false; }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) { set({ status: 'error' }); return false; }
  set({
    status: 'ready',
    me: { code: String(row.code), name: String(row.name), buddy: buddyOf(row.buddy), shareOnline: !!row.share_online, shareMusic: !!row.share_music, shareStats: !!row.share_stats },
  });
  return true;
}

export async function refreshFriends() {
  const c = syncClient();
  if (!c || useSocial.getState().status !== 'ready') return;
  const { data, error } = await c.sb.rpc('friends_overview', { p_day: todayFor(useStudy.getState().settings) });
  if (error) return;
  set({
    friends: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.user_id), name: String(r.name || 'Friend'), buddy: buddyOf(r.buddy), relation: r.relation as Friend['relation'],
      online: !!r.online, activity: (r.activity as Activity) ?? null, music: (r.music as Music) ?? null,
      stats: (r.stats as SharedStats) ?? null, supportedToday: !!r.supported_today,
    })),
  });
}

export async function refreshInbox() {
  const c = syncClient();
  if (!c || useSocial.getState().status !== 'ready') return;
  const { data, error } = await c.sb.rpc('support_inbox');
  if (error) return;
  const seen = new Set(useSocial.getState().inbox.map((m) => m.id));
  const fresh = ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), fromName: String(r.from_name), buddy: buddyOf(r.buddy), text: String(r.text), at: String(r.created_at) }))
    .filter((m) => !seen.has(m.id));
  if (fresh.length) set({ inbox: [...useSocial.getState().inbox, ...fresh] });
}

/** Tell friends I'm here and what I'm doing. `force` sends even if nothing changed (the once-a-minute beat). */
export async function heartbeat(force: boolean) {
  const c = syncClient();
  const st = useSocial.getState();
  if (!c || st.status !== 'ready' || document.visibilityState !== 'visible') return;
  const activity = myActivity();
  const music = st.me?.shareMusic ? myMusic() : null;
  const sig = JSON.stringify([activity.state, activity.together, music?.title]);
  if (!force && sig === lastBeat) return;
  lastBeat = sig;
  const sent = Date.now();
  const { data, error } = await c.sb.rpc('heartbeat', { p_activity: activity, p_music: music });
  if (!error && typeof data === 'number') set({ skew: data - (sent + Date.now()) / 2 });
}

/** Share today's and overall numbers with friends (when sharing stats is on). */
export async function publishStats() {
  const c = syncClient();
  const st = useSocial.getState();
  if (!c || st.status !== 'ready' || !st.me) return;
  await c.sb.from('social_profiles').update({ stats: st.me.shareStats ? myStats() : null, updated_at: new Date().toISOString() }).eq('user_id', c.userId);
}

/* ------------------------------------------------------------------ actions */

export async function addFriend(code: string): Promise<string> {
  const c = syncClient();
  if (!c) return 'not_signed_in';
  const { data, error } = await c.sb.rpc('add_friend', { p_code: code });
  if (error) return 'error';
  await refreshFriends();
  return String(data);
}

export async function respondFriend(id: string, accept: boolean) {
  const c = syncClient();
  if (!c) return;
  await c.sb.rpc('respond_friend', { p_other: id, p_accept: accept });
  await refreshFriends();
}

export async function sendSupport(to: string, text: string): Promise<string> {
  const c = syncClient();
  if (!c) return 'error';
  const s = useStudy.getState();
  const { data, error } = await c.sb.rpc('send_support', { p_to: to, p_day: todayFor(s.settings), p_text: text.trim().slice(0, 140), p_buddy: s.settings.mascotKind });
  if (error) return 'error';
  await refreshFriends();
  return String(data);
}

/** Mark a support message seen (on every device), once it has been shown. */
export async function markSeen(id: string) {
  set({ inbox: useSocial.getState().inbox.filter((m) => m.id !== id) });
  const c = syncClient();
  if (c) await c.sb.from('support_messages').update({ seen_at: new Date().toISOString() }).eq('id', id);
}

export async function updateMe(patch: Partial<Pick<MyProfile, 'name' | 'shareOnline' | 'shareMusic' | 'shareStats'>>) {
  const c = syncClient();
  const me = useSocial.getState().me;
  if (!c || !me) return;
  const next = { ...me, ...patch, name: (patch.name ?? me.name).trim().slice(0, 40) || me.name };
  set({ me: next });
  await c.sb.from('social_profiles').update({
    name: next.name, share_online: next.shareOnline, share_music: next.shareMusic, share_stats: next.shareStats,
    stats: next.shareStats ? myStats() : null, updated_at: new Date().toISOString(),
  }).eq('user_id', c.userId);
  lastBeat = '';
  await heartbeat(true);
}

/** Keep my buddy on my friend profile in step with the one I picked. */
export async function syncBuddy(kind: MascotKind) {
  const c = syncClient();
  const me = useSocial.getState().me;
  if (!c || !me || me.buddy === kind) return;
  set({ me: { ...me, buddy: kind } });
  await c.sb.rpc('social_me', { p_name: null, p_buddy: kind });
}

/** Link that opens the site with the add-a-friend box filled in. */
export const inviteLink = (code: string) => `${location.origin}/?friend=${encodeURIComponent(code)}`;
