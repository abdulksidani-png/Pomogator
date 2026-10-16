'use client';
/**
 * Studying together: invites, the room you're in, and keeping your timer in step with the group's.
 *
 * The room's shared timer lives on the server (migration 4). Presses (start, pause, +5, finish, skip break)
 * write a new shared state; every device polls the room every 2 seconds and lines its own timer up with it,
 * using the server's clock so devices with clocks that are a little off still agree. The quiz still happens
 * after each session, but the break is the length agreed in the invite, for everyone.
 */
import { create } from 'zustand';
import { useStudy, setCollabCtl, fromTheRoom } from './store';
import { syncClient } from './sync';
import { useSocial } from './social';
import { effective, pressed, type Press } from './collab-core';
import { MIN } from './util';
import type { CollabMember, CollabRoom, MascotKind } from './types';

export interface Invite { roomId: string; hostName: string; hostBuddy: MascotKind; studyMin: number; breakMin: number; note: string; people: number }

export const useInvites = create<{ invites: Invite[] }>(() => ({ invites: [] }));

let skew = 0; // server clock − this device's clock
let poll: ReturnType<typeof setTimeout> | undefined;
let writing = 0;
const serverNow = () => Date.now() + skew;
const toLocal = (serverMs: number) => serverMs - skew;
const BUDDIES: MascotKind[] = ['tomato', 'gorilla', 'gator', 'panther', 'bulldog'];

function toRoom(j: Record<string, unknown>): CollabRoom & { ended: boolean } {
  return {
    id: String(j.id), host: String(j.host), studyMin: Number(j.studyMin), breakMin: Number(j.breakMin), note: String(j.note ?? ''),
    state: (j.state ?? {}) as CollabRoom['state'], v: Number(j.v) || 0, ended: !!j.ended,
    members: ((j.members ?? []) as Record<string, unknown>[]).map((m): CollabMember => ({
      id: String(m.id), name: String(m.name), buddy: BUDDIES.includes(m.buddy as MascotKind) ? (m.buddy as MascotKind) : 'gator',
      status: m.status === 'invited' ? 'invited' : 'joined',
    })),
  };
}

/** The room (mine, or a given one), with the server's clock. undefined = couldn't ask; null = not in one. */
async function fetchRoom(id?: string): Promise<(CollabRoom & { ended: boolean }) | null | undefined> {
  const c = syncClient();
  if (!c) return undefined;
  const sent = Date.now();
  const { data, error } = await c.sb.rpc('collab_room', id ? { p_room: id } : {});
  if (error) return undefined;
  if (!data) return null;
  const j = data as Record<string, unknown>;
  if (typeof j.now === 'number') skew = j.now - (sent + Date.now()) / 2;
  return toRoom(j);
}

const myName = () => useSocial.getState().me?.name || 'Someone';

/* ------------------------------------------------------------------ in the room */

const ctl = {
  press(p: Press) {
    const room = useStudy.getState().collab;
    if (!room) return;
    const next = pressed(room.state, p, serverNow(), room.studyMin, room.breakMin, myName());
    if (!next) return;
    // Show it right away; the server's answer (or a newer state from someone else) follows.
    useStudy.setState({ collab: { ...room, state: next } });
    align();
    void write(room, next);
  },
  sync() { align(); },
};

async function write(room: CollabRoom, next: CollabRoom['state']) {
  const c = syncClient();
  if (!c) return;
  writing++;
  try {
    const sent = Date.now();
    const { data, error } = await c.sb.rpc('set_collab_state', { p_room: room.id, p_state: next, p_expected_v: room.v });
    if (error || !data) return;
    const j = data as Record<string, unknown>;
    if (typeof j.now === 'number') skew = j.now - (sent + Date.now()) / 2;
    const r = toRoom(j);
    if (r.v === room.v) useStudy.getState().showToast('Someone in your group pressed at the same time; their change won.');
    useStudy.setState({ collab: r });
  } finally {
    writing--;
    align();
  }
}

function enter(room: CollabRoom) {
  useStudy.setState({ collab: room });
  setCollabCtl(ctl);
  align();
  schedule();
}

/** Stop being in the room on this device (the timer carries on by itself). */
function leaveHere() {
  clearTimeout(poll);
  setCollabCtl(null);
  useStudy.setState({ collab: null });
}

function schedule() {
  clearTimeout(poll);
  poll = setTimeout(() => void refreshRoom(), document.visibilityState === 'visible' ? 2000 : 8000);
}

async function refreshRoom() {
  const cur = useStudy.getState().collab;
  if (!cur) return;
  const r = await fetchRoom(cur.id);
  const now = useStudy.getState().collab;
  if (!now || now.id !== cur.id) return;
  if (r === null || r?.ended) {
    leaveHere();
    useStudy.getState().showToast('The group session ended.');
    return;
  }
  if (r && !writing) {
    useStudy.setState({ collab: r });
    align();
  }
  schedule();
}

/**
 * Line the local timer up with the room's. Safe to call any time; it changes only what differs.
 * Someone still taking their quiz finishes it first; their break then runs until the group's ends.
 */
