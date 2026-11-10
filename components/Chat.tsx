'use client';
/**
 * Chat with a friend: a side panel with the last 24 hours of messages, a popup when a message arrives, and the
 * Do Not Disturb switch that mutes those popups (and study invites) while friends see a small moon by your name.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { MAX_CHAT, closeChat, dismissPopup, openChat, sendChat, unreadTotal, useFriendChat } from '@/lib/chat';
import { SUPPORT_LINES, refreshFriends, setDnd, useNameOf, useSocial, type Friend } from '@/lib/social';
import { closeAssistant } from '@/lib/assistant';
import { Mascot, type Mood } from './Mascot';
import { Icon } from './Icon';
import { EASE, SOFT, SPRING } from './motion';

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const doing = (f: Friend) =>
  f.dnd ? 'Do not disturb'
    : !f.online ? 'Offline'
      : f.activity?.state === 'studying' ? 'Studying' : f.activity?.state === 'break' ? 'On a break' : f.activity?.state === 'quiz' ? 'Taking a quiz' : 'Online';
const moodFor = (f: Friend): Mood => (!f.online ? 'idle' : f.activity?.state === 'studying' ? 'focus' : f.activity?.state === 'quiz' ? 'quiz' : 'happy');

/** Open a friend's chat (and tuck the study assistant away: they share the same side of the screen). */
export function startChat(friendId: string) {
  closeAssistant();
  openChat(friendId);
}

/** Do Not Disturb on/off, with a plain confirmation. */
export async function toggleDnd() {
  const me = useSocial.getState().me;
  if (!me) return;
  const on = !me.dnd;
  const saved = await setDnd(on);
  const { showToast } = useStudy.getState();
  if (on) showToast(saved ? 'Do Not Disturb is on. Messages and study invites wait quietly, and friends see a moon by your name.' : 'Do Not Disturb is on for this device. (Friends can\'t see it until the site\'s database is updated.)');
  else showToast('Do Not Disturb is off.');
}

/** The moon button on the Friends card. */
export function DndButton() {
  const on = useSocial((s) => !!s.me?.dnd);
  const label = on ? 'Do Not Disturb is on. Click to turn it off' : 'Do Not Disturb: mute messages and study invites';
  return (
    <button className="icon-btn small-icon dnd-btn" id="dndBtn" type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => void toggleDnd()}>
      <Icon name="moon" />
    </button>
  );
}

