'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy, remainingAt, quizReadyForTaking } from '@/lib/store';
import { useNow, focusContext } from '@/lib/now';
import { nextBreakKind, tierRows, tierSentence } from '@/lib/breaks';
import { ctxKey, hasTopic, topicLabel } from '@/lib/context';
import { MIN, clamp, fmt } from '@/lib/util';
import { Icon } from './Icon';
import { Mascot, type Mood } from './Mascot';
import { DocProgress, ScreenTracker } from './Documents';
import { EASE, SOFT, SPRING } from './motion';

export function Stage({ onToggle, onScreenConsent }: { onToggle: () => void; onScreenConsent: () => void }) {
  const phase = useStudy((s) => s.timer.phase);
  const status = useStudy((s) => s.timer.status);
  const entered = useRef(false);
  useEffect(() => { entered.current = true; }, []);
  return (
    <section className="card stage" id="stage" data-phase={phase} data-status={status} aria-label="Timer">
      {/* The new face glides in. No exit step: the quiz must never wait on an animation. */}
      <motion.div key={phase === 'quiz' ? 'quiz' : 'timer'} initial={entered.current ? { opacity: 0, y: 14, filter: 'blur(6px)' } : false}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.38, ease: EASE }}>
        {phase === 'quiz' ? <QuizFace /> : <TimerFace onToggle={onToggle} onScreenConsent={onScreenConsent} />}
      </motion.div>
    </section>
  );
}

/* ---------------- timer face ---------------- */

function TimerFace({ onToggle, onScreenConsent }: { onToggle: () => void; onScreenConsent: () => void }) {
  const T = useStudy((s) => s.timer);
  const settings = useStudy((s) => s.settings);
  const { reset, skip, addFive, markDone, switchMode } = useStudy.getState();
  const style = settings.timerStyle;
  const N = settings.longEvery;
  const running = T.status === 'running';

  let eyebrow = '';
  let sub = '';
  if (T.phase === 'study') {
    eyebrow = `Study session ${Math.min(T.cycleDone + 1, N)} of ${N}`;
    sub = running ? 'Focus. A quick quiz comes at the end.' : T.status === 'paused' ? 'Paused' : `${Math.round(T.totalMs / MIN)}-minute focus session`;
  } else {
    eyebrow = T.breakKind === 'long' ? 'Long break' : 'Short break';
    sub = running
      ? T.breakKind === 'long' ? 'Cycle complete. Get up, stretch, drink water.' : 'Look away from the screen and move a little.'
      : T.status === 'paused' ? 'Paused' : `${Math.round(T.totalMs / MIN)}-minute break ready`;
  }

  let mood: Mood = 'idle';
  if (T.phase === 'study' && running) mood = 'focus';
  else if (T.phase === 'break') mood = T.lastResult?.total && T.lastResult.score === T.lastResult.total ? 'happy' : running ? 'rest' : 'cheer';

  const activeMode = T.phase === 'study' ? 'study' : T.breakKind;
  const startLabel = running ? 'Pause' : T.status === 'paused' ? 'Resume' : T.phase === 'break' ? 'Start break' : 'Start studying';

  return (
    <div id="timerFace">
      <div className="modes" role="group" aria-label="Timer mode">
        {(['study', 'short', 'long'] as const).map((m) => (
          <button key={m} className="mode" type="button" aria-pressed={activeMode === m} disabled={T.status !== 'idle'} onClick={() => switchMode(m)}>
            {activeMode === m && <motion.span className="mode-pill" layoutId="modePill" transition={SPRING} aria-hidden="true" />}
            <span className="mode-label">{m === 'study' ? 'Study' : m === 'short' ? 'Short break' : 'Long break'}</span>
          </button>
        ))}
      </div>
      <div className="clock-row">
        <div className="mascot-wrap" aria-hidden="true"><Mascot mood={mood} kind={settings.mascotKind} /></div>
        {style === 'ring' ? (
          <div className="timer-ring">
            <RingProgress />
            <div className="clock-col">
              <p className="eyebrow">{eyebrow}</p>
              <Clock />
              <p className="clock-sub">{sub}</p>
            </div>
          </div>
        ) : (
          <div className="clock-col">
            <p className="eyebrow">{eyebrow}</p>
            <Clock />
            <p className="clock-sub">{sub}</p>
          </div>
        )}
      </div>
      {style === 'classic' && <Ruler />}
      <div className="controls">
        <button className="icon-btn" type="button" aria-label="Reset timer" title="Reset (R)" disabled={T.status === 'idle' && T.remainingMs === T.totalMs} onClick={reset}><Icon name="reset" /></button>
        <motion.button className="btn btn-primary start-btn" id="startBtn" type="button" aria-label={`${startLabel} (Space)`} onClick={onToggle}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} transition={SPRING}>
          <motion.span key={running ? 'pause' : 'play'} className="start-icon" initial={{ scale: 0.4, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={SPRING}>
            <Icon name={running ? 'pause' : 'play'} />
          </motion.span>
          <span>{startLabel}</span>
        </motion.button>
        <button className="icon-btn" type="button" aria-label="Skip to the next phase" title="Skip (S)" disabled={T.phase === 'study' && T.status === 'idle' && !T.session} onClick={skip}><Icon name="skip" /></button>
      </div>
      <div className="controls-2">
        <button className="btn-quiet" type="button" title="Add 5 minutes and keep going (+)" onClick={addFive}><Icon name="plus" />5 min</button>
        {T.phase === 'study' && (
          <button className="btn-quiet" type="button" title="End the session now and take the quiz (D)" disabled={!T.session} onClick={markDone}><Icon name="flag" />Finish session now</button>
        )}
      </div>
      <DocProgress />
      <ScreenTracker onConsent={onScreenConsent} />
      <StageFoot />
    </div>
  );
}

function RingProgress() {
  const T = useStudy((s) => s.timer);
  const now = useNow((s) => s.now);
  const r = 46, C = 2 * Math.PI * r;
  const done = clamp(1 - remainingAt(T, now) / (T.totalMs || 1), 0, 1);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle className="track" cx="50" cy="50" r={r} fill="none" strokeWidth="5" />
      <circle className="bar" cx="50" cy="50" r={r} fill="none" strokeWidth="5" strokeDasharray={C} strokeDashoffset={C * (1 - done)} />
    </svg>
  );
}