function align() {
  const room = useStudy.getState().collab;
  if (!room) return;
  const e = effective(room.state, serverNow(), room.breakMin);
  const st = useStudy.getState();
  fromTheRoom(() => {
    let T = useStudy.getState().timer;
    const studyMs = room.studyMin * MIN;
    if (e.phase === 'study') {
      if (T.phase === 'quiz') return;
      if (T.phase === 'break') { st.endBreak('skip'); T = useStudy.getState().timer; }
      if (e.status === 'idle') {
        if (T.status !== 'idle' || T.totalMs !== studyMs) {
          st.mutate((d) => { Object.assign(d.timer, { status: 'idle', totalMs: studyMs, remainingMs: studyMs, endAt: 0, session: null }); });
        }
        return;
      }
      if (T.status === 'idle') {
        st.mutate((d) => { d.timer.totalMs = studyMs; d.timer.remainingMs = studyMs; });
        st.start(); // starts the session record (and today's check-in)
        T = useStudy.getState().timer;
      }
      if (e.status === 'running') {
        const endAt = toLocal(e.endAt ?? serverNow());
        if (T.status !== 'running' || Math.abs(T.endAt - endAt) > 1500) {
          st.mutate((d) => { Object.assign(d.timer, { status: 'running', endAt, totalMs: Math.max(studyMs, endAt - (d.timer.session?.startedAt ?? Date.now())) }); });
        }
      } else if (T.status !== 'paused' || Math.abs(T.remainingMs - (e.remainingMs ?? 0)) > 1500) {
        st.mutate((d) => { Object.assign(d.timer, { status: 'paused', remainingMs: e.remainingMs ?? 0, endAt: 0 }); });
      }
      return;
    }
    // The group is on its break.
    if (T.phase === 'study' && (T.session || T.status !== 'idle')) { st.endStudy('done'); T = useStudy.getState().timer; }
    if (T.phase === 'quiz') return;
    const breakMs = room.breakMin * MIN;
    const want = e.status === 'running'
      ? { status: 'running' as const, endAt: toLocal(e.endAt ?? serverNow()) }
      : { status: 'paused' as const, remainingMs: e.remainingMs ?? 0, endAt: 0 };
    const off = T.phase !== 'break' || T.status !== want.status
      || (want.status === 'running' ? Math.abs(T.endAt - want.endAt) > 1500 : Math.abs(T.remainingMs - (want.remainingMs ?? 0)) > 1500);
    if (off) {
      st.mutate((d) => {
        if (d.timer.phase !== 'break') Object.assign(d.timer, { phase: 'break', breakKind: 'short', breakReason: 'manual', lastResult: null, session: null });
        Object.assign(d.timer, { totalMs: breakMs, remainingMs: want.status === 'running' ? Math.max(0, want.endAt - Date.now()) : want.remainingMs, ...want });
      });
    }
  });
}

/* ------------------------------------------------------------------ joining and leaving */

/** After signing in (or a reload): back into the room you were in. */
export async function resumeRoom() {
  if (useStudy.getState().collab) return;
  const r = await fetchRoom();
  if (r && !r.ended) enter(r);
}

export async function refreshInvites() {
  const c = syncClient();
  if (!c) return;
  const { data, error } = await c.sb.rpc('collab_invites');
  if (error) return;
  useInvites.setState({
    invites: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      roomId: String(r.room_id), hostName: String(r.host_name), hostBuddy: BUDDIES.includes(r.host_buddy as MascotKind) ? (r.host_buddy as MascotKind) : 'gator',
      studyMin: Number(r.study_min), breakMin: Number(r.break_min), note: String(r.note ?? ''), people: Number(r.people) || 0,
    })),
  });
}

/** The local timer is in the middle of something (joining would end it). */
export const busy = () => { const T = useStudy.getState().timer; return T.phase === 'quiz' || T.status !== 'idle'; };

export async function createRoom(friends: string[], studyMin: number, breakMin: number, note: string): Promise<string> {
  const c = syncClient();
  if (!c) return 'error';
  const { data, error } = await c.sb.rpc('create_collab', { p_friends: friends, p_study: studyMin, p_break: breakMin, p_note: note.trim().slice(0, 140) });
  if (error || !data) return /not_friends|group_size/.test(error?.message ?? '') ? error!.message : 'error';
  const r = await fetchRoom(String(data));
  if (r) enter(r);
  return 'ok';
}

export async function answerInvite(roomId: string, accept: boolean): Promise<string> {
  const c = syncClient();
  if (!c) return 'error';
  const { data, error } = await c.sb.rpc('respond_collab', { p_room: roomId, p_accept: accept });
  useInvites.setState({ invites: useInvites.getState().invites.filter((i) => i.roomId !== roomId) });
  if (error) return 'error';
  if (data === 'joined') {
    if (useStudy.getState().collab) leaveHere();
    const r = await fetchRoom(roomId);
    if (r) enter(r);
  }
  return String(data);
}

export async function leaveRoom() {
  const room = useStudy.getState().collab;
  if (!room) return;
  leaveHere();
  const c = syncClient();
  if (c) await c.sb.rpc('leave_collab', { p_room: room.id });
  useStudy.getState().showToast('You left the group session. Your timer carries on by itself.');
}

/** Signed out or switched accounts: forget the room on this device. */
export function resetCollab() {
  if (useStudy.getState().collab) leaveHere();
  useInvites.setState({ invites: [] });
}

