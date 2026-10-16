'use client';
/**
 * Friends: the widget in the side column, the friends dialog (your code, add a friend, what friends can see),
 * and the support message popup, where a friend's study buddy walks in with their message.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import {
  REPLY_LINES, SUPPORT_LINES, addFriend, replySupport, type Support, heartbeat, inviteLink, markSeen, publishStats, refreshFriends, refreshInbox, respondFriend,
  sendSupport, startSocial, syncBuddy, updateMe, useSocial, type Friend, type SharedStats,
} from '@/lib/social';
import { MASCOTS } from '@/lib/appearance';
import { badgeName } from '@/lib/checkins';
import { todayFor } from '@/lib/dates';
import { Icon } from './Icon';
import { Mascot, type Mood } from './Mascot';
import { Medal } from './Streaks';
import { FoldCard } from './Panels';
import { SOFT, SPRING } from './motion';
import { encodeBuddy } from '@/lib/cosmetics';

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Starts friends for the signed-in account and keeps what I share up to date. Renders nothing. */
export function SocialHost({ onOpenFriends }: { onOpenFriends: (code: string) => void }) {
  const status = useStudy((s) => s.account.status);
  const userId = useStudy((s) => s.account.userId);
  const kind = useStudy((s) => s.settings.mascotKind);
  const history = useStudy((s) => s.history);
  const checkins = useStudy((s) => s.checkins);
  const ready = useSocial((s) => s.status === 'ready');

  useEffect(() => { startSocial(status); }, [status, userId]);
  const wear = useStudy((s) => s.settings.wear);
  // My buddy and its outfit, as my friends see them (in their list, my messages and our study rooms).
  useEffect(() => { if (ready) void syncBuddy(encodeBuddy(kind, wear)); }, [ready, kind, wear]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void publishStats(), 3000);
    return () => clearTimeout(t);
  }, [ready, history, checkins]);
  // Back to the tab: catch up right away.
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') { void refreshFriends(); void refreshInbox(); void heartbeat(true); } };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  // An invite link (?friend=CODE) opens the friends dialog with the code filled in.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('friend');
    if (!code) return;
    const url = new URL(location.href);
    url.searchParams.delete('friend');
    window.history.replaceState(null, '', url.pathname + url.search);
    onOpenFriends(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function moodOf(f: Friend): Mood {
  if (!f.online || !f.activity) return 'idle';
  return f.activity.state === 'studying' ? 'focus' : f.activity.state === 'break' ? 'rest' : f.activity.state === 'quiz' ? 'quiz' : 'happy';
}

function doingText(f: Friend): string {
  if (f.relation === 'sent') return 'Request sent';
  if (f.relation === 'received') return 'Wants to be friends';
  if (!f.online || !f.activity) return 'Offline';
  const a = f.activity;
  const with_ = a.together ? ' together' : '';
  if (a.state === 'studying') return `Studying${with_}${a.sessionMin ? ` · ${a.sessionMin} min in` : ''}`;
  if (a.state === 'paused') return 'Paused';
  if (a.state === 'quiz') return 'Taking a quiz';
  if (a.state === 'break') return `On a break${with_}`;
  return a.todayMin ? `Online · ${hm(a.todayMin)} today` : 'Online';
}

/** The friends widget in the side column. */
export function FriendsCard({ onSignIn, onOpen, onTogether }: { onSignIn: () => void; onOpen: () => void; onTogether: (friendId: string) => void }) {
  const { status, friends } = useSocial();
  const account = useStudy((s) => s.account.status);
  const [openId, setOpenId] = useState('');
  if (status === 'off' && account !== 'connecting' && account !== 'guest') return null; // no accounts on this copy of the site

  const mates = friends.filter((f) => f.relation === 'friend');
  const online = mates.filter((f) => f.online).length;
  const requests = friends.filter((f) => f.relation === 'received');

  return (
    <FoldCard id="friendsCard" fold="friends" title="Friends" meta={status === 'ready' && mates.length ? `${online} online` : ''}
      summary={requests.length ? `${requests.length} request${requests.length === 1 ? '' : 's'}` : undefined}
      actions={status === 'ready' ? <button className="icon-btn small-icon" type="button" aria-label="Add friends and sharing settings" title="Add friends" onClick={onOpen}><Icon name="plus" /></button> : null}>
      {status === 'guest' || account === 'guest' ? (
        <div className="friends-empty">
          <p>Study with friends: see who&apos;s studying, cheer each other on and start sessions together.</p>
          <button className="btn btn-primary" type="button" onClick={onSignIn}>Sign in to add friends</button>
        </div>
      ) : status === 'not_ready' ? (
        <p className="hint">Friends aren&apos;t switched on for this site yet.</p>
      ) : status === 'loading' || status === 'off' ? (
        <p className="muted small"><span className="spin" aria-hidden="true" /> Loading friends…</p>
      ) : status === 'error' ? (
        <p className="hint warn">Couldn&apos;t load your friends. <button className="btn-link" type="button" onClick={() => startSocial('user')}>Try again</button></p>
      ) : (
        <>
          {requests.map((f) => (
            <div key={f.id} className="friend-request">
              <span className="friend-ava" aria-hidden="true"><Mascot mood="happy" kind={f.buddy} wear={f.wear} /></span>
              <span className="friend-main"><strong>{f.name}</strong><span>wants to be friends</span></span>
              <span className="friend-req-btns">
                <button className="btn btn-primary" type="button" onClick={() => void respondFriend(f.id, true)}>Accept</button>
                <button className="btn-quiet" type="button" onClick={() => void respondFriend(f.id, false)}>Decline</button>
              </span>
            </div>
          ))}
          {mates.length === 0 && !requests.length && (
            <div className="friends-empty">
              <p>No friends yet. Share your friend code, or add theirs.</p>
              <button className="btn" type="button" onClick={onOpen}><Icon name="plus" />Add a friend</button>
            </div>
          )}
          <ul className="friend-list">
            {friends.filter((f) => f.relation !== 'received').map((f) => (
              <FriendRow key={f.id} f={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? '' : f.id)} onTogether={() => onTogether(f.id)} />
            ))}
          </ul>
        </>
      )}
    </FoldCard>
  );
}

