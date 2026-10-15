'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { topicKey, topicLabel, weakConcepts } from '@/lib/context';
import { timeOf } from '@/lib/util';
import { todayFor } from '@/lib/dates';
import { Icon } from './Icon';
import { ReachPicker, StudyMaterial } from './Documents';
import { EASE, SOFT, SPRING } from './motion';
import { TODO_PROMPT } from './Assistant';
import { openAssistant } from '@/lib/assistant';

/** A button that needs a second click within a few seconds, instead of a confirm() dialog. */
function useArmed(ms = 3500) {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const press = (action: () => void) => {
    if (!armed) { setArmed(true); clearTimeout(t.current); t.current = setTimeout(() => setArmed(false), ms); return; }
    clearTimeout(t.current); setArmed(false); action();
  };
  return [armed, press] as const;
}
export { useArmed };

/* ---------------- result banner ---------------- */

export function ResultBanner() {
  const T = useStudy((s) => s.timer);
  const longEvery = useStudy((s) => s.settings.longEvery);
  const r = T.lastResult;
  if (T.phase !== 'break' || !r || T.breakReason === 'manual') return null;
  const kindWord = r.kind === 'long' ? 'long break' : 'break';
  let title: string, msg: string;
  if (r.total) {
    const pct = (r.score ?? 0) / r.total;
    title = `${r.mins}-minute ${kindWord} earned`;
    msg = pct >= 1 ? 'Perfect round. Enjoy the full break.' : pct >= 0.5 ? 'Solid work. What you missed is in the plan below.' : 'Good that the gaps showed up now. Short reset, then a focused review.';
    if (r.kind === 'long') msg += ` That finishes a cycle of ${longEvery} sessions.`;
  } else {
    title = `${r.mins}-minute ${kindWord}`;
    msg = r.reason === 'short-session' ? 'You studied under half the planned time, so there was no quiz this round.'
      : r.reason === 'skipped' ? 'Session skipped, so no quiz this round.' : 'No quiz this round.';
  }
  return (
    <motion.section className="card result" id="resultBanner" aria-live="polite" key={r.at}
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: EASE }}>
      {r.total > 0 && <motion.div className="score" initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 0.12 }}>{r.score}/{r.total}</motion.div>}
      <div className="result-text"><h2>{title}</h2><p>{msg}</p></div>
      {r.items.length > 0 && (
        <div className="pills">
          {r.items.map((x, i) => <span key={i} className={`pill ${x.correct ? 'good' : 'bad'}`}><Icon name={x.correct ? 'check' : 'x'} />{x.concept}</span>)}
        </div>
      )}
      <ReachPicker />
    </motion.section>
  );
}

/* ---------------- plan ---------------- */

export function PlanCard() {
  const P = useStudy((s) => s.plan);
  const settings = useStudy((s) => s.settings);
  const aiStatus = useStudy((s) => s.aiStatus);
  const open = !settings.folded.includes('plan');
  const { retryPlan, applyPlan, toggleFold } = useStudy.getState();
  let meta = '';
  let body: React.ReactNode;
  if (P.status === 'loading') {
    meta = P.topic || '';
    body = <p className="loading-line"><span className="spin" aria-hidden="true" />Writing your plan from this quiz and your history…</p>;
  } else if (P.status === 'failed') {
    body = <><p className="muted">{P.error || 'The plan didn\'t load.'}</p>
      <div className="btn-row" style={{ marginTop: 10 }}><button className="btn" type="button" onClick={retryPlan}>Try again</button></div></>;
  } else if (P.status === 'ready' && P.data) {
    const d = P.data;
    meta = `${P.topic ? `${P.topic} · ` : ''}Suggested ${d.suggestedMinutes} min`;
    const chips = (arr: string[], cls: string) => (arr.length ? arr.map((c, i) => <span key={i} className={`pill ${cls}`}>{c}</span>) : <span className="small muted">None yet</span>);
    body = (
      <>
        {d.summary && <p className="plan-summary">{d.summary}</p>}
        <div className="plan-cols">
          <div><h3>Solid</h3><div className="pills">{chips(d.strong, 'good')}</div></div>
          <div><h3>Review next</h3><div className="pills">{chips(d.review, 'bad')}</div></div>
        </div>
        <ol className="actions">
          {d.actions.map((a, i) => (
            <li key={i} className="action"><span className="mins">{a.minutes} min</span><span><span className="tech">{a.technique}</span><span className="step">{a.step}</span></span></li>
          ))}
        </ol>
        <div className="plan-foot">
          <span className="plan-goal">{d.nextGoal && <>Next goal: <strong>{d.nextGoal}</strong></>}</span>
          <button className={`btn${P.applied ? '' : ' btn-primary'}`} type="button" disabled={!!P.applied} onClick={applyPlan}>
            {P.applied ? <><Icon name="check" />Applied</> : `Apply plan · ${d.suggestedMinutes}-min session`}
          </button>
        </div>
      </>
    );
  } else {
    const q = settings.questions;
    body = (
      <>
        <p className="muted" style={{ margin: '0 0 12px' }}>After each quiz, PomoGator writes a plan for your next session from what you got right, what you missed and your history on the topic.</p>
        {aiStatus === 'off' && <p className="qchip warn" style={{ margin: '0 0 12px' }}>Quizzes and plans aren&apos;t switched on for this site yet. The timer works without them.</p>}
        <div className="loop-steps">
          <div className="loop-step"><span className="n">1</span><b>Study</b><span>{settings.studyMin} min on your topic</span></div>
          <div className="loop-step"><span className="n">2</span><b>Quiz</b><span>{q} question{q === 1 ? '' : 's'}, with memory aids</span></div>
          <div className="loop-step"><span className="n">3</span><b>Break</b><span>{settings.tiers.short.min}–{settings.tiers.short.max} min, set by your score</span></div>
          <div className="loop-step"><span className="n">4</span><b>Plan</b><span>Steps for the next session</span></div>
        </div>
      </>
    );
  }
  // Click the heading to fold the plan away; it slides shut and open again.
  return (
    <section className={`card plan foldable${open ? '' : ' folded'}`} id="planCard" aria-label="Next-session plan">
      <div className="card-h fold-h">
        <h2><button className="fold-btn" type="button" aria-expanded={open} aria-controls="planBody" onClick={() => toggleFold('plan')}>
          Next-session plan<Icon name="chevron" /></button></h2>
        {meta && <span className="meta">{meta}</span>}
      </div>
      <div className="fold" id="planBody" inert={!open}><div className="fold-inner">{body}</div></div>
    </section>
  );
}

