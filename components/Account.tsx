'use client';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStudy } from '@/lib/store';
import { signInWithGoogle, sendEmailLink } from '@/lib/auth';
import { signOut } from '@/lib/sync';
import { supabaseConfigured } from '@/lib/supabase/env';
import { detectTimeZone, timeZoneList } from '@/lib/dates';
import { Icon } from './Icon';
import { useDialogOpen } from '@/lib/use-dialog-open';

const initials = (name?: string) =>
  (name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/* ---------------- header button ---------------- */

export function AccountButton({ onSignIn, onProfile }: { onSignIn: () => void; onProfile: () => void }) {
  const a = useStudy((s) => s.account);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!supabaseConfigured()) return null;
  if (a.status !== 'user') {
    return (
      <button className="chip-btn signin-chip" id="accountBtn" type="button" onClick={onSignIn} aria-label="Sign in to save your progress" disabled={a.status === 'connecting'}>
        <Icon name="user" /><span>Sign in</span>
      </button>
    );
  }
  return (
    <div className="acct" ref={wrap}>
      <button className="avatar-btn" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${a.name || a.email}`} onClick={() => setOpen((o) => !o)}>
        {a.avatarUrl ? <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(a.name || a.email)}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head"><b>{a.name || a.email || 'Your account'}</b>{a.email && a.name && a.name !== a.email && <span>{a.email}</span>}</div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onProfile(); }}>Profile &amp; settings</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- sign-in dialog ---------------- */

export function SignInDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const status = useStudy((s) => s.account.status);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const close = () => dialogRef.current?.close();

  // Close by itself once sign-in completes.
  useEffect(() => { if (status === 'user') close(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const google = async () => {
    setBusy('google'); setNote(null);
    try { await signInWithGoogle(); } // navigates away on success
    catch (e) { setNote({ ok: false, text: (e as Error).message }); setBusy(null); }
  };
  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email'); setNote(null);
    try {
      const kind = await sendEmailLink(email);
      useStudy.getState().setAccount({ pendingEmail: email.trim() });
      setNote({ ok: true, text: kind === 'confirm'
        ? `Check ${email.trim()} and click the link to finish. Everything you did as a guest stays.`
        : `Check ${email.trim()} for a sign-in link. Open it in this browser, and your guest progress joins your account.` });
    } catch (err) { setNote({ ok: false, text: (err as Error).message }); }
    finally { setBusy(null); }
  };

  return (
    <dialog ref={dialogRef} id="signinDlg" aria-labelledby="signinTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head">
        <h2 id="signinTitle">Sign in to save your progress</h2>
        <button className="icon-btn" type="button" aria-label="Close sign in" onClick={close}><Icon name="x" /></button>
      </div>
      <div className="dlg-body signin-body">
        <p className="muted" style={{ margin: 0 }}>Use PomoGator on any device. Everything you did as a guest comes with you. No password needed.</p>
        <button className="btn btn-primary btn-wide" type="button" onClick={google} disabled={!!busy}>
          {busy === 'google' ? <><span className="spin" aria-hidden="true" />Opening Google…</> : 'Continue with Google'}
        </button>
        <div className="or">or</div>
        <form className="email-row" onSubmit={sendLink}>
          <label className="sr-only" htmlFor="signinEmail">Email address</label>
          <input type="email" id="signinEmail" required placeholder="you@school.edu" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit" disabled={!!busy}>{busy === 'email' ? 'Sending…' : 'Email me a link'}</button>
        </form>
        {note && <p className={`note${note.ok ? '' : ' err'}`} role="status">{note.text}</p>}
      </div>
    </dialog>
  );
}

/* ---------------- profile dialog ---------------- */

export function ProfileDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const open = useDialogOpen(dialogRef);
  const s = useStudy((st) => st.settings);
  const a = useStudy((st) => st.account);
  const update = useStudy.getState().updateSettings;
  const zones = useMemo(() => timeZoneList(), []);
  const detected = useMemo(() => detectTimeZone(), []);
  const close = () => dialogRef.current?.close();
  const zoneOptions = zones.includes(s.timezone) || !s.timezone ? zones : [s.timezone, ...zones];

  return (
    <dialog ref={dialogRef} id="profileDlg" aria-labelledby="profileTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      {open && (<>
      <div className="dlg-head">
        <h2 id="profileTitle">Profile &amp; settings</h2>
        <button className="icon-btn" type="button" aria-label="Close profile" onClick={close}><Icon name="x" /></button>
      </div>
      <div className="dlg-body">
        <fieldset>
          <legend>You</legend>
          <div className="field"><label htmlFor="pName">Display name</label>
            <input type="text" id="pName" maxLength={80} key={s.displayName} defaultValue={s.displayName}
              onBlur={(e) => { const v = e.target.value.trim(); update((x) => { x.displayName = v; }); }} />
          </div>
          <div className="set-row"><span className="field-label">Signed in as<span className="sub">{a.email || 'Guest'}</span></span>
            {a.status === 'user' && <button className="btn" type="button" onClick={() => { close(); void signOut(); }}>Sign out</button>}
          </div>
        </fieldset>
        <fieldset>
          <legend>Days and weeks</legend>
          <div className="field"><label htmlFor="pTz">Time zone</label>
            <span className="inline">
              <select id="pTz" value={s.timezone} onChange={(e) => { const v = e.target.value; update((x) => { x.timezone = v; }); }}>
                {zoneOptions.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
              {detected !== s.timezone && <button className="btn-quiet" type="button" onClick={() => update((x) => { x.timezone = detected; })}>Use {detected.replace(/_/g, ' ')}</button>}
            </span>
          </div>
          <div className="set-row"><span className="field-label" id="wkLabel">Week starts on</span>
            <div className="seg" role="group" aria-labelledby="wkLabel">
              {[[1, 'Monday'], [0, 'Sunday']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={s.weekStart === v} onClick={() => update((x) => { x.weekStart = v as number; })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="set-row"><span className="field-label" id="roLabel">A new day starts at<span className="sub">4 AM counts late-night studying toward the day before</span></span>
            <div className="seg" role="group" aria-labelledby="roLabel">
              {[[0, 'Midnight'], [4, '4 AM']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={s.rollover === v} onClick={() => update((x) => { x.rollover = v as number; })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="set-row"><label htmlFor="pFreeze">Streak freeze<span className="sub">Earn a freeze for every 7 days in a row (hold up to 2). A missed day uses one, so it doesn&apos;t reset your streaks</span></label>
            <input type="checkbox" className="switch" id="pFreeze" checked={s.streakFreeze} onChange={(e) => { const v = e.target.checked; update((x) => { x.streakFreeze = v; }); }} />
          </div>
        </fieldset>
      </div>
      <div className="dlg-foot"><button className="btn btn-primary" type="button" onClick={close}>Done</button></div>
      </>)}
    </dialog>
  );
}

/* ---------------- footer status ---------------- */

export function SyncStatus() {
  const a = useStudy((s) => s.account);
  let dot = '', text = '';
  if (!supabaseConfigured() || a.status === 'local') { text = a.error || 'Settings, tasks and history are saved on this device.'; }
  else if (a.status === 'connecting') { dot = 'busy'; text = 'Connecting…'; }
  else if (a.error) { dot = 'err'; text = a.error; }
  else if (a.syncing) { dot = 'busy'; text = 'Saving…'; }
  else if (a.notice) { dot = 'err'; text = a.notice; }
  else if (a.status === 'guest') { dot = 'ok'; text = 'You\'re studying as a guest. Sign in to keep your progress on every device.'; }
  else { dot = 'ok'; text = `Synced to ${a.email || a.name || 'your account'}.`; }
  return <span className="sync-status" role="status">{dot && <span className={`sync-dot ${dot}`} aria-hidden="true" />}{text}</span>;
}