function FriendRow({ f, open, onToggle, onTogether }: { f: Friend; open: boolean; onToggle: () => void; onTogether: () => void }) {
  const pending = f.relation === 'sent';
  return (
    <li className="friend" data-online={f.online ? '1' : '0'} data-open={open ? '1' : undefined}>
      <button className="friend-row" type="button" aria-expanded={open} disabled={pending} onClick={onToggle}>
        <span className="friend-ava" aria-hidden="true"><Mascot mood={moodOf(f)} kind={f.buddy} wear={f.wear} /></span>
        <span className="friend-main">
          <strong>{f.name}</strong>
          <span className="friend-doing">{doingText(f)}</span>
          {f.music && <span className="friend-music"><Icon name="music" />{f.music.title} · {f.music.artist}</span>}
        </span>
        <span className="friend-dot" aria-label={f.online ? 'online' : 'offline'} />
      </button>
      {open && !pending && (
        <motion.div className="friend-more" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
          {f.stats ? <FriendStats s={f.stats} /> : <p className="muted small">{f.name} keeps their stats private.</p>}
          <SupportPicker f={f} />
          <div className="friend-actions">
            <button className="btn" type="button" onClick={onTogether}><Icon name="loop" />Study together</button>
            <RemoveFriend f={f} />
          </div>
        </motion.div>
      )}
    </li>
  );
}

function FriendStats({ s }: { s: SharedStats }) {
  // Their numbers are as of their last update; if that was another day, they haven't studied today yet.
  const today = useStudy((st) => todayFor(st.settings));
  const fresh = s.day === today;
  return (
    <div className="friend-stats">
      <div className="fs-today">
        <span className="fs-label">Today</span>
        <strong>{fresh ? hm(s.todayMin) : '0 min'}</strong>
        <span>{fresh ? `${s.todaySessions} session${s.todaySessions === 1 ? '' : 's'}${s.todayAccuracy !== null ? ` · ${s.todayAccuracy}% on quizzes` : ''}` : 'nothing yet today'}</span>
      </div>
      <dl className="fs-grid">
        <div><dt>Study streak</dt><dd>{days(s.studyStreak)}<small>best {s.bestStudyStreak}</small></dd></div>
        <div><dt>Check-in streak</dt><dd>🔥 {days(s.checkinStreak)}<small>best {s.bestCheckinStreak}</small></dd></div>
        <div><dt>All time</dt><dd>{hm(s.totalMin)}<small>{s.totalSessions} sessions</small></dd></div>
        <div><dt>Quiz accuracy</dt><dd>{s.accuracy === null ? '–' : `${s.accuracy}%`}<small>overall</small></dd></div>
      </dl>
      {s.badges.length > 0 && (
        <div className="fs-badges" aria-label={`Badges: ${s.badges.map(badgeName).join(', ')}`}>
          {s.badges.map((m) => <span key={m} title={badgeName(m)}><Medal m={m} earned /></span>)}
        </div>
      )}
    </div>
  );
}