function Clock() {
  const T = useStudy((s) => s.timer);
  const now = useNow((s) => s.now);
  const rem = remainingAt(T, now);
  const text = fmt(rem);
  const secs = Math.ceil(rem / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  return (
    <div className="clock" role="timer" aria-live="off" aria-label={`${m} minute${m === 1 ? '' : 's'} ${s} second${s === 1 ? '' : 's'} left`}>
      {[...text].map((ch, i) => (ch === ':' ? <span key={i} className="c">:</span> : <span key={i} className="d">{ch}</span>))}
    </div>
  );
}

/** Keeps the browser tab title showing the time left. */
export function TitleSync() {
  const T = useStudy((s) => s.timer);
  const now = useNow((s) => s.now);
  const text = fmt(remainingAt(T, now));
  const label = T.phase === 'study' ? 'Study' : T.phase === 'break' ? (T.breakKind === 'long' ? 'Long break' : 'Break') : 'Quiz';
  const title = T.phase === 'quiz' ? 'Quiz time · StudyBuddy'
    : T.status === 'idle' ? 'StudyBuddy'
    : `${text} ${label}${T.status === 'paused' ? ' (paused)' : ''} · StudyBuddy`;
  useEffect(() => { if (document.title !== title) document.title = title; }, [title]);
  return null;
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 560);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 560);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