/** The conversation panel. Always mounted, so opening and closing never wait on an exit animation. */
export function ChatPanel() {
  const friendId = useFriendChat((s) => s.open);
  const messages = useFriendChat((s) => s.messages);
  const loading = useFriendChat((s) => s.loading);
  const error = useFriendChat((s) => s.error);
  const friends = useSocial((s) => s.friends);
  const myDnd = useSocial((s) => !!s.me?.dnd);
  const nameOf = useNameOf();
  const friend = friends.find((f) => f.id === friendId);
  const open = !!friendId;
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');

  useEffect(() => { if (open) { setText(''); requestAnimationFrame(() => box.current?.focus()); } }, [open, friendId]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages.length, open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeChat(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  // Unfriended (or signed out) while the chat is open: close it.
  useEffect(() => { if (open && friends.length && !friend) closeChat(); }, [open, friends.length, friend]);

  const send = (t = text) => {
    if (!t.trim()) return;
    void sendChat(t);
    setText('');
    box.current?.focus();
  };
  const name = friend ? nameOf(friend.id, friend.name) : '';

  return (
    <motion.aside className="assistant chat-panel" id="chatPanel" aria-label={friend ? `Chat with ${name}` : 'Chat'} aria-hidden={!open} inert={!open}
      initial={false} animate={open ? { x: 0, opacity: 1 } : { x: '104%', opacity: 0.6 }} transition={{ duration: 0.34, ease: EASE }}>
      <header className="assistant-head">
        <span className="assistant-mark has-buddy" aria-hidden="true">{friend && <Mascot mood={moodFor(friend)} kind={friend.buddy} wear={friend.wear} />}</span>
        <div className="assistant-title">
          <h2>{name || 'Chat'}</h2>
          <span className="chat-status" data-dnd={friend?.dnd ? '1' : undefined}>{friend?.dnd && <Icon name="moon" />}{friend ? doing(friend) : ''}</span>
        </div>
        <button className="icon-btn" type="button" aria-label="Close the chat" onClick={closeChat}><Icon name="x" /></button>
      </header>

      <div className="assistant-list chat-list" ref={list} role="log" aria-live="polite">
        <p className="chat-note">Messages disappear after 24 hours.</p>
        {friend?.dnd && <p className="chat-note dnd"><Icon name="moon" />{name} has Do Not Disturb on. Your message will be waiting when they&apos;re back.</p>}
        {myDnd && <p className="chat-note dnd"><Icon name="moon" />Your Do Not Disturb is on, so new messages won&apos;t pop up.</p>}
        {loading && !messages.length && <p className="muted small"><span className="spin" aria-hidden="true" /> Loading…</p>}
        {!loading && !messages.length && !error && <p className="chat-empty">No messages yet. Say hi, or send a quick cheer below.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.mine ? 'me' : 'bot'}${m.state === 'failed' ? ' err' : ''}`} data-state={m.state}>
            <span className="chat-text">{m.text}</span>
            <span className="chat-time">{m.state === 'sending' ? 'Sending…' : m.state === 'failed' ? 'Not sent' : clock(m.at)}</span>
          </div>
        ))}
        {error && <p className="hint warn" role="status">{error}</p>}
      </div>

      {messages.length === 0 && !loading && (
        <div className="assistant-chips">
          {SUPPORT_LINES.slice(0, 4).map((l) => <button key={l} className="chip" type="button" onClick={() => send(l)}>{l}</button>)}
        </div>
      )}
      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="chatBox">Message {name}</label>
        <textarea id="chatBox" ref={box} rows={1} value={text} maxLength={MAX_CHAT} placeholder={name ? `Message ${name}…` : 'Message…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn btn-primary send-btn" type="submit" aria-label="Send" disabled={!text.trim()}><Icon name="send" /></button>
      </form>
    </motion.aside>
  );
}

/** A friend's buddy walks in with their newest message. Hidden while Do Not Disturb is on. */
export function ChatPopup() {
  const popup = useFriendChat((s) => s.popup);
  const friend = useSocial((s) => s.friends.find((f) => f.id === popup?.from));
  const dnd = useSocial((s) => !!s.me?.dnd);
  const nameOf = useNameOf();
  // A message just arrived: bring the friends list up to date too (their buddy's outfit, whether they're studying).
  useEffect(() => { if (popup?.id) void refreshFriends(); }, [popup?.id]);
  if (!popup || !friend || dnd) return null;
  return (
    <motion.div className="support-pop chat-pop" id="chatPop" role="status" aria-live="polite" key={popup.id}
      initial={{ opacity: 0, x: -60 }} animate={{ opacity: 1, x: 0 }} transition={SPRING}>
      <motion.span className="support-buddy" aria-hidden="true" animate={{ y: [0, -8, 0, -4, 0] }} transition={{ duration: 1.1, delay: 0.45 }}>
        <Mascot mood="cheer" kind={friend.buddy} wear={friend.wear} />
      </motion.span>
      <motion.div className="support-bubble" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SOFT, delay: 0.25 }}>
        <p className="support-from"><strong>{nameOf(friend.id, friend.name)}</strong> sent you a message</p>
        <p className="support-text">{popup.text}</p>
        <div className="support-btns">
          <button className="btn btn-primary" type="button" onClick={() => startChat(friend.id)}>Reply</button>
          <button className="btn-quiet" type="button" onClick={dismissPopup}>Later</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Unread messages across all friends, for the Friends card heading. */
export const useUnreadTotal = () => useFriendChat(unreadTotal);