/** One support message per friend per day, said by my study buddy. */
function SupportPicker({ f }: { f: Friend }) {
  const kind = useStudy((s) => s.settings.mascotKind);
  const [text, setText] = useState(SUPPORT_LINES[0]);
  const [state, setState] = useState<'' | 'sending' | 'sent' | 'error'>('');
  if (f.supportedToday || state === 'sent') {
    return <p className="support-done"><Icon name="check" />Support sent today. You can send {f.name} another tomorrow.</p>;
  }
  const buddy = MASCOTS.find((m) => m.id === kind)?.name ?? 'Your buddy';
  const send = async () => {
    setState('sending');
    const r = await sendSupport(f.id, text);
    setState(r === 'sent' || r === 'already_sent' ? 'sent' : 'error');
    if (r === 'sent') useStudy.getState().showToast(`${buddy} is taking your message to ${f.name}`);
  };
  return (
    <div className="support-pick">
      <span className="fs-label">Send {f.name} some support <small>(one a day, delivered by {buddy})</small></span>
      <div className="support-chips" role="group" aria-label="Messages">
        {SUPPORT_LINES.slice(0, 4).map((l) => <button key={l} className="chip" type="button" aria-pressed={text === l} onClick={() => setText(l)}>{l}</button>)}
      </div>
      <div className="row-inline">
        <label className="sr-only" htmlFor={`sup-${f.id}`}>Your message</label>
        <input id={`sup-${f.id}`} type="text" maxLength={140} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" type="button" disabled={!text.trim() || state === 'sending'} onClick={() => void send()}>
          <Icon name="send" />Send
        </button>
      </div>
      {state === 'error' && <p className="hint warn" role="alert">Couldn&apos;t send it. Try again.</p>}
    </div>
  );
}

function RemoveFriend({ f }: { f: Friend }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className="btn-quiet danger" type="button" onClick={() => (armed ? void respondFriend(f.id, false) : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? `Remove ${f.name}?` : 'Remove friend'}
    </button>
  );
}

/** Your friend code, adding a friend, your name and what friends can see. */
export function FriendsDialog({ dialogRef, code: prefill }: { dialogRef: RefObject<HTMLDialogElement | null>; code: string }) {
  const { me, status } = useSocial();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (prefill) setCode(prefill); }, [prefill]);
  useEffect(() => { if (me) setName(me.name); }, [me?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const r = await addFriend(code);
    setMsg({
      requested: 'Request sent. You\'ll be friends once they accept.', accepted: 'You\'re now friends!', pending: 'Your request is still waiting for them.',
      already: 'You\'re already friends.', self: 'That\'s your own code.', not_found: 'No one has that code. Check it and try again.',
      too_many: 'You have the most friends allowed.', not_signed_in: 'Sign in first.',
    }[r] ?? 'Something went wrong. Try again.');
    if (r === 'requested' || r === 'accepted') setCode('');
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); useStudy.getState().showToast(`${what} copied`); } catch { /* clipboard blocked */ }
  };
  const close = () => dialogRef.current?.close();

  return (
    <dialog ref={dialogRef} id="friendsDlg" aria-labelledby="friendsDlgTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head"><h2 id="friendsDlgTitle">Friends</h2><button className="icon-btn" type="button" aria-label="Close" onClick={close}><Icon name="x" /></button></div>
      <div className="dlg-body">
        {status !== 'ready' || !me ? <p className="hint">Sign in with Google or email to add friends.</p> : (
          <>
            <fieldset>
              <legend>Your friend code</legend>
              <div className="code-row">
                <strong className="friend-code" id="myFriendCode">{me.code}</strong>
                <button className="btn" type="button" onClick={() => void copy(me.code, 'Friend code')}>Copy code</button>
                <button className="btn" type="button" onClick={() => void copy(inviteLink(me.code), 'Invite link')}><Icon name="external" />Copy invite link</button>
              </div>
              <p className="hint">Friends add you with this code. Only accounts can be friends, not guests.</p>
            </fieldset>
            <fieldset>
              <legend>Add a friend</legend>
              <form className="row-inline" onSubmit={(e) => { e.preventDefault(); void add(); }}>
                <label className="sr-only" htmlFor="friendCodeIn">Their friend code</label>
                <input ref={box} id="friendCodeIn" type="text" autoComplete="off" placeholder="Their code, e.g. K7Q2M9XP" value={code}
                  onChange={(e) => { setCode(e.target.value); setMsg(''); }} />
                <button className="btn btn-primary" type="submit" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6}>Add friend</button>
              </form>
              {msg && <p className="hint" role="status">{msg}</p>}
            </fieldset>
            <fieldset>
              <legend>What friends can see</legend>
              <div className="set-row">
                <label htmlFor="myName">Your name<span className="sub">How friends see you</span></label>
                <input id="myName" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
                  onBlur={() => { if (name.trim() && name.trim() !== me.name) void updateMe({ name }); }} />
              </div>
              <div className="set-row">
                <label htmlFor="shareOnline">When I&apos;m online<span className="sub">And whether I&apos;m studying, on a break or taking a quiz, and for how long</span></label>
                <input type="checkbox" className="switch" id="shareOnline" checked={me.shareOnline} onChange={(e) => void updateMe({ shareOnline: e.target.checked })} />
              </div>
              <div className="set-row">
                <label htmlFor="shareMusic">What I&apos;m listening to<span className="sub">The song playing in the Spotify widget, while I&apos;m online</span></label>
                <input type="checkbox" className="switch" id="shareMusic" checked={me.shareMusic} onChange={(e) => void updateMe({ shareMusic: e.target.checked })} />
              </div>
              <div className="set-row">
                <label htmlFor="shareStats">My stats<span className="sub">Today&apos;s study time, streaks, all-time totals and badges</span></label>
                <input type="checkbox" className="switch" id="shareStats" checked={me.shareStats} onChange={(e) => void updateMe({ shareStats: e.target.checked })} />
              </div>
            </fieldset>
          </>
        )}
      </div>
      <div className="dlg-foot"><button className="btn btn-primary" type="button" onClick={close}>Done</button></div>
    </dialog>
  );
}