function Ruler() {
  const totalMs = useStudy((s) => s.timer.totalMs);
  const narrow = useNarrow();
  const M = Math.max(1, Math.round(totalMs / MIN));
  const marks = useMemo(() => {
    const step = M <= 10 ? 1 : M <= 30 ? 5 : M <= 60 ? (narrow ? 10 : 5) : 10;
    const minorEvery = M > 60 ? 5 : 1;
    const out: { left: number; major: boolean; label?: number }[] = [];
    for (let m = 0; m <= M; m += minorEvery) {
      const showLabel = m % step === 0 && (M - m >= step / 2 || m === M);
      out.push({ left: (m / M) * 100, major: m % step === 0 || m === M, label: showLabel ? m : undefined });
    }
    if (M % step !== 0) out.push({ left: 100, major: true, label: M });
    return out;
  }, [M, narrow]);
  return (
    <div className="ruler" aria-hidden="true">
      <div className="ruler-track"><RulerFill /></div>
      <div className="ruler-ticks">
        {marks.map((t, i) => (
          <span key={i}>
            <span className={`tick${t.major ? ' major' : ''}`} style={{ left: `${t.left}%` }} />
            {t.label !== undefined && <span className="tick-label" style={{ left: `${t.left}%` }}>{t.label}</span>}
          </span>
        ))}
        <span className="ruler-unit">min</span>
      </div>
    </div>
  );
}

function RulerFill() {
  const T = useStudy((s) => s.timer);
  const now = useNow((s) => s.now);
  const pct = clamp((1 - remainingAt(T, now) / (T.totalMs || 1)) * 100, 0, 100);
  return <div className="ruler-fill" style={{ width: `${pct}%` }} />;
}

