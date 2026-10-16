'use client';
/**
 * The first-time tour: your study buddy points at each part of the page in turn. It opens once per
 * account (and per device) for someone brand new, can be skipped at any step, and can be taken again
 * from the keyboard shortcuts dialog.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { MASCOTS } from '@/lib/appearance';
import type { Mood } from './Mascot';
import type { MascotKind } from '@/lib/types';
import { MyBuddy } from './Shop';
import { SOFT, SPRING } from './motion';

/** This device has seen (or skipped) the tour. */
const SEEN = 'studybuddy.tour';
const seenHere = () => { try { return !!localStorage.getItem(SEEN); } catch { return false; } };

const useTourRun = create<{ open: boolean }>(() => ({ open: false }));
/** Take the tour again (from the shortcuts dialog). */
export const startTour = () => useTourRun.setState({ open: true });

interface Step { id: string; target?: string; title: string; text: string; mood: Mood }

function steps(buddy: string, signedIn: boolean): Step[] {
  return [
    { id: 'hi', title: `Hi, I'm ${buddy}!`, text: 'I\'ll be your study buddy. Want a one-minute tour of how PomoGator works?', mood: 'cheer' },
    { id: 'topic', target: '#ctxCard', title: 'Tell me what you\'re studying', text: 'Type a topic, or upload your slides, notes or a photo. Set a goal like "up to slide 12" and I\'ll quiz you on just that.', mood: 'idle' },
    { id: 'start', target: '#startBtn', title: 'Start a focus session', text: '25 minutes by default. Pause any time with Space, or switch on Loop to run sessions back to back.', mood: 'focus' },
    { id: 'quiz', target: '#stage', title: 'Earn your break', text: 'When the timer ends, answer 1–3 quick questions. 3/3 earns a 15-minute break, 2/3 earns 10, and every answer comes with a memory tip.', mood: 'quiz' },
    { id: 'tasks', target: '#tasksCard', title: 'Your to-do list', text: 'Add what you need to get through today, or press "Plan with AI" to turn it all into study sessions.', mood: 'idle' },
    { id: 'friends', target: '#friendsCard', title: 'Study with friends', text: 'Add friends with your friend code, see who\'s studying, send a little encouragement, or start a session together.', mood: 'happy' },
    { id: 'assistant', target: '.assistant-fab', title: 'Ask me anything', text: 'The study assistant explains things, summarizes your slides, reads photos of your notes and quizzes you.', mood: 'happy' },
    { id: 'streak', target: '#streakPills', title: 'Keep your streak going', text: 'Check in each day to grow your streak and earn badges. Click it to see your stats and weekly report.', mood: 'cheer' },
    { id: 'points', target: '#pointsBtn', title: 'Earn study points', text: 'Check-ins and long sessions without skipping earn points. Spend them in the buddy shop on hats, sunglasses and more.', mood: 'happy' },
    { id: 'look', target: '[aria-label="Appearance"]', title: 'Make it yours', text: 'Themes, clock fonts, photo backgrounds, and which buddy studies with you.', mood: 'happy' },
    ...(signedIn ? [] : [{ id: 'account', target: '#accountBtn', title: 'Save your progress', text: 'You\'re studying as a guest. Sign in with Google or email to keep everything on every device and add friends.', mood: 'idle' as Mood }]),
    { id: 'end', title: 'You\'re all set!', text: 'Pick a topic and press Start. I\'ll be right here.', mood: 'cheer' },
  ];
}