/** A friend's study buddy walks in and says their message. One at a time; shown once on any device. */
export function SupportPopup() {
  const msg = useSocial((s) => s.inbox[0]);
  const shown = useRef('');
  useEffect(() => {
    if (!msg || shown.current === msg.id) return;
    shown.current = msg.id;
    const st = useStudy.getState().settings;
    if (st.controlSounds) void import('@/lib/sound').then((m) => m.Sound.cue('resume', st.chimeVol)).catch(() => undefined);
  }, [msg]);
  if (!msg) return null;
  return <SupportBubble key={msg.id} msg={msg} />;
}

function SupportBubble({ msg }: { msg: Support }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(REPLY_LINES[0]);
  const [state, setState] = useState('');
  const buddy = MASCOTS.find((m) => m.id === msg.buddy)?.name ?? 'A buddy';
  const send = async () => {
    setState('sending');
    const r = await replySupport(msg.id, text);
    if (r === 'sent' || r === 'already_replied') useStudy.getState().showToast(`Your reply is on its way to ${msg.fromName}`);
    else setState(r === 'not_ready' ? 'Replies aren\'t switched on for this site yet.' : 'Couldn\'t send it. Try again.');
  };
  return (
    <motion.div key={msg.id} className="support-pop" role="status" aria-live="polite"
      initial={{ x: -260, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...SPRING, stiffness: 160 }}>
      <motion.span className="support-buddy" aria-hidden="true" animate={{ y: [0, -8, 0, -4, 0] }} transition={{ duration: 1.1, delay: 0.45 }}>
        <Mascot mood="cheer" kind={msg.buddy} wear={msg.wear} />
      </motion.span>
      <motion.div className="support-bubble" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...SPRING, delay: 0.5 }}>
        <p className="support-text">{msg.text}</p>
        <p className="support-from">{buddy} brought {msg.isReply ? 'a reply' : 'this'} from <strong>{msg.fromName}</strong></p>
        {replying ? (
          <div className="support-reply">
            <div className="support-chips" role="group" aria-label="Quick replies">
              {REPLY_LINES.map((l) => <button key={l} className="chip" type="button" aria-pressed={text === l} onClick={() => setText(l)}>{l}</button>)}
            </div>
            <form className="row-inline" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <label className="sr-only" htmlFor="supportReply">Your reply</label>
              <input id="supportReply" type="text" maxLength={140} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              <button className="btn btn-primary" type="submit" disabled={!text.trim() || state === 'sending'}><Icon name="send" />Send</button>
            </form>
            {state && state !== 'sending' && <p className="hint warn" role="alert">{state}</p>}
            <button className="btn-quiet" type="button" onClick={() => void markSeen(msg.id)}>Close</button>
          </div>
        ) : (
          <div className="support-actions">
            <button className="btn btn-primary" type="button" onClick={() => void markSeen(msg.id)}>Thanks! 💛</button>
            {!msg.isReply && <button className="btn" type="button" onClick={() => setReplying(true)}>Reply</button>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
