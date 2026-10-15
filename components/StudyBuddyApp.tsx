'use client';
import { useEffect, useRef, useState } from 'react';
import { useStudy, quizReadyForTaking, type Store } from '@/lib/store';
import { useNow } from '@/lib/now';
import { Sound } from '@/lib/sound';
import { Icon, IconSprite } from './Icon';
import { Stage, TitleSync } from './Stage';
import { ContextCard, PlanCard, ResultBanner, TasksCard, TodayCard } from './Panels';
import { HelpDialog, SettingsDialog } from './Dialogs';
import { AccountButton, ProfileDialog, SignInDialog, SyncStatus } from './Account';
import { recheckAccount, startSync } from '@/lib/sync';
import { maybeAskOnStart, stopWatching } from '@/lib/docs/screen';
import { AppearanceDialog, useAppearance } from './Appearance';
import { DocumentsDialog, ScreenConsentDialog } from './Documents';
import { signInWithGoogle } from '@/lib/auth';

/** The ambience that should be playing for the current timer state. */
const desiredAmbience = (s: Store) =>
  s.timer.status !== 'running' ? 'none' : s.timer.phase === 'study' ? s.settings.ambStudy : s.timer.phase === 'break' ? s.settings.ambBreak : 'none';

export default function StudyBuddyApp() {
  const loop = useStudy((s) => s.settings.loop);
  const ambience = useStudy(desiredAmbience);
  const wantWake = useStudy((s) => s.settings.wake && s.timer.status === 'running');
  const settingsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const signInRef = useRef<HTMLDialogElement>(null);
  const profileRef = useRef<HTMLDialogElement>(null);
  const lookRef = useRef<HTMLDialogElement>(null);
  const docsRef = useRef<HTMLDialogElement>(null);
  const screenRef = useRef<HTMLDialogElement>(null);
  const studyLive = useStudy((s) => s.timer.phase === 'study' && !!s.timer.session);
  useAppearance();

  /** Start/pause; starting a new session can also ask to share the slides window (needs the click). */
  const togglePlay = useRef(() => {
    const before = useStudy.getState().timer;
    useStudy.getState().toggle();
    if (before.phase === 'study' && before.status === 'idle') maybeAskOnStart(() => screenRef.current?.showModal());
  }).current;

  // Screen tracking ends with the session: never during breaks or quizzes.
  useEffect(() => { if (!studyLive) stopWatching(); }, [studyLive]);

  // After an email link was opened in another tab, coming back here picks up the sign-in.
  useEffect(() => {
    const onFocus = () => { if (useStudy.getState().account.pendingEmail) void recheckAccount(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Boot once: recover an expired timer, check whether AI is available.
  useEffect(() => {
    void useStudy.getState().boot();
    startSync();
    // Messages left in the address bar by the sign-in callback.
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const err = p.get('auth_error'), next = p.get('auth_next'), ok = p.get('signed_in');
    if (err !== null || next || ok) {
      ['auth_error', 'auth_next', 'signed_in'].forEach((k) => p.delete(k));
      window.history.replaceState(null, '', url.pathname + (p.size ? `?${p}` : '') + url.hash);
    }
    const { showToast } = useStudy.getState();
    if (err) showToast(err);
    if (ok) showToast('Signed in. Your progress is synced.');
    if (next === 'google') {
      showToast('That Google account already has StudyBuddy. Signing you in to it…');
      signInWithGoogle({ link: false }).catch((e: Error) => showToast(e.message));
    }
  }, []);

  // One ticker drives the clock and phase changes.
  useEffect(() => {
    const beat = () => { useNow.setState({ now: Date.now() }); useStudy.getState().tick(); };
    const id = setInterval(beat, 250);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', beat); };
  }, []);

  // Audio: browsers need a first gesture, then ambience follows the timer.
  useEffect(() => {
    const resync = () => { const s = useStudy.getState(); Sound.sync(desiredAmbience(s), s.settings.ambVol); };
    Sound.setOnResume(resync);
    const unlock = () => { Sound.ensure(); resync(); };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => { Sound.sync(ambience, useStudy.getState().settings.ambVol); }, [ambience]);

  // Keep the screen awake while the timer runs, if asked and allowed.
  useEffect(() => {
    if (!wantWake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible' || lock) return;
      try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); if (cancelled) void lock.release(); } catch { lock = null; }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', request); void lock?.release().catch(() => {}); };
  }, [wantWake]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      const s = useStudy.getState();
      const k = e.key;
      const onButton = t?.tagName === 'BUTTON';
      if (s.timer.phase === 'quiz') {
        if (s.quiz.step === 'question' && quizReadyForTaking(s.quiz) && k.length === 1) {
          let i = '1234'.indexOf(k);
          if (i < 0) i = 'abcd'.indexOf(k.toLowerCase());
          if (i >= 0) { e.preventDefault(); s.answer(i); return; }
        }
        if (k === 'Enter' && s.quiz.step === 'feedback' && !onButton) { e.preventDefault(); s.nextQ(); return; }
      }
      if (k === ' ' || k === 'Spacebar') { if (onButton) return; e.preventDefault(); if (s.timer.phase !== 'quiz') togglePlay(); }
      else if (k === 'r' || k === 'R') s.reset();
      else if (k === 's' || k === 'S') s.skip();
      else if (k === 'd' || k === 'D') s.markDone();
      else if (k === '+' || k === '=') s.addFive();
      else if (k === 'l' || k === 'L') s.setLoop(!s.settings.loop);
      else if (k === '?') helpRef.current?.showModal();
      else if (k === 'n' || k === 'N') { e.preventDefault(); document.getElementById('taskInput')?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <IconSprite />
      <TitleSync />
      <div className="app">
        <header className="top">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="21" r="15" fill="none" stroke="var(--rule)" strokeWidth="4" />
              <path d="M20 6a15 15 0 0 1 14.6 18.3" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
              <path d="M13.5 21.5l4.5 4.5 8.5-9" fill="none" stroke="var(--fg)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="brand-name">StudyBuddy</span>
            <span className="brand-tag">Study, quiz yourself, earn your break</span>
          </div>
          <div className="top-actions">
            <AccountButton onSignIn={() => signInRef.current?.showModal()} onProfile={() => profileRef.current?.showModal()} />
            <button className="chip-btn" type="button" aria-pressed={loop} title="Loop: start each phase automatically (L)" onClick={() => useStudy.getState().setLoop(!loop)}>
              <Icon name="loop" /><span>Loop</span>
            </button>
            <button className="icon-btn" type="button" aria-label="Appearance" title="Appearance" onClick={() => lookRef.current?.showModal()}><Icon name="palette" /></button>
            <button className="icon-btn help-btn" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => helpRef.current?.showModal()}><Icon name="kbd" /></button>
            <button className="icon-btn" type="button" aria-label="Settings" title="Settings" onClick={() => settingsRef.current?.showModal()}><Icon name="gear" /></button>
          </div>
        </header>
        <main className="desk">
          <div className="col-main">
            <Stage onToggle={togglePlay} onScreenConsent={() => screenRef.current?.showModal()} />
            <ResultBanner />
            <PlanCard />
          </div>
          <aside className="col-side">
            <ContextCard onManageDocs={() => docsRef.current?.showModal()} />
            <TasksCard />
            <TodayCard />
          </aside>
        </main>
        <footer className="foot">
          <SyncStatus />
          <span>Press <kbd>?</kbd> for shortcuts</span>
        </footer>
      </div>
      <SettingsDialog dialogRef={settingsRef} onSignIn={() => signInRef.current?.showModal()} onAppearance={() => lookRef.current?.showModal()} />
      <AppearanceDialog dialogRef={lookRef} />
      <DocumentsDialog dialogRef={docsRef} />
      <ScreenConsentDialog dialogRef={screenRef} />
      <HelpDialog dialogRef={helpRef} />
      <SignInDialog dialogRef={signInRef} />
      <ProfileDialog dialogRef={profileRef} />
      <Toast />
      <Announcer />
    </>
  );
}

function Toast() {
  const toast = useStudy((s) => s.toast);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  return <div className={`toast${shown ? ' show' : ''}`} role="status" aria-live="polite">{toast?.msg}</div>;
}

function Announcer() {
  const a = useStudy((s) => s.announce);
  return <div className="sr-only" aria-live="assertive">{a?.msg}</div>;
}
