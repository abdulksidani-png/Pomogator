'use client';
import { useEffect, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { useStudy, quizReadyForTaking, remainingAt, type Store } from '@/lib/store';
import { useNow } from '@/lib/now';
import { Sound } from '@/lib/sound';
import { Icon, IconSprite } from './Icon';
import { Stage, TitleSync } from './Stage';
import { ContextCard, PlanCard, ResultBanner, TasksCard } from './Panels';
import { HelpDialog, SettingsDialog } from './Dialogs';
import { AccountButton, ProfileDialog, SignInDialog, SyncStatus } from './Account';
import { recheckAccount, startSync } from '@/lib/sync';
import { stopWatching } from '@/lib/docs/screen';
import { AppearanceDialog, useAppearance } from './Appearance';
import { DocumentsDialog, ScreenConsentDialog } from './Documents';
import { signInWithGoogle } from '@/lib/auth';
import { SPRING } from './motion';
import { AssistantButton, AssistantPanel } from './Assistant';
import { MusicCard } from './Music';
import { StatsView } from './Stats';
import { WeekReviewBanner, WeeklyView } from './Weekly';
import { fmt } from '@/lib/util';
import { PhotoCredit } from './PhotoPicker';
import { BrandMark, BrandName } from './Brand';
import { CelebrationHost, StreakPills } from './Streaks';
import { Tour } from './Tour';
import { FriendsCard, FriendsDialog, SocialHost, SupportPopup } from './Friends';
import { InviteBanner, RoomPanel, TogetherDialog } from './Together';
import { SITE } from '@/lib/site';
import { openAssistant } from '@/lib/assistant';
import { exitFocus, toggleFocus, useFocusMode, watchFullscreen } from '@/lib/focus';

/** The ambience that should be playing for the current timer state. */
const desiredAmbience = (s: Store) =>
  s.timer.status !== 'running' ? 'none' : s.timer.phase === 'study' ? s.settings.ambStudy : s.timer.phase === 'break' ? s.settings.ambBreak : 'none';

type View = 'timer' | 'stats' | 'weekly';
const viewFromUrl = (): View => (window.location.pathname.startsWith('/stats') ? 'stats' : window.location.pathname.startsWith('/weekly') ? 'weekly' : 'timer');
const PATHS: Record<View, string> = { timer: '/', stats: '/stats', weekly: '/weekly' };

export default function PomoGatorApp({ initialView = 'timer' }: { initialView?: View }) {
  // Timer and Stats are two pages of one app, so a running session carries on while you look at stats.
  const [view, setView] = useState<View>(initialView);
  const viewRef = useRef(view);
  viewRef.current = view;
  const go = useRef((v: View, query = '') => {
    if (v === viewRef.current && !query) return;
    window.history.pushState(null, '', PATHS[v] + query);
    setView(v);
    setViewKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }).current;
  const [viewKey, setViewKey] = useState(0);
  useEffect(() => {
    const back = () => setView(viewFromUrl());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const loop = useStudy((s) => s.settings.loop);
  const ambience = useStudy(desiredAmbience);
  const wantWake = useStudy((s) => s.settings.wake && s.timer.status === 'running');
  const settingsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const signInRef = useRef<HTMLDialogElement>(null);
  const profileRef = useRef<HTMLDialogElement>(null);
  const lookRef = useRef<HTMLDialogElement>(null);
  const docsRef = useRef<HTMLDialogElement>(null);
  const friendsRef = useRef<HTMLDialogElement>(null);
  const [friendCode, setFriendCode] = useState('');
  const openFriends = (code = '') => { setFriendCode(code); friendsRef.current?.showModal(); };
  const [togetherWith, setTogetherWith] = useState<string | null>(null);
  const screenRef = useRef<HTMLDialogElement>(null);
  const studyLive = useStudy((s) => s.timer.phase === 'study' && !!s.timer.session);
  const focus = useFocusMode((s) => s.on);
  const focusMusic = useStudy((s) => s.settings.focusMusic);
  useAppearance();

  // Full-screen timer: the page shows only the timer (and the music widget, unless hidden).
  useEffect(() => watchFullscreen(), []);
  useEffect(() => {
    const el = document.documentElement;
    if (focus) { el.dataset.focus = 'on'; if (!focusMusic) el.dataset.focusMusic = 'off'; else delete el.dataset.focusMusic; }
    else { delete el.dataset.focus; delete el.dataset.focusMusic; }
  }, [focus, focusMusic]);
  useEffect(() => { if (view !== 'timer') exitFocus(); }, [view]);

  /** Start/pause/resume, with a short sound. Screen sharing only starts from its own button. */
  const togglePlay = useRef(() => {
    const s = useStudy.getState();
    const before = s.timer.status;
    s.toggle();
    if (s.settings.controlSounds) Sound.cue(before === 'running' ? 'pause' : before === 'paused' ? 'resume' : 'start', s.settings.chimeVol);
  }).current;

  // Screen tracking ends with the session: never during breaks or quizzes.
  // Sharing can start before a session; it stops when that session ends.
  const wasLive = useRef(studyLive);
  useEffect(() => { if (wasLive.current && !studyLive) stopWatching(); wasLive.current = studyLive; }, [studyLive]);

  // After an email link was opened in another tab, coming back here picks up the sign-in.
  useEffect(() => {
    const onFocus = () => { if (useStudy.getState().account.pendingEmail) void recheckAccount(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // The app is on screen: fade the splash out, keeping it up for at least ~0.9 s after the page started loading.
  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty('--splash-delay', `${Math.max(0, 0.9 - performance.now() / 1000).toFixed(2)}s`);
    el.dataset.ready = '1';
  }, []);

  // Boot once: recover an expired timer, check whether AI is available.
  useEffect(() => {
    void useStudy.getState().boot();
    startSync();
    void import('@/lib/ai/digest').then((m) => m.loadSavedDigests());
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
      showToast('That Google account already has PomoGator. Signing you in to it…');
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
      if (t?.closest?.('.assistant, .timer-menu')) return; // keys pressed inside the chat panel or a menu belong to it
      if (document.querySelector('dialog[open]')) return;
      const s = useStudy.getState();
      const k = e.key;
      const onButton = t?.tagName === 'BUTTON';
      if (viewRef.current !== 'timer') { // on the Stats page only the help and assistant keys apply
        if (k === '?') helpRef.current?.showModal();
        else if (k === 'a' || k === 'A') { e.preventDefault(); openAssistant(); }
        return;
      }
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
      else if (k === 'a' || k === 'A') { e.preventDefault(); openAssistant(); }
      else if (k === 'f' || k === 'F') { e.preventDefault(); toggleFocus(); }
      else if (k === 'Escape' && useFocusMode.getState().on) exitFocus();
      else if ((k === 'n' || k === 'N') && !useFocusMode.getState().on) { e.preventDefault(); document.getElementById('taskInput')?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <IconSprite />
      <TitleSync />
      <div className="app">
        <header className="top">
          <div className="brand">
            <BrandMark />
            <BrandName />
            <span className="brand-tag">{SITE.tagline}</span>
          </div>
          <div className="top-actions">
            <StreakPills onClick={() => go('stats')} />
            {view !== 'timer' ? <TimerPill onClick={() => go('timer')} /> : (
              <button className="chip-btn stats-btn" type="button" onClick={() => go('stats')} title="Your stats"><Icon name="chart" /><span>Stats</span></button>
            )}
            <AccountButton onSignIn={() => signInRef.current?.showModal()} onProfile={() => profileRef.current?.showModal()} />
            <button className="chip-btn loop-btn" type="button" aria-pressed={loop} title="Loop: start each phase automatically (L)" onClick={() => useStudy.getState().setLoop(!loop)}>
              <Icon name="loop" /><span>Loop</span>
            </button>
            <button className="icon-btn" type="button" aria-label="Appearance" title="Appearance" onClick={() => lookRef.current?.showModal()}><Icon name="palette" /></button>
            <button className="icon-btn help-btn" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => helpRef.current?.showModal()}><Icon name="kbd" /></button>
            <button className="icon-btn" type="button" aria-label="Settings" title="Settings" onClick={() => settingsRef.current?.showModal()}><Icon name="gear" /></button>
          </div>
        </header>
        {view === 'stats' ? <main className="stats-main"><StatsView onBack={() => go('timer')} onWeekly={() => go('weekly')} /></main>
          : view === 'weekly' ? <main className="stats-main"><WeeklyView key={viewKey} onBack={() => go('timer')} onStats={() => go('stats')} /></main> : (
        <main className="desk">
          <div className="col-main">
            <WeekReviewBanner onOpen={(w) => go('weekly', `?week=${w}`)} />
            <InviteBanner />
            <RoomPanel />
            <Stage onToggle={togglePlay} onScreenConsent={() => screenRef.current?.showModal()} />
            <ResultBanner />
            <PlanCard />
          </div>
          <aside className="col-side">
            <MusicCard />
            <ContextCard onManageDocs={() => docsRef.current?.showModal()} />
            <TasksCard />
            <FriendsCard onSignIn={() => signInRef.current?.showModal()} onOpen={() => openFriends()} onTogether={(id) => setTogetherWith(id)} />
          </aside>
        </main>
        )}
        <footer className="foot">
          <SyncStatus />
          <BgCredit />
          <span className="foot-links">Press <kbd>?</kbd> for shortcuts · <a href="/privacy">Privacy</a> · <a href={SITE.repo} target="_blank" rel="noreferrer">Source</a> · <span className="build" title="Version">v{process.env.NEXT_PUBLIC_BUILD}</span></span>
        </footer>
      </div>
      <SettingsDialog dialogRef={settingsRef} onSignIn={() => signInRef.current?.showModal()} onAppearance={() => lookRef.current?.showModal()} />
      <AppearanceDialog dialogRef={lookRef} />
      <DocumentsDialog dialogRef={docsRef} />
      <ScreenConsentDialog dialogRef={screenRef} />
      <HelpDialog dialogRef={helpRef} />
      <SignInDialog dialogRef={signInRef} />
      <FriendsDialog dialogRef={friendsRef} code={friendCode} />
      <SocialHost onOpenFriends={(c) => openFriends(c)} />
      <SupportPopup />
      <TogetherDialog friendId={togetherWith} onClose={() => setTogetherWith(null)} />
      <ProfileDialog dialogRef={profileRef} />
      <AssistantButton />
      <AssistantPanel />
      <Toast />
      {view === 'timer' && <Tour />}
      <CelebrationHost onBadges={() => { go('stats'); setTimeout(() => document.getElementById('badgesCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250); }} />
      <Announcer />
    </MotionConfig>
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
  return (
    <div className="toast-wrap">
      <motion.div className={`toast${shown ? ' show' : ''}`} role="status" aria-live="polite" initial={false}
        animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 18, scale: 0.96 }} transition={SPRING}>
        <motion.span key={toast?.id} style={{ display: 'inline-block' }} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>{toast?.msg}</motion.span>
      </motion.div>
    </div>
  );
}

function Announcer() {
  const a = useStudy((s) => s.announce);
  return <div className="sr-only" aria-live="assertive">{a?.msg}</div>;
}

/** Unsplash asks that the photographer be credited wherever their photo shows. */
function BgCredit() {
  const photo = useStudy((s) => (s.settings.background === 'unsplash' ? s.settings.bgPhoto : null));
  return photo ? <PhotoCredit photo={photo} /> : null;
}

/** On the Stats page: the running timer in a small pill that leads back to it. */
function TimerPill({ onClick }: { onClick: () => void }) {
  const T = useStudy((s) => s.timer);
  const now = useNow((s) => s.now);
  const live = T.phase === 'quiz' || T.status !== 'idle';
  const what = T.phase === 'quiz' ? 'Quiz time' : `${fmt(remainingAt(T, now))} ${T.phase === 'study' ? 'study' : 'break'}${T.status === 'paused' ? ' (paused)' : ''}`;
  return (
    <button className={`chip-btn timer-pill${live ? ' live' : ''}`} type="button" onClick={onClick} title="Back to the timer">
      <Icon name={T.status === 'running' ? 'play' : 'reset'} /><span>{live ? what : 'Timer'}</span>
    </button>
  );
}
