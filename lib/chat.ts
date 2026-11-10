'use client';
/**
 * Chat between friends (migration 7). Messages aren't kept: the server only returns the last 24 hours and deletes
 * the rest. Like the rest of friends, it polls (no Realtime): unread counts every few seconds while the tab is
 * visible, and the open conversation faster.
 */
import { create } from 'zustand';
import { syncClient } from './sync';

export interface ChatMsg { id: string; mine: boolean; text: string; at: number; state?: 'sending' | 'failed' }
export interface Unread { n: number; lastId: string; lastText: string; lastAt: number }

interface ChatState {
  /** null = not asked yet; false = this site's database doesn't have chat yet (migration 7). */
  ready: boolean | null;
  /** The friend whose conversation is open ('' = closed). */
  open: string;
  messages: ChatMsg[];
  loading: boolean;
  unread: Record<string, Unread>;
  /** The newest message not yet announced: shown as a popup unless Do Not Disturb is on or that chat is open. */
  popup: { from: string; id: string; text: string } | null;
  error: string;
}

export const MAX_CHAT = 500;
export const useFriendChat = create<ChatState>(() => ({ ready: null, open: '', messages: [], loading: false, unread: {}, popup: null, error: '' }));
const set = (p: Partial<ChatState>) => useFriendChat.setState(p);
const missing = (e: { code?: string; message?: string } | null) => !!e && /PGRST202|42883|chat_unread|chat_with|send_chat/.test(`${e.code} ${e.message}`);

const announced = new Set<string>();
let poll: ReturnType<typeof setInterval> | undefined;
let localId = 0;

/** Total unread messages (a number, so it's safe as a Zustand selector). */
export const unreadTotal = (s: ChatState) => Object.values(s.unread).reduce((n, u) => n + u.n, 0);

/** Ask how many unread messages there are, per friend. A message not seen before becomes the popup. */
export async function refreshUnread() {
  const c = syncClient();
  if (!c || useFriendChat.getState().ready === false) return;
  const { data, error } = await c.sb.rpc('chat_unread');
  if (error) { if (missing(error)) set({ ready: false }); return; }
  const st = useFriendChat.getState();
  const unread: Record<string, Unread> = {};
  let popup = st.popup;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const from = String(r.from_id);
    if (from === st.open) continue; // being read right now
    const u: Unread = { n: Number(r.unread) || 0, lastId: String(r.last_id), lastText: String(r.last_text ?? ''), lastAt: Date.parse(String(r.last_at)) || 0 };
    unread[from] = u;
    if (!announced.has(u.lastId)) { announced.add(u.lastId); popup = { from, id: u.lastId, text: u.lastText }; }
  }
  if (popup && !unread[popup.from]) popup = null; // read somewhere else in the meantime
  set({ ready: true, unread, popup });
}

async function loadOpen() {
  const c = syncClient();
  const friend = useFriendChat.getState().open;
  if (!c || !friend) return;
  const { data, error } = await c.sb.rpc('chat_with', { p_friend: friend });
  if (useFriendChat.getState().open !== friend) return; // closed or switched while asking
  if (error) { set({ loading: false, error: missing(error) ? 'Chat isn\'t switched on for this site yet.' : 'Couldn\'t load the messages. Trying again…', ...(missing(error) ? { ready: false } : {}) }); return; }
  const server: ChatMsg[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), mine: !!r.mine, text: String(r.text), at: Date.parse(String(r.created_at)) || 0 }));
  // Keep messages still on their way (or that failed) under what the server has.
  const waiting = useFriendChat.getState().messages.filter((m) => m.state && !server.some((s) => s.mine && s.text === m.text && Math.abs(s.at - m.at) < 60_000));
  const rest = { ...useFriendChat.getState().unread };
  delete rest[friend];
  set({ messages: [...server, ...waiting], loading: false, error: '', unread: rest, ready: true });
}

/** Open the conversation with a friend (and mark their messages read). */
export function openChat(friendId: string) {
  clearInterval(poll);
  const st = useFriendChat.getState();
  set({ open: friendId, messages: [], loading: true, error: '', popup: st.popup?.from === friendId ? null : st.popup });
  void loadOpen();
  poll = setInterval(() => { if (document.visibilityState === 'visible') void loadOpen(); }, 3000);
}

export function closeChat() {
  clearInterval(poll);
  set({ open: '', messages: [], loading: false, error: '' });
}

export const dismissPopup = () => set({ popup: null });

/** Send a message to the friend whose chat is open. It shows at once and is confirmed by the next check. */
export async function sendChat(text: string) {
  const c = syncClient();
  const friend = useFriendChat.getState().open;
  const t = text.trim().slice(0, MAX_CHAT);
  if (!c || !friend || !t) return;
  const id = `local-${++localId}`;
  set({ messages: [...useFriendChat.getState().messages, { id, mine: true, text: t, at: Date.now(), state: 'sending' }], error: '' });
  const { data, error } = await c.sb.rpc('send_chat', { p_to: friend, p_text: t });
  if (!error && data === 'sent') { void loadOpen(); return; }
  const why = error ? (missing(error) ? 'Chat isn\'t switched on for this site yet.' : 'Couldn\'t send. Check your connection and try again.')
    : data === 'too_fast' ? 'That\'s a lot of messages at once. Wait a few seconds.'
      : data === 'not_friends' ? 'You can only message friends.' : 'Couldn\'t send that message.';
  set({ messages: useFriendChat.getState().messages.map((m) => (m.id === id ? { ...m, state: 'failed' as const } : m)), error: why });
}

export function resetChat() {
  clearInterval(poll);
  announced.clear();
  set({ ready: null, open: '', messages: [], loading: false, unread: {}, popup: null, error: '' });
}