/* ---------------- what you're studying ---------------- */

export function ContextCard({ onManageDocs }: { onManageDocs: () => void }) {
  const c = useStudy((s) => s.context);
  const { setContext } = useStudy.getState();

  // One "what are you studying" box now: fold a subject typed in the old separate box into it.
  useEffect(() => {
    const sub = c.subject.trim();
    if (sub) setContext({ subject: '', topic: c.topic.trim() ? `${sub} · ${c.topic.trim()}` : sub });
  }, [c.subject, c.topic, setContext]);

  return (
    <section className="card side-card" id="ctxCard" aria-labelledby="ctxTitle">
      <div className="card-h"><h2 id="ctxTitle">What you&apos;re studying</h2></div>
      <form className="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor="ctxTopic">Topic</label>
        <input type="text" id="ctxTopic" placeholder="Topic, e.g. Krebs cycle" maxLength={140} value={c.topic} onChange={(e) => setContext({ topic: e.target.value })} />
        <StudyMaterial onManage={onManageDocs} />
        {c.goal.trim() && (
          <p className="goal-tag" id="ctxGoal"><Icon name="flag" /><span>{c.goal}</span>
            <button type="button" aria-label="Clear this goal" onClick={() => setContext({ goal: '' })}><Icon name="x" /></button></p>
        )}
        {c.notes.trim() && (
          <p className="hint">Notes you pasted earlier are still used in quizzes. <button className="btn-link" type="button" onClick={() => setContext({ notes: '' })}>Remove them</button></p>
        )}
      </form>
    </section>
  );
}

/* ---------------- tasks ---------------- */

export function TasksCard() {
  const tasks = useStudy((s) => s.tasks);
  const { addTask, toggleTask, deleteTask, clearDone, resetTasks } = useStudy.getState();
  const [text, setText] = useState('');
  const [armed, press] = useArmed();
  const done = tasks.filter((t) => t.done).length;
  return (
    <section className="card side-card" id="tasksCard" aria-labelledby="tasksTitle">
      <div className="card-h"><h2 id="tasksTitle">To-do</h2>
        <span className="meta">{tasks.length ? `${done} of ${tasks.length} done` : ''}</span>
        <button className="btn-quiet plan-ai" type="button" onClick={() => openAssistant(TODO_PROMPT)}><Icon name="sparkle" />Plan with AI</button>
      </div>
      <form className="task-add" onSubmit={(e) => { e.preventDefault(); addTask(text); setText(''); }}>
        <label className="sr-only" htmlFor="taskInput">New task</label>
        <input type="text" id="taskInput" placeholder="Add a task (N)" maxLength={160} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit">Add</button>
      </form>
      <ul className="task-list">
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <motion.li key={t.id} className={`task${t.done ? ' done' : ''}`} layout="position"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 28, transition: { duration: 0.2 } }} transition={SOFT}>
              <input type="checkbox" id={`task-${t.id}`} checked={t.done} onChange={(e) => toggleTask(t.id, e.target.checked)} />
              <label className="t" htmlFor={`task-${t.id}`}>{t.text}</label>
              <button className="x" type="button" aria-label="Delete task" onClick={() => deleteTask(t.id)}><Icon name="x" /></button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!tasks.length && <li className="empty">Add what you want to get through today.</li>}
      </ul>
      <div className="task-foot">
        <button className="btn-quiet" type="button" onClick={clearDone}>Clear completed</button>
        <button className="btn-quiet" type="button" onClick={() => tasks.length && press(resetTasks)}>{armed ? 'Click again to reset' : 'Reset list'}</button>
      </div>
    </section>
  );
}

