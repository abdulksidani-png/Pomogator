'use client';
/**
 * Studying together: the invite dialog (pick up to 3 friends, the study length and the break everyone gets),
 * invites you've received, and the group panel above the timer while you're in a room.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { useSocial } from '@/lib/social';
import { answerInvite, busy, createRoom, leaveRoom, useInvites } from '@/lib/collab';
import { effective, roomTerms } from '@/lib/collab-core';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { SOFT } from './motion';
import { useNameOf } from '@/lib/social';

const STUDY = [25, 30, 45, 50];
const BREAK = [5, 10, 15];

/** Invite friends to a shared session. `friendId` is the friend it was opened from. */
export function TogetherDialog({ friendId, onClose }: { friendId: string | null; onClose: () => void }) {
  const nameOf = useNameOf();
  const ref = useRef<HTMLDialogElement>(null);
  const all = useSocial((s) => s.friends); // (filter outside the selector: a fresh array each time would re-render forever)
  const friends = useMemo(() => all.filter((f) => f.relation === 'friend'), [all]);
  const studyDefault = useStudy((s) => s.settings.studyMin);
  const [picked, setPicked] = useState<string[]>([]);
  const [study, setStudy] = useState(25);
  const [brk, setBrk] = useState(5);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (friendId !== null && !d.open) {
      setPicked(friendId ? [friendId] : []); setStudy(STUDY.includes(studyDefault) ? studyDefault : 25); setBrk(5); setNote(''); setMsg('');
      d.showModal();
    }
    if (friendId === null && d.open) d.close();
  }, [friendId, studyDefault]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const send = async () => {
    if (busy()) { setMsg('Finish or reset your current session first, then start the group session.'); return; }
    setSending(true);
    const r = await createRoom(picked, study, brk, note);
    setSending(false);
    if (r === 'ok') { onClose(); useStudy.getState().showToast(`Invite sent. Start the timer whenever you're ready.`); }
    else setMsg(r === 'not_friends' ? 'You can only invite friends.' : 'Couldn\'t send the invite. Try again.');
  };

  return (
    <dialog ref={ref} id="togetherDlg" aria-labelledby="togetherTitle" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg-head"><h2 id="togetherTitle">Study together</h2><button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
      <div className="dlg-body">
        <p className="hint">Your timers stay in sync: anyone can start or pause. Everyone still gets a quiz, but the break is the length you pick here, for everyone, whatever the score.</p>
        <fieldset>
          <legend>Who (up to 3 friends, groups of 4)</legend>
          <ul className="together-pick">
            {friends.map((f) => (
              <li key={f.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(f.id)} disabled={!picked.includes(f.id) && picked.length >= 3} onChange={() => toggle(f.id)} />
                  <span className="friend-ava" aria-hidden="true"><Mascot mood={f.online ? 'happy' : 'idle'} kind={f.buddy} wear={f.wear} /></span>
                  <span>{nameOf(f.id, f.name)}<small>{f.online ? 'online' : 'offline'}</small></span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset>
          <legend>Lengths</legend>
          <div className="field"><span className="field-label" id="tgStudy">Study session</span>
            <div className="seg" role="group" aria-labelledby="tgStudy">
              {STUDY.map((m) => <button key={m} type="button" aria-pressed={study === m} onClick={() => setStudy(m)}>{m} min</button>)}
            </div>
          </div>
          <div className="field"><span className="field-label" id="tgBreak">Break for everyone</span>
            <div className="seg" role="group" aria-labelledby="tgBreak">
              {BREAK.map((m) => <button key={m} type="button" aria-pressed={brk === m} onClick={() => setBrk(m)}>{m} min</button>)}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="tgNote">Note (optional)</label>
            <input id="tgNote" type="text" maxLength={140} placeholder="e.g. Chem exam cram" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </fieldset>
        {msg && <p className="hint warn" role="alert">{msg}</p>}
      </div>
      <div className="dlg-foot spread">
        <span className="muted small">{picked.length + 1} of 4 · {roomTerms(study, brk)}</span>
        <button className="btn btn-primary" type="button" disabled={!picked.length || sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send invite'}</button>
      </div>
    </dialog>
  );
}

/** Invites to study together, above the timer. */
export function InviteBanner() {
  const nameOf = useNameOf();
  const invites = useInvites((s) => s.invites);
  const inRoom = useStudy((s) => !!s.collab);
  const T = useStudy((s) => s.timer);
  const [err, setErr] = useState('');
  const inv = invites[0];
  if (!inv) return null;
  const isBusy = T.phase === 'quiz' || T.status !== 'idle';
  const accept = async () => {
    const r = await answerInvite(inv.roomId, true);
    if (r === 'joined') useStudy.getState().showToast(`You joined ${nameOf(inv.hostId, inv.hostName)}'s session`);
    else setErr(r === 'full' ? 'That group is full.' : r === 'ended' ? 'That session has ended.' : 'Couldn\'t join. Try again.');
  };
  return (
    <motion.section className="card week-banner invite-banner" id="inviteBanner" aria-label="Study together invite" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
      <span className="invite-ava" aria-hidden="true"><Mascot mood="cheer" kind={inv.hostBuddy} wear={inv.hostWear} /></span>
      <div className="week-banner-text">
        <strong>{nameOf(inv.hostId, inv.hostName)} invited you to study together</strong>
        <span>{roomTerms(inv.studyMin, inv.breakMin)} · same break for everyone · {inv.people} of 4{inv.note ? ` · "${inv.note}"` : ''}</span>
        {(isBusy || inRoom) && <span className="hint">{inRoom ? 'Joining leaves your current group.' : 'Finish or reset your current session to join.'}</span>}
        {err && <span className="hint warn">{err}</span>}
      </div>
      <button className="btn btn-primary" type="button" disabled={isBusy} onClick={() => void accept()}>Join</button>
      <button className="btn-quiet" type="button" onClick={() => void answerInvite(inv.roomId, false)}>No thanks</button>
    </motion.section>
  );
}

/** While in a room: who's in it, the agreed lengths, and Leave. */
export function RoomPanel() {
  const nameOf = useNameOf();
  const room = useStudy((s) => s.collab);
  const me = useStudy((s) => s.account.userId);
  if (!room) return null;
  const e = effective(room.state, Date.now(), room.breakMin);
  const joined = room.members.filter((m) => m.status === 'joined');
  const waiting = room.members.filter((m) => m.status === 'invited');
  return (
    <motion.section className="card room-panel" id="roomPanel" aria-label="Studying together" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
      <div className="room-people">
        {joined.map((m) => (
          <span key={m.id} className="room-person" title={m.id === me ? 'You' : nameOf(m.id, m.name)}>
            <span className="friend-ava" aria-hidden="true"><Mascot mood={e.phase === 'break' ? 'rest' : e.status === 'running' ? 'focus' : 'happy'} kind={m.buddy} wear={m.wear} /></span>
            <span className="room-name">{m.id === me ? 'You' : nameOf(m.id, m.name)}</span>
          </span>
        ))}
        {waiting.map((m) => (
          <span key={m.id} className="room-person waiting" title={`${nameOf(m.id, m.name)} hasn't joined yet`}>
            <span className="friend-ava" aria-hidden="true"><Mascot mood="idle" kind={m.buddy} wear={m.wear} /></span>
            <span className="room-name">{nameOf(m.id, m.name)}<small>invited</small></span>
          </span>
        ))}
      </div>
      <div className="room-text">
        <strong>Studying together · round {e.round}</strong>
        <span>{roomTerms(room.studyMin, room.breakMin)}, the same break for everyone{room.note ? ` · ${room.note}` : ''}</span>
        {room.state.by && <span className="muted small">Last change by {room.state.by}</span>}
      </div>
      <button className="btn-quiet" type="button" onClick={() => void leaveRoom()}>Leave</button>
    </motion.section>
  );
}