export function Tour() {
  const tour = useStudy((s) => s.tour);
  const fresh = useStudy((s) => s.history.length === 0 && s.checkins.length === 0);
  const status = useStudy((s) => s.account.status);
  const kind = useStudy((s) => s.settings.mascotKind);
  const buddyOn = useStudy((s) => s.settings.mascot !== 'off');
  const idle = useStudy((s) => s.timer.status === 'idle' && s.timer.phase !== 'quiz');
  const open = useTourRun((s) => s.open);
  const [i, setI] = useState(0);

  // Open by itself once for someone brand new, after sign-in has settled (another device may have seen it).
  useEffect(() => {
    if (open || tour || !fresh || !idle || status === 'connecting' || seenHere()) return;
    const t = setTimeout(() => { if (!useStudy.getState().tour && !seenHere()) { setI(0); useTourRun.setState({ open: true }); } }, 1200);
    return () => clearTimeout(t);
  }, [open, tour, fresh, idle, status]);

  const all = steps(MASCOTS.find((m) => m.id === kind)?.name ?? 'your buddy', status === 'user')
    .filter((s) => !s.target || typeof document === 'undefined' || !!document.querySelector(s.target)?.getClientRects().length); // hidden on phones = skipped
  const step = all[Math.min(i, all.length - 1)];

  const finish = useCallback((how: 'done' | 'skipped') => {
    useTourRun.setState({ open: false });
    setI(0);
    try { localStorage.setItem(SEEN, how); } catch { /* private window */ }
    useStudy.getState().mutate((d) => { d.tour = how; });
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish('skipped'); }
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, all.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open, all.length, finish]);

  if (!open || !step) return null;
  const last = i >= all.length - 1;
  return (
    <TourStep key={step.id} step={step} n={i} total={all.length} last={last} kind={kind} buddyOn={buddyOn}
      onNext={() => (last ? finish('done') : setI(i + 1))} onBack={() => setI(Math.max(0, i - 1))} onSkip={() => finish('skipped')} />
  );
}

interface Box { top: number; left: number; width: number; height: number }

function TourStep({ step, n, total, last, kind, buddyOn, onNext, onBack, onSkip }: {
  step: Step; n: number; total: number; last: boolean; kind: MascotKind; buddyOn: boolean;
  onNext: () => void; onBack: () => void; onSkip: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    // On phones the card docks at the bottom, so the highlighted part goes near the top.
    if (el) {
      const small = window.innerWidth < 560;
      el.scrollIntoView({ block: small ? 'start' : 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
      if (small) window.scrollBy({ top: -20, behavior: 'instant' as ScrollBehavior });
    }
    const measure = () => {
      setVw(window.innerWidth);
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      const pad = 8;
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step.target]);

  useEffect(() => { card.current?.querySelector<HTMLButtonElement>('.tour-next')?.focus({ preventScroll: true }); }, [step.id]);

  // The card sits under the highlighted part if it fits, else above it; on phones it docks at the bottom.
  const phone = vw > 0 && vw < 560;
  const W = Math.min(360, (vw || 360) - 24);
  let style: React.CSSProperties = {};
  if (box && !phone) {
    const h = window.innerHeight;
    const below = box.top + box.height + 14;
    const top = below + 240 < h ? below : Math.max(12, box.top - 14 - 240);
    const left = Math.min(Math.max(12, box.left + box.width / 2 - W / 2), window.innerWidth - W - 12);
    style = { top, left, width: W };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
      {box
        ? <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" />
        : <div className="tour-dim" aria-hidden="true" />}
      <motion.div ref={card} className={`tour-card${box && !phone ? '' : ' centered'}${phone ? ' docked' : ''}`} style={style}
        initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SOFT}>
        <div className="tour-head">
          {buddyOn && (
            <motion.span className="tour-buddy" aria-hidden="true" initial={{ scale: 0.8, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING}>
              <MyBuddy mood={step.mood} kind={kind} />
            </motion.span>
          )}
          <div>
            <p className="tour-count">{n === 0 ? 'Welcome' : `${n} of ${total - 1}`}</p>
            <h2 id="tourTitle">{step.title}</h2>
          </div>
        </div>
        <p id="tourText" className="tour-text">{step.text}</p>
        <div className="tour-dots" aria-hidden="true">{Array.from({ length: total }, (_, k) => <i key={k} data-on={k === n ? '1' : undefined} />)}</div>
        <div className="tour-actions">
          <button className="btn-quiet tour-skip" type="button" onClick={onSkip}>{last ? 'Close' : 'Skip tour'}</button>
          <span className="tour-nav">
            {n > 0 && !last && <button className="btn" type="button" onClick={onBack}>Back</button>}
            <button className="btn btn-primary tour-next" type="button" onClick={onNext}>{n === 0 ? 'Show me around' : last ? 'Let\'s study' : 'Next'}</button>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
