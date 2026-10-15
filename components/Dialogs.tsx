'use client';
import { useState, type RefObject } from 'react';
import { useStudy } from '@/lib/store';
import { PRESETS, DEFAULT_SETTINGS } from '@/lib/defaults';
import { AMBIENCE, CHIMES, Sound } from '@/lib/sound';
import { clamp } from '@/lib/util';
import type { Difficulty, Tier } from '@/lib/types';
import { supabaseConfigured } from '@/lib/supabase/env';
import { signOut } from '@/lib/sync';
import { screenSupported, stopWatching } from '@/lib/docs/screen';
import { Icon } from './Icon';
import { useArmed } from './Panels';

function DialogHead({ id, title, close }: { id: string; title: string; close: () => void }) {
  return (
    <div className="dlg-head">
      <h2 id={id}>{title}</h2>
      <button className="icon-btn" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={close}><Icon name="x" /></button>
    </div>
  );
}

const closeOnBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === e.currentTarget) e.currentTarget.close(); };

export function SettingsDialog({ dialogRef, onSignIn, onAppearance }: {
  dialogRef: RefObject<HTMLDialogElement | null>; onSignIn: () => void; onAppearance: () => void;
}) {
  const s = useStudy((st) => st.settings);
  const account = useStudy((st) => st.account);
  const [logArmed, pressLog] = useArmed();
  const { updateSettings, setStudyMin, setLoop, clearHistory, showToast } = useStudy.getState();
  const [previewing, setPreviewing] = useState(false);
  const [notifyNote, setNotifyNote] = useState('Pop up a notice when a phase ends');
  const [armed, press] = useArmed();
  const close = () => dialogRef.current?.close();
  const isPreset = PRESETS.includes(s.studyMin);

  const setTier = (kind: 'short' | 'long', key: keyof Tier, raw: string) =>
    updateSettings((x) => { x.tiers[kind][key] = clamp(Math.round(Number(raw)) || DEFAULT_SETTINGS.tiers[kind][key], 1, 90); });

  const onNotify = async (on: boolean) => {
    if (!on) { updateSettings((x) => { x.notify = false; }); setNotifyNote('Pop up a notice when a phase ends'); return; }
    let ok = false;
    try { if ('Notification' in window) ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted'; } catch { ok = false; }
    updateSettings((x) => { x.notify = ok; });
    setNotifyNote(ok ? 'On. You\'ll get a notice when a phase ends.' : 'Your browser blocked notifications for this site. The chime and tab title still mark each phase.');
  };

  return (
    <dialog ref={dialogRef} id="settingsDlg" aria-labelledby="setTitle" onClick={closeOnBackdrop}>
      <DialogHead id="setTitle" title="Settings" close={close} />
      <div className="dlg-body">
        {supabaseConfigured() && (
          <fieldset>
            <legend>Account</legend>
            <div className="set-row">
              <span className="field-label">
                {account.status === 'user' ? 'Signed in' : account.status === 'guest' ? 'Studying as a guest' : 'Not connected'}
                <span className="sub">{account.status === 'user' ? (account.email || account.name) : 'Sign in to keep your progress on every device'}</span>
              </span>
              {account.status === 'user'
                ? <button className="btn" type="button" onClick={() => { close(); void signOut(); }}>Sign out</button>
                : <button className="btn btn-primary" type="button" disabled={account.status === 'connecting'} onClick={() => { close(); onSignIn(); }}>Sign in</button>}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>Timer</legend>
          <div className="field"><span className="field-label" id="lenLabel">Study session length</span>
            <div className="seg" role="group" aria-labelledby="lenLabel">
              {PRESETS.map((m) => <button key={m} type="button" aria-pressed={s.studyMin === m} onClick={() => setStudyMin(m)}>{m} min</button>)}
              <span className="inline">
                <label className="sr-only" htmlFor="customMin">Custom length in minutes</label>
                <input type="number" id="customMin" min={1} max={90} step={1} placeholder="Custom" key={s.studyMin}
                  defaultValue={isPreset ? '' : s.studyMin}
                  onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1) setStudyMin(v); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <span className="small muted">custom</span>
              </span>
            </div>
            <p className="hint">A custom length can be 1–90 minutes. Use 1 to try the full loop quickly.</p>
          </div>
          <div className="set-row">
            <label htmlFor="longEvery">Long break after every<span className="sub">study sessions that reach at least half their time</span></label>
            <span className="inline">
              <input type="number" id="longEvery" min={2} max={8} step={1} style={{ width: 84 }} key={s.longEvery} defaultValue={s.longEvery}
                onBlur={(e) => updateSettings((x) => { x.longEvery = clamp(Math.round(Number(e.target.value)) || 4, 2, 8); })} />
              <span className="small muted">sessions</span>
            </span>
          </div>
          <div className="set-row">
            <label htmlFor="loopToggle">Loop<span className="sub">Start the quiz, the break and the next session automatically</span></label>
            <input type="checkbox" className="switch" id="loopToggle" checked={s.loop} onChange={(e) => setLoop(e.target.checked)} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Breaks you earn</legend>
          <p className="hint" style={{ marginTop: -6 }}>Your quiz score sets the break, in minutes. &quot;No quiz&quot; applies when you skip the quiz, study less than half the session, or quizzes can&apos;t load.</p>
          <div className="tier-wrap">
            <table className="tier-table">
              <thead><tr><th scope="col" /><th scope="col">100%</th><th scope="col">50–99%</th><th scope="col">Below 50%</th><th scope="col">No quiz</th></tr></thead>
              <tbody>
                {(['short', 'long'] as const).map((kind) => (
                  <tr key={kind}>
                    <td>{kind === 'short' ? 'Short break' : 'Long break'}</td>
                    {(['max', 'mid', 'min', 'none'] as const).map((key) => (
                      <td key={key}>
                        <input type="number" min={1} max={90} key={`${kind}${key}${s.tiers[kind][key]}`} defaultValue={s.tiers[kind][key]}
                          aria-label={`${kind === 'short' ? 'Short' : 'Long'} break, ${{ max: '100%', mid: '50 to 99%', min: 'below 50%', none: 'no quiz' }[key]}`}
                          onBlur={(e) => setTier(kind, key, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <fieldset>
          <legend>Quiz</legend>
          <div className="set-row"><span className="field-label" id="qnLabel">Questions per quiz</span>
            <div className="seg" role="group" aria-labelledby="qnLabel">
              {[1, 2, 3].map((q) => <button key={q} type="button" aria-pressed={s.questions === q} onClick={() => updateSettings((x) => { x.questions = q; })}>{q}</button>)}
            </div>
          </div>
          <div className="set-row"><span className="field-label" id="diffLabel">Difficulty</span>
            <div className="seg" role="group" aria-labelledby="diffLabel">
              {(['gentle', 'standard', 'challenging'] as Difficulty[]).map((d) => (
                <button key={d} type="button" aria-pressed={s.difficulty === d} onClick={() => updateSettings((x) => { x.difficulty = d; })}>{d[0].toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Sound</legend>
          <div className="set-row"><label htmlFor="chimeSel">End-of-phase chime</label>
            <span className="inline">
              <select id="chimeSel" value={s.chime} onChange={(e) => { const v = e.target.value; updateSettings((x) => { x.chime = v; }); Sound.chime(v, s.chimeVol); }}>
                {Object.entries(CHIMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn" type="button" onClick={() => Sound.chime(s.chime, s.chimeVol)}><Icon name="sound" />Test</button>
            </span>
          </div>
          <div className="set-row"><label htmlFor="chimeVol">Chime volume</label>
            <input type="range" id="chimeVol" min={0} max={1} step={0.05} value={s.chimeVol}
              onChange={(e) => { const v = Number(e.target.value); updateSettings((x) => { x.chimeVol = v; }); }}
              onPointerUp={() => Sound.chime(s.chime, useStudy.getState().settings.chimeVol)} />
          </div>
          {(['ambStudy', 'ambBreak'] as const).map((k) => (
            <div className="set-row" key={k}>
              <label htmlFor={k}>{k === 'ambStudy' ? 'Study ambience' : 'Break ambience'}<span className="sub">{k === 'ambStudy' ? 'Plays while a study session runs' : 'Plays while a break runs'}</span></label>
              <select id={k} style={{ width: 'auto', minWidth: 180 }} value={s[k]} onChange={(e) => { const v = e.target.value; Sound.ensure(); updateSettings((x) => { x[k] = v; }); }}>
                {Object.entries(AMBIENCE).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}
              </select>
            </div>
          ))}
          <div className="set-row"><label htmlFor="ambVol">Ambience volume</label>
            <span className="inline">
              <input type="range" id="ambVol" min={0} max={1} step={0.05} value={s.ambVol}
                onChange={(e) => { const v = Number(e.target.value); updateSettings((x) => { x.ambVol = v; }); Sound.setAmbVol(v); }} />
              <button className="btn" type="button" disabled={previewing} onClick={() => {
                setPreviewing(true);
                Sound.preview(s.ambStudy !== 'none' ? s.ambStudy : s.ambBreak, s.ambVol, () => setPreviewing(false));
              }}>{previewing ? 'Playing…' : 'Preview'}</button>
            </span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Appearance</legend>
          <div className="set-row">
            <span className="field-label">Look and feel<span className="sub">Theme, accent color, clock font, timer style, background, corners, spacing</span></span>
            <button className="btn" type="button" onClick={() => { close(); onAppearance(); }}><Icon name="palette" />Customize</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Screen tracking</legend>
          {!screenSupported() && <p className="hint" style={{ marginTop: -6 }}>Needs a desktop browser (Chrome, Edge, Firefox or Safari). On this device, set how far you got at the end of each session.</p>}
          <div className="set-row">
            <label htmlFor="scrToggle">Track my slides from the screen<span className="sub">Reads the window you share, on this device, to see which slide you&apos;re on</span></label>
            <input type="checkbox" className="switch" id="scrToggle" checked={s.screenTrack} onChange={(e) => { const v = e.target.checked; updateSettings((x) => { x.screenTrack = v; }); if (!v) stopWatching(); }} />
          </div>
          {s.screenTrack && (
            <>
              <div className="set-row">
                <label htmlFor="scrAsk">Ask to share when a session starts<span className="sub">Otherwise, use &ldquo;Track my slides&rdquo; on the timer</span></label>
                <input type="checkbox" className="switch" id="scrAsk" checked={s.screenAskOnStart} onChange={(e) => { const v = e.target.checked; updateSettings((x) => { x.screenAskOnStart = v; }); }} />
              </div>
              <div className="set-row">
                <label htmlFor="scrEvery">Look every<span className="sub">Only changed screens are read</span></label>
                <span className="inline">
                  <input type="range" id="scrEvery" min={10} max={60} step={5} value={s.screenEvery} onChange={(e) => { const v = Number(e.target.value); updateSettings((x) => { x.screenEvery = v; }); }} />
                  <span className="small muted" style={{ minWidth: 36 }}>{s.screenEvery} s</span>
                </span>
              </div>
            </>
          )}
          <div className="set-row">
            <span className="field-label">Tracking logs<span className="sub">The slide numbers and titles read during past sessions</span></span>
            <button className="btn" type="button" onClick={() => pressLog(() => useStudy.getState().clearSeen('all'))}>{logArmed ? 'Click again to delete' : 'Delete all logs'}</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Extras</legend>
          <div className="set-row">
            <label htmlFor="notifyToggle">Browser notifications<span className="sub">{notifyNote}</span></label>
            <input type="checkbox" className="switch" id="notifyToggle" checked={s.notify} onChange={(e) => void onNotify(e.target.checked)} />
          </div>
          <div className="set-row">
            <label htmlFor="wakeToggle">Keep screen awake<span className="sub">While the timer runs, if your device allows it</span></label>
            <input type="checkbox" className="switch" id="wakeToggle" checked={s.wake} onChange={(e) => {
              const on = e.target.checked;
              updateSettings((x) => { x.wake = on; });
              if (on && !('wakeLock' in navigator)) showToast('This device doesn\'t support keeping the screen awake.');
            }} />
          </div>
          <div className="set-row">
            <span className="field-label">History<span className="sub">Sessions, quiz stats and plans, here and in your account</span></span>
            <button className="btn" type="button" onClick={() => press(clearHistory)}>{armed ? 'Click again to clear' : 'Clear history'}</button>
          </div>
        </fieldset>
      </div>
      <div className="dlg-foot"><button className="btn btn-primary" type="button" onClick={close}>Done</button></div>
    </dialog>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Start or pause the timer'],
  [['R'], 'Reset the current timer'],
  [['S'], 'Skip to the next phase'],
  [['D'], 'Finish the study session now and take the quiz'],
  [['+'], 'Add 5 minutes and keep going'],
  [['L'], 'Turn Loop on or off'],
  [['1', '2', '3', '4'], 'Pick an answer during a quiz (A–D work too)'],
  [['Enter'], 'Next question'],
  [['N'], 'Add a task'],
  [['?'], 'Show this list'],
];

export function HelpDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog ref={dialogRef} id="helpDlg" aria-labelledby="helpTitle" onClick={closeOnBackdrop}>
      <DialogHead id="helpTitle" title="Keyboard shortcuts" close={() => dialogRef.current?.close()} />
      <div className="dlg-body">
        <dl className="kbd-list">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what} style={{ display: 'contents' }}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