function StageFoot() {
  const T = useStudy((s) => s.timer);
  const settings = useStudy((s) => s.settings);
  const context = useStudy((s) => s.context);
  const Q = useStudy((s) => s.quiz);
  const aiStatus = useStudy((s) => s.aiStatus);
  const N = settings.longEvery;
  const topic = hasTopic(context);

  const cycText = T.phase === 'break' && T.breakKind === 'long' && T.breakReason !== 'manual' ? 'Cycle complete'
    : T.phase === 'study' && N - T.cycleDone <= 1 ? 'Long break after this session' : `Long break after session ${N}`;
  const kind = T.phase === 'break' ? T.breakKind : nextBreakKind(T.cycleDone, N);
  const n = settings.questions;

  let chip: React.ReactNode = null;
  if (T.phase === 'study') {
    const key = ctxKey(context, settings);
    if (!topic) chip = <span className="qchip">No quiz without a topic</span>;
    else if (aiStatus === 'off') chip = <span className="qchip warn">Quizzes aren&apos;t switched on yet</span>;
    else if (Q.gen === 'loading') chip = <span className="qchip"><span className="spin" aria-hidden="true" />Writing your quiz…</span>;
    else if (Q.gen === 'ready' && !Q.used && Q.ctxKey === key) chip = <span className="qchip good"><Icon name="check" />Quiz ready · {Q.questions.length} question{Q.questions.length === 1 ? '' : 's'}</span>;
    else if (Q.gen === 'ready' && !Q.used && T.session) chip = <span className="qchip warn">Topic changed · quiz updates near the end</span>;
    else if (Q.gen === 'failed' && T.session) chip = <span className="qchip warn">Quiz didn&apos;t load <button className="btn-link" type="button" onClick={() => useStudy.getState().retryQuiz()}>Try again</button></span>;
    else chip = <span className="qchip">Quiz is written when you start</span>;
  }

  return (
    <div className="stage-foot">
      <div className="foot-row">
        <div className="cycle">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: N }, (_, i) => (
              <span key={i} className={`dot${i < T.cycleDone ? ' on' : ''}${i === T.cycleDone && T.phase === 'study' ? ' now' : ''}`} />
            ))}
          </span>
          <span>{cycText}</span>
          <span className="sr-only">{T.cycleDone} of {N} sessions done in this cycle</span>
        </div>
        <div>{chip}</div>
      </div>
      <div className="foot-row">
        <div className="studying">
          {topic ? (
            <>Studying <strong>{topicLabel(context) || 'from your notes'}</strong>{' '}
              <button className="btn-link" type="button" onClick={() => focusContext(true)}>Edit</button></>
          ) : (
            <>What are you studying? <button className="btn-link" type="button" onClick={() => focusContext(false)}>Add a topic</button> to get a quiz.</>
          )}
        </div>
        <div className="tiers">
          <span>{kind === 'long' ? 'Long break' : 'Break'} by score</span>
          {tierRows(n, settings.tiers[kind]).map((r) => <span key={r.score} className="tier">{r.score}/{n} → {r.mins}m</span>)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- quiz face ---------------- */

const LETTERS = 'ABCD';

function QuizFace() {
  const T = useStudy((s) => s.timer);
  const Q = useStudy((s) => s.quiz);
  const settings = useStudy((s) => s.settings);
  const context = useStudy((s) => s.context);
  const aiStatus = useStudy((s) => s.aiStatus);
  const act = useStudy.getState();

  // Move focus to the next thing to press, unless the person is typing somewhere else.
  useEffect(() => {
    requestAnimationFrame(() => {
      const ae = document.activeElement;
      const stage = document.getElementById('stage');
      if (ae && ae !== document.body && stage && !stage.contains(ae)) return;
      const target = Q.step === 'feedback'
        ? document.getElementById('qNext')
        : document.getElementById('qBegin') || stage?.querySelector<HTMLButtonElement>('.opt:not(:disabled)');
      target?.focus({ preventScroll: true });
    });
  }, [Q.step, Q.index, Q.gen]);

  const topic = Q.forTopic || topicLabel(context) || 'your notes';
  const studied = T.session ? Math.round(T.session.studiedMin || 0) : 0;
  const breakNone = settings.tiers[T.breakKind].none;
  const kindWord = T.breakKind === 'long' ? 'long break' : 'break';
  const head = <div className="q-head"><span className="q-num">SESSION COMPLETE</span><span className="q-concept">{studied} min studied</span></div>;
  const skipBtn = <button className="btn" type="button" onClick={act.skipQuiz}>Skip quiz · {breakNone}-min {kindWord}</button>;
  const plural = (n: number) => (n === 1 ? '' : 's');

  if (!quizReadyForTaking(Q)) {
    let body: React.ReactNode;
    if (!hasTopic(context)) {
      body = (<div className="q-intro"><h2>What did you study?</h2><p>Add a subject or topic and StudyBuddy writes your quiz now.</p>
        <div className="btn-row"><button className="btn btn-primary" type="button" onClick={() => focusContext(false)}>Add a topic</button>{skipBtn}</div></div>);
    } else if (Q.gen === 'loading') {
      body = (<div className="q-intro"><h2>Writing {settings.questions} question{plural(settings.questions)} on {topic}</h2>
        <p className="loading-line"><span className="spin" aria-hidden="true" />Thinking…</p><p>This usually takes a few seconds.</p><div className="btn-row">{skipBtn}</div></div>);
    } else if (Q.gen === 'failed' || Q.gen === 'off' || aiStatus === 'off') {
      const canRetry = Q.gen === 'failed' && aiStatus !== 'off';
      body = (<div className="q-intro"><h2>No quiz this round</h2><p>{Q.error || 'Quizzes aren\'t switched on for this site yet. The timer works without them.'}</p>
        <div className="btn-row">
          {canRetry && <button className="btn btn-primary" type="button" onClick={act.retryQuiz}>Try again</button>}
          <button className={`btn${canRetry ? '' : ' btn-primary'}`} type="button" id="qBegin" onClick={act.skipQuiz}>Take a {breakNone}-min {kindWord}</button>
        </div></div>);
    } else {
      body = (<div className="q-intro"><h2>Quiz on {topic}?</h2><p>StudyBuddy writes {settings.questions} question{plural(settings.questions)} from what you entered.</p>
        <div className="btn-row"><button className="btn btn-primary" type="button" id="qBegin" onClick={act.retryQuiz}>Write my quiz</button>{skipBtn}</div></div>);
    }
    return <div className="qcard">{head}{body}</div>;
  }

  if (Q.step === 'intro') {
    const n = Q.questions.length;
    return (
      <div className="qcard">{head}
        <div className="q-intro">
          <h2>Time&apos;s up. {n} quick question{plural(n)} on {topic}.</h2>
          <p>Your score sets your {kindWord}: {tierSentence(n, settings.tiers[T.breakKind])}</p>
          <div className="btn-row">
            <button className="btn btn-primary" type="button" id="qBegin" onClick={act.beginQuiz}>Start quiz</button>
            <button className="btn" type="button" onClick={act.addFive}><Icon name="plus" />5 more minutes</button>
            <button className="btn-quiet" type="button" onClick={act.skipQuiz}>Skip quiz</button>
          </div>
        </div>
      </div>
    );
  }

  const q = Q.questions[Q.index];
  const a = Q.answers[Q.index];
  const n = Q.questions.length;
  const last = Q.index === n - 1;
  const anyAnswered = Q.answers.some(Boolean);
  return (
    <motion.div className="qcard" key={`q${Q.index}`} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={SOFT}>
      <div className="q-head">
        <span className="q-num">Q{Q.index + 1} / {n}</span>
        <span className="q-concept">{q.concept}</span>
        <span className="q-progress" aria-hidden="true">
          {Q.questions.map((_, i) => {
            const ans = Q.answers[i];
            return <motion.span key={i} layout className={ans ? (ans.correct ? 'good' : 'bad') : i === Q.index ? 'now' : ''} transition={SPRING} />;
          })}
        </span>
      </div>
      <p className="q-text" id="qText">{q.question}</p>
      <div className="opts" role="group" aria-labelledby="qText">
        {q.options.map((o, i) => {
          let cls = 'opt';
          let mark: React.ReactNode = null;
          if (a) {
            if (i === q.correctIndex) { cls += ' is-correct'; mark = <span className="mark"><Icon name="check" /></span>; }
            else if (i === a.chosen) { cls += ' is-wrong'; mark = <span className="mark"><Icon name="x" /></span>; }
            else cls += ' is-dim';
          }
          const wrong = !!a && i === a.chosen && !a.correct;
          const right = !!a && i === q.correctIndex;
          return (
            <motion.button key={i} className={cls} type="button" disabled={!!a} aria-label={`${LETTERS[i]}: ${o}`} onClick={() => act.answer(i)}
              initial={{ opacity: 0, y: 10 }}
              animate={wrong ? { opacity: 1, y: 0, x: [0, -7, 7, -4, 4, 0] } : right && a ? { opacity: 1, y: 0, scale: [1, 1.025, 1] } : { opacity: 1, y: 0 }}
              transition={a ? { duration: 0.42, ease: EASE } : { ...SOFT, delay: 0.05 + i * 0.05 }}
              whileHover={a ? undefined : { x: 3 }} whileTap={a ? undefined : { scale: 0.985 }}>
              <span className="key">{LETTERS[i]}</span><span>{o}</span>{mark}
            </motion.button>
          );
        })}
      </div>
      {a && (
        <motion.div className="fb" aria-live="polite" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
          <p className={`verdict ${a.correct ? 'good' : 'bad'}`}>{a.correct ? 'Correct.' : `Not quite. The answer is ${LETTERS[q.correctIndex]}.`}</p>
          {q.explanation && <p>{q.explanation}</p>}
          {!a.correct && q.optionFeedback[a.chosen] && <p className="why"><strong>Why not {LETTERS[a.chosen]}:</strong> {q.optionFeedback[a.chosen]}</p>}
          {q.memoryAid && <div className="aid"><div className="aid-label">{a.correct ? 'Lock it in' : 'Memory aid'}</div>{q.memoryAid}</div>}
        </motion.div>
      )}
      <div className="q-actions">
        <button className="btn-quiet" type="button" onClick={() => (anyAnswered ? act.finishQuiz(true) : act.skipQuiz())}>
          {anyAnswered ? 'End quiz and score what I answered' : 'Skip quiz'}
        </button>
        {a
          ? <button className="btn btn-primary" type="button" id="qNext" onClick={act.nextQ}>{last ? 'Finish and start break' : 'Next question'}</button>
          : <span className="small muted">Press 1–4 to answer</span>}
      </div>
    </motion.div>
  );
}