/* ---------------- today ---------------- */

const RESULT_WORDS: Record<string, string> = { skipped: 'skipped', 'too-short': 'short', unavailable: 'no quiz', 'no-topic': 'no quiz' };

export function TodayCard() {
  const history = useStudy((s) => s.history);
  const stats = useStudy((s) => s.stats);
  const context = useStudy((s) => s.context);
  const D = useStudy((s) => s.day);
  const aiStatus = useStudy((s) => s.aiStatus);
  const settingsTz = useStudy((s) => s.settings);
  const today = todayFor(settingsTz);
  const list = history.filter((s) => s.date === today);
  const studied = list.reduce((a, s) => a + (s.studiedMin || 0), 0);
  const quizzed = list.filter((s) => s.quiz?.total);
  const avg = quizzed.length ? Math.round((quizzed.reduce((a, s) => a + (s.quiz!.score ?? 0) / s.quiz!.total!, 0) / quizzed.length) * 100) : null;
  const breaks = list.reduce((a, s) => a + (s.breakMin || 0), 0);
  const weak = weakConcepts(stats, topicKey(context), 5);
  const sumHere = D.date === today;
  const ul = (a: string[]) => (a.length ? <ul>{a.map((x, i) => <li key={i}>{x}</li>)}</ul> : null);

  return (
    <section className="card side-card today" id="todayCard" aria-labelledby="todayTitle">
      <div className="card-h"><h2 id="todayTitle">Today</h2><span className="meta">{new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>
      <div className="stats">
        <div className="stat"><b>{list.length}</b><span>session{list.length === 1 ? '' : 's'}</span></div>
        <div className="stat"><b>{Math.round(studied)}</b><span>minutes studied</span></div>
        <div className="stat"><b>{avg == null ? '—' : `${avg}%`}</b><span>average quiz score</span></div>
        <div className="stat"><b>{breaks}</b><span>break minutes earned</span></div>
      </div>
      {weak.length > 0 && (
        <>
          <h3>Review next{context.topic ? ` · ${context.topic}` : ''}</h3>
          <div className="chips">{weak.map((c) => <span key={c.concept} className="pill bad" title={`Missed ${c.missed} of ${c.seen}`}>{c.concept} · {c.missed}/{c.seen}</span>)}</div>
        </>
      )}
      {list.length ? (
        <>
          <h3>Log</h3>
          <ul className="log">
            {list.slice().reverse().slice(0, 8).map((s) => {
              const res = s.quiz?.total ? `${s.quiz.score}/${s.quiz.total}` : RESULT_WORDS[s.quiz?.status || ''] || '—';
              return (
                <li key={s.id}>
                  <span className="when">{timeOf(s.startedAt)}</span>
                  <span className="what" title={topicLabel(s)}>{topicLabel(s) || 'Untitled session'} · {Math.round(s.studiedMin || 0)}m</span>
                  <span className="res">{res}{s.breakMin ? ` · ${s.breakMin}m` : ''}</span>
                </li>
              );
            })}
          </ul>
          {aiStatus !== 'off' && (
            <button className="btn" type="button" disabled={sumHere && D.status === 'loading'} onClick={() => useStudy.getState().summarizeDay()}>
              {sumHere && D.status === 'ready' ? 'Refresh day summary' : 'Summarize my day'}
            </button>
          )}
        </>
      ) : <p className="empty">No sessions yet today. Your first one shows up here.</p>}
      {sumHere && D.status === 'loading' && <div className="day-sum"><p className="loading-line"><span className="spin" aria-hidden="true" />Summarizing your day…</p></div>}
      {sumHere && D.status === 'failed' && <div className="day-sum"><p className="muted">{D.error}</p></div>}
      {sumHere && D.status === 'ready' && D.data && (
        <div className="day-sum">
          <h4>{D.data.headline}</h4>
          {D.data.wins.length > 0 && <div><h3>Went well</h3>{ul(D.data.wins)}</div>}
          {D.data.gaps.length > 0 && <div><h3>Still shaky</h3>{ul(D.data.gaps)}</div>}
          {D.data.tomorrow.length > 0 && <div><h3>Tomorrow</h3>{ul(D.data.tomorrow)}</div>}
        </div>
      )}
    </section>
  );
}
