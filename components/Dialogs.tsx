'use client';
import { useEffect, useState, type RefObject } from 'react';
import { useStudy } from '@/lib/store';
import { PRESETS, DEFAULT_SETTINGS } from '@/lib/defaults';
import { AMBIENCE, CHIMES, Sound } from '@/lib/sound';
import { clamp } from '@/lib/util';
import type { Difficulty, Level, Tier } from '@/lib/types';
import { supabaseConfigured } from '@/lib/supabase/env';
import { signOut } from '@/lib/sync';
import { screenSupported, stopWatching } from '@/lib/docs/screen';
import { Icon } from './Icon';
import { useArmed } from './Panels';
import { siteConfig } from '@/lib/config';
import { connectSpotify, disconnectSpotify, useSpotify } from '@/lib/spotify';

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
  const ctx = useStudy((st) => st.context);
  const [logArmed, pressLog] = useArmed();
  const { updateSettings, setStudyMin, setLoop, clearHistory, showToast, setContext } = useStudy.getState();
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
        {!supabaseConfigured() && (
          <fieldset>
            <legend>Account</legend>
            <p className="hint">Sign-in isn&apos;t set up on this copy of the site, so everything is saved in this browser only. (The site owner needs to add the Supabase keys in Vercel.)</p>
          </fieldset>
        )}
        {supabaseConfigured() && (
          <fieldset>
            <legend>Account</legend>
            <div className="set-row">
              <span className="field-label">
                {account.status === 'user' ? 'Signed in' : account.status === 'guest' ? 'Studying as a guest' : 'Not connected'}
                <span className="sub">{account.status === 'user' ? (account.email || account.name) : 'Nothing to sign out of yet. Sign in to keep your progress on every device'}</span>
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
          <div className="set-row"><label htmlFor="ctxLevel">Your level<span className="sub">Questions are pitched at this level</span></label>
            <select id="ctxLevel" style={{ width: 'auto', minWidth: 180 }} value={ctx.level} onChange={(e) => setContext({ level: e.target.value as Level })}>
              <option value="hs">High school</option>
              <option value="intro">Intro college</option>
              <option value="advanced">Advanced college</option>
              <option value="exam">Exam prep</option>
            </select>
          </div>
          {ctx.level === 'exam' && (
            <div className="set-row"><label htmlFor="ctxExam">Which exam?</label>
              <input type="text" id="ctxExam" style={{ width: 'auto', minWidth: 180 }} placeholder="e.g. MCAT, AP Chemistry" maxLength={60} value={ctx.exam} onChange={(e) => setContext({ exam: e.target.value })} />
            </div>
          )}
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
          <div className="set-row">
            <label htmlFor="ctlSounds">Start and pause sounds<span className="sub">A soft click when the timer starts, pauses or resumes</span></label>
            <input type="checkbox" className="switch" id="ctlSounds" checked={s.controlSounds}
              onChange={(e) => { const v = e.target.checked; updateSettings((x) => { x.controlSounds = v; }); if (v) Sound.cue('start', s.chimeVol); }} />
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
                <label htmlFor="scrEvery">Check every<span className="sub">Only changed screens are read</span></label>
                <span className="inline">
                  <input type="range" id="scrEvery" min={1} max={15} step={1} value={s.screenSec} onChange={(e) => { const v = Number(e.target.value); updateSettings((x) => { x.screenSec = v; }); }} />
                  <span className="small muted" style={{ minWidth: 36 }}>{s.screenSec} s</span>
                </span>
              </div>
              <div className="set-row">
                <label htmlFor="scrAudio">Also capture the tab&apos;s sound<span className="sub">For video lectures: what&apos;s said becomes notes for your quiz, on this device. Takes effect the next time you share.</span></label>
                <input type="checkbox" className="switch" id="scrAudio" checked={s.screenAudio} onChange={(e) => { const v = e.target.checked; updateSettings((x) => { x.screenAudio = v; }); }} />
              </div>
            </>
          )}
          <div className="set-row">
            <span className="field-label">Tracking logs<span className="sub">The slide numbers and titles read during past sessions</span></span>
            <button className="btn" type="button" onClick={() => pressLog(() => useStudy.getState().clearSeen('all'))}>{logArmed ? 'Click again to delete' : 'Delete all logs'}</button>
          </div>
        </fieldset>

        <MusicSettings />

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
  [['A'], 'Open the study assistant'],
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

/** Settings → Music: the Spotify widget and the connection. Hidden when the site has no Spotify app. */
function MusicSettings() {
  const show = useStudy((s) => s.settings.musicWidget);
  const linked = useSpotify((s) => s.linked);
  const [on, setOn] = useState(false);
  useEffect(() => { void siteConfig().then((c) => setOn(!!c.spotifyClientId)); }, []);
  if (!on) return null;
  return (
    <fieldset>
      <legend>Music</legend>
      <div className="set-row">
        <label htmlFor="musicToggle">Spotify widget<span className="sub">Shows what&apos;s playing, with back, play-pause and next</span></label>
        <input type="checkbox" className="switch" id="musicToggle" checked={show} onChange={(e) => { const v = e.target.checked; useStudy.getState().updateSettings((x) => { x.musicWidget = v; }); }} />
      </div>
      <div className="set-row">
        <span className="field-label">Spotify account<span className="sub">{linked ? 'Connected on this device' : 'Not connected. Controls need Spotify Premium.'}</span></span>
        {linked
          ? <button className="btn" type="button" onClick={disconnectSpotify}>Disconnect</button>
          : <button className="btn" type="button" onClick={() => { void connectSpotify(); }}>Connect Spotify</button>}
      </div>
      {!linked && <RedirectUri />}
    </fieldset>
  );
}

/** The exact address to paste into the Spotify app's "Redirect URIs" (it must match character for character). */
function RedirectUri() {
  const uri = typeof window === 'undefined' ? '' : `${window.location.origin}/spotify`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="set-row stack">
      <span className="field-label">Redirect URI for your Spotify app<span className="sub">If Spotify says &ldquo;redirect_uri: Not matching configuration&rdquo;, paste this into your app&apos;s Redirect URIs.</span></span>
      <span className="inline copy-row">
        <code id="spotifyRedirect">{uri}</code>
        <button className="btn" type="button" onClick={() => { void navigator.clipboard?.writeText(uri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>{copied ? 'Copied' : 'Copy'}</button>
      </span>
    </div>
  );
}
