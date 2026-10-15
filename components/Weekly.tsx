'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { todayFor } from '@/lib/dates';
import { DEFINITIONS, WEEKDAYS, addDays, weekStartOf } from '@/lib/stats';
import { plainSummary, reportSig, unseenLastWeek, weekReport, weeklyInput, weeksWithStudy, type WeekReport } from '@/lib/weekly';
import { AI } from '@/lib/ai-client';
import { aiErrorText } from '@/lib/quiz';
import { saveShareCard } from '@/lib/share-card';
import type { WeeklyAi } from '@/lib/types';
import { Bars, Columns, Def, Heatmap, SLOT_NAMES, StatsTabs, dayName, hm, shortDate, useTip } from './Stats';
import { Icon } from './Icon';
import { SOFT } from './motion';

export const weekLabel = (start: string) => `${shortDate(start)} – ${shortDate(addDays(start, 6))}`;

const weekFromUrl = () => {
  const w = new URLSearchParams(window.location.search).get('week') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : '';
};

/** The weekly report: a summary, key numbers vs. last week, charts, documents, concepts and focus steps. */
export function WeeklyView({ onBack, onStats }: { onBack: () => void; onStats: () => void }) {
  const history = useStudy((s) => s.history);
  const docs = useStudy((s) => s.docs);
  const settings = useStudy((s) => s.settings);
  const saved = useStudy((s) => s.weekly);
  const aiStatus = useStudy((s) => s.aiStatus);
  const { saveWeekly, markWeekSeen, addTasks, showToast } = useStudy.getState();
  const today = todayFor(settings);
  const thisWeek = weekStartOf(today, settings.weekStart);
  const [week, setWeek] = useState(() => { const w = weekFromUrl(); return w ? weekStartOf(w > today ? today : w, settings.weekStart) : thisWeek; });
  const weeks = useMemo(() => weeksWithStudy(history, today, settings.weekStart), [history, today, settings.weekStart]);
  const checkins = useStudy((s) => s.checkins);
  const r = useMemo(() => weekReport({ history, docs, week, today, weekStartDay: settings.weekStart, timezone: settings.timezone, freezes: settings.streakFreeze, checkins }),
    [history, docs, week, today, settings.weekStart, settings.timezone, settings.streakFreeze, checkins]);

  // Keep the address in step, so a week can be bookmarked or reopened.
  useEffect(() => {
    const url = week === thisWeek ? '/weekly' : `/weekly?week=${week}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url);
    if (week < thisWeek) markWeekSeen(week);
  }, [week, thisWeek, markWeekSeen]);

  // The AI summary: written once per week, rewritten only when asked (or when a past week's numbers changed).
  const sig = reportSig(r);
  const mine = saved[r.start];
  const [ai, setAi] = useState<{ status: 'idle' | 'loading' | 'failed'; error?: string }>({ status: 'idle' });
  const ctl = useRef<AbortController | null>(null);
  const write = async () => {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setAi({ status: 'loading' });
    try {
      const data: WeeklyAi = await AI.weekly(weeklyInput(r), c.signal);
      if (c !== ctl.current) return;
      saveWeekly(r.start, { ...data, sig, at: Date.now() });
      setAi({ status: 'idle' });
    } catch (e) {
      if (c !== ctl.current || (e as { code?: string })?.code === 'cancelled') return;
      setAi({ status: 'failed', error: aiErrorText(e) });
    }
  };
  useEffect(() => {
    setAi({ status: 'idle' });
    if (aiStatus !== 'on' || r.empty) return;
    if (!mine || (!r.inProgress && mine.sig !== sig)) void write();
    return () => ctl.current?.abort();
  }, [r.start, aiStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const plain = plainSummary(r);
  const headline = mine?.headline || plain.headline;
  const summary = mine?.summary || plain.summary;
  const focus = mine?.focus?.length ? mine.focus : r.focus;
  const stale = !!mine && mine.sig !== sig;
  const idx = weeks.indexOf(week);
  const older = weeks[idx + 1] ?? (idx < 0 ? weeks.find((w) => w < week) : undefined);
  const newer = idx > 0 ? weeks[idx - 1] : undefined;

  return (
    <div className="stats-page weekly-page">
      <div className="stats-head">
        <button className="btn-quiet" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to the timer</button>
        <StatsTabs on="weekly" onStats={onStats} onWeekly={() => {}} />
      </div>

      <div className="week-head">
        <div>
          <p className="eyebrow">{r.inProgress ? 'This week so far' : 'Your week in review'}</p>
          <h1 id="weekTitle">{weekLabel(r.start)}</h1>
        </div>
        <div className="week-nav">
          <button className="icon-btn" type="button" aria-label="Earlier week" disabled={!older} onClick={() => older && setWeek(older)}><Icon name="prev" /></button>
          <label className="sr-only" htmlFor="weekPick">Week</label>
          <select id="weekPick" value={week} onChange={(e) => setWeek(e.target.value)}>
            {(weeks.includes(week) ? weeks : [week, ...weeks].sort().reverse()).map((w) => <option key={w} value={w}>{w === thisWeek ? `This week · ${weekLabel(w)}` : weekLabel(w)}</option>)}
          </select>
          <button className="icon-btn" type="button" aria-label="Later week" disabled={!newer} onClick={() => newer && setWeek(newer)}><Icon name="next" /></button>
        </div>
        <div className="week-actions">
          <button className="btn" type="button" onClick={() => void saveShareCard(r, { headline, summary }).catch(() => showToast('Couldn\'t make the image. Try Save as PDF.'))}><Icon name="download" />Save as image</button>
          <button className="btn" type="button" onClick={() => window.print()}><Icon name="file" />Save as PDF</button>
        </div>
      </div>

      <motion.section className="card week-hero" aria-labelledby="weekHeadline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SOFT} key={r.start}>
        <h2 id="weekHeadline">{ai.status === 'loading' && !mine ? <><span className="spin" aria-hidden="true" />Writing your week in review…</> : headline}</h2>
        <p className="week-summary">{summary}</p>
        {ai.status === 'failed' && <p className="hint warn">{ai.error} <button className="btn-link" type="button" onClick={() => void write()}>Try again</button></p>}
        {stale && r.inProgress && ai.status !== 'loading' && aiStatus === 'on' && (
          <button className="btn-quiet small" type="button" onClick={() => void write()}><Icon name="sparkle" />Update the summary with your latest sessions</button>
        )}
        {ai.status === 'loading' && mine && <p className="loading-line small"><span className="spin" aria-hidden="true" />Updating…</p>}
      </motion.section>

      <div className="tiles week-tiles">
        <DeltaTile label="Study time" def={DEFINITIONS.studyTime} value={hm(r.now.studyMin)} d={r.delta.studyMin} unit="min" i={0} />
        <DeltaTile label="Sessions" def={DEFINITIONS.sessions} value={String(r.now.sessions)} d={r.delta.sessions} unit="" i={1} />
        <DeltaTile label="Quiz accuracy" def={DEFINITIONS.accuracy} value={r.now.accuracy === null ? '–' : `${r.now.accuracy}%`} d={r.delta.accuracy} unit="pts" i={2} />
        <DeltaTile label="Goals met" def={DEFINITIONS.goals} value={r.now.goalsPct === null ? '–' : `${r.now.goalsPct}%`} d={r.delta.goalsPct} unit="pts" i={3} />
        <DeltaTile label="Study streak" def={DEFINITIONS.weekStreak} value={`${r.now.streak} day${r.now.streak === 1 ? '' : 's'}`} d={r.delta.streak} unit="days" i={4} />
        <DeltaTile label="Check-in streak" def={DEFINITIONS.weekCheckin} value={`${r.now.checkin} day${r.now.checkin === 1 ? '' : 's'}`} d={r.delta.checkin} unit="days" i={5} />
      </div>

      {r.empty ? (
        <section className="card stats-empty">
          <h2>{r.inProgress ? 'Your week starts with one session' : 'Nothing studied this week'}</h2>
          <p>{r.inProgress ? 'Finish a study session and this report fills in: minutes, quiz scores, documents and what to focus on next.' : 'Pick another week above, or start a session now.'}</p>
          <button className="btn btn-primary" type="button" onClick={onBack}>Start studying</button>
        </section>
      ) : (
        <>
          <div className="stats-two">
            <section className="card stats-card" aria-labelledby="wMinTitle">
              <div className="card-h"><h2 id="wMinTitle">Minutes per day</h2><span className="meta">{r.days.filter((d) => d.minutes > 0).length} study days</span></div>
              <Columns days={r.days} />
            </section>
            <section className="card stats-card" aria-labelledby="wAccTitle">
              <div className="card-h"><h2 id="wAccTitle">Quiz accuracy per day <Def text={DEFINITIONS.accuracy} /></h2></div>
              <AccuracyLine days={r.days} />
            </section>
          </div>

          <section className="card stats-card" aria-labelledby="wHeatTitle">
            <div className="card-h"><h2 id="wHeatTitle">Last 12 weeks</h2><span className="meta">Darker means more study</span></div>
            <Heatmap days={r.heat} weekStart={settings.weekStart} today={r.end < today ? r.end : today} />
          </section>

          <div className="stats-two">
            <section className="card stats-card" aria-labelledby="wBestTitle">
              <div className="card-h"><h2 id="wBestTitle">Your best this week <Def text={`${DEFINITIONS.bestDay} ${DEFINITIONS.bestTime}`} /></h2></div>
              <ul className="best-list">
                <li><span>Best day</span><strong>{r.stats.bestDayMinutes ? WEEKDAYS[r.stats.bestDayMinutes.day] : '–'}</strong><em>{r.stats.bestDayMinutes ? `${r.stats.bestDayMinutes.avgMin} min` : 'study on a day first'}</em></li>
                <li><span>Best quiz day</span><strong>{r.stats.bestDayAccuracy ? WEEKDAYS[r.stats.bestDayAccuracy.day] : '–'}</strong><em>{r.stats.bestDayAccuracy ? `${r.stats.bestDayAccuracy.accuracy}% right` : 'needs 3+ answers on a day'}</em></li>
                <li><span>Best time of day</span><strong>{r.stats.bestTime ? SLOT_NAMES[r.stats.bestTime.slot] : '–'}</strong><em>{r.stats.bestTime ? `${r.stats.bestTime.accuracy}% right` : 'needs 3+ answers'}</em></li>
              </ul>
            </section>
            <section className="card stats-card" aria-labelledby="wTopicTitle">
              <div className="card-h"><h2 id="wTopicTitle">Topics</h2><span className="meta">quiz accuracy</span></div>
              {r.stats.byTopic.length ? <Bars rows={r.stats.byTopic.slice(0, 6).map((t) => ({ label: t.topic, pct: t.accuracy, sub: `${hm(t.minutes)} · ${t.answered} answered` }))} />
                : <p className="muted small">Quiz results by topic show up here.</p>}
            </section>
          </div>

          {r.docs.length > 0 && (
            <section className="card stats-card" aria-labelledby="wDocTitle">
              <div className="card-h"><h2 id="wDocTitle">Documents <Def text={DEFINITIONS.docProgress} /></h2></div>
              <div className="doc-stats">
                {r.docs.map((d) => (
                  <div key={d.docId} className="doc-cov">
                    <div className="doc-cov-head"><strong title={d.name}>{d.name}</strong><span>{d.reached} of {d.pageCount} · {d.pct}%</span></div>
                    <div className="doc-bar"><span style={{ width: `${d.pct}%` }} /></div>
                    <p className="small muted week-covered">{d.coveredThisWeek ? `${d.coveredThisWeek} ${d.unit} covered this week` : 'Opened this week'}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="stats-two">
            <section className="card stats-card" aria-labelledby="wMissTitle">
              <div className="card-h"><h2 id="wMissTitle">Most missed this week</h2></div>
              {r.missed.length ? (
                <ul className="concept-list">{r.missed.map((c) => <li key={c.topic + c.concept}><strong>{c.concept}</strong><span>{c.topic} · missed {c.missed} of {c.seen}</span></li>)}</ul>
              ) : <p className="muted small">No misses this week. Nice.</p>}
            </section>
            <section className="card stats-card" aria-labelledby="wMastTitle">
              <div className="card-h"><h2 id="wMastTitle">Mastered this week <Def text={DEFINITIONS.mastered} /></h2></div>
              {r.mastered.length ? (
                <ul className="concept-list">{r.mastered.map((c) => <li key={c.topic + c.concept}><strong><Icon name="check" />{c.concept}</strong><span>{c.topic}</span></li>)}</ul>
              ) : <p className="muted small">Concepts you missed and then got right twice in a row land here.</p>}
            </section>
          </div>
        </>
      )}

      <section className="card stats-card week-focus" aria-labelledby="wFocusTitle">
        <div className="card-h"><h2 id="wFocusTitle">Focus for next week</h2>
          <button className="btn-quiet small" type="button" onClick={() => { addTasks(focus); showToast(`Added ${focus.length} steps to your to-do list`); }}><Icon name="plus" />Add to my to-do list</button>
        </div>
        <ol className="focus-list">{focus.map((f, i) => <li key={i}><span className="n">{i + 1}</span><span>{f}</span></li>)}</ol>
      </section>
    </div>
  );
}

/** A key number with its change vs. last week: ▲ up, ▼ down, or level. Down is shown calmly, never in alarm red. */
function DeltaTile({ label, def, value, d, unit, i }: { label: string; def: string; value: string; d: number | null; unit: string; i: number }) {
  const abs = Math.abs(d ?? 0);
  const amount = d === null ? '' : unit === 'min' ? hm(abs) : `${abs}${unit ? ` ${abs === 1 ? unit.replace(/s$/, '') : unit}` : ''}`;
  const text = d === null ? 'no comparison yet' : d > 0 ? `▲ ${amount} vs. last week` : d < 0 ? `▼ ${amount} vs. last week` : 'same as last week';
  return (
    <motion.div className="card tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.04 }}>
      <span className="tile-label">{label} <Def text={def} /></span>
      <strong className="tile-value">{value}</strong>
      <span className={`tile-note delta${d && d > 0 ? ' up' : d && d < 0 ? ' down' : ''}`}>{text}</span>
    </motion.div>
  );
}

/** Quiz accuracy for each day of the week as a line, with a gap on days without answers. */
function AccuracyLine({ days }: { days: WeekReport['days'] }) {
  const { box, handlers, el } = useTip();
  const W = 700, H = 200, pad = 14;
  const x = (i: number) => pad + (i * (W - pad * 2)) / 6;
  const y = (p: number) => pad + ((100 - p) * (H - pad * 2)) / 100;
  const segs: string[] = [];
  let cur = '';
  days.forEach((d, i) => {
    if (d.accuracy === null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.accuracy).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const any = days.some((d) => d.accuracy !== null);
  return (
    <div className="chart" ref={box}>
      <div className="line-plot">
        <div className="col-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="line-area">
          <div className="line-box">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {[0, 50, 100].map((t) => <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className="line-grid" />)}
            {segs.map((p, i) => <path key={i} d={p} className="line-path" vectorEffect="non-scaling-stroke" />)}
          </svg>
          {days.map((d, i) => d.accuracy === null ? null : (
            <span key={d.date} className="line-dot" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(d.accuracy) / H) * 100}%` }} tabIndex={0}
              aria-label={`${dayName(d.date)}: ${d.accuracy}% right`} {...handlers(<><strong>{d.accuracy}% right</strong><span>{dayName(d.date)} {shortDate(d.date)} · {d.correct} of {d.answered}</span></>)} />
          ))}
          </div>
          <div className="line-x" aria-hidden="true">{days.map((d) => <span key={d.date}>{dayName(d.date)}</span>)}</div>
        </div>
      </div>
      {!any && <p className="muted small">Take a quiz this week to see your accuracy by day.</p>}
      {el}
      <details className="table-view">
        <summary>Show as a table</summary>
        <table><thead><tr><th>Day</th><th>Right</th><th>Answered</th><th>Accuracy</th></tr></thead>
          <tbody>{days.map((d) => <tr key={d.date}><td>{dayName(d.date)} {shortDate(d.date)}</td><td>{d.correct}</td><td>{d.answered}</td><td>{d.accuracy === null ? '–' : `${d.accuracy}%`}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

/** On the timer page, the first visit of a new week: "Your week in review is ready". */
export function WeekReviewBanner({ onOpen }: { onOpen: (week: string) => void }) {
  const history = useStudy((s) => s.history);
  const settings = useStudy((s) => s.settings);
  const seen = useStudy((s) => s.weeklySeen);
  const today = todayFor(settings);
  const week = unseenLastWeek(history, today, settings.weekStart, seen);
  const mins = useMemo(() => (week ? weekReport({ history, docs: [], week, today, weekStartDay: settings.weekStart }).now.studyMin : 0), [week, history, today, settings.weekStart]);
  if (!week) return null;
  return (
    <motion.section className="card week-banner" id="weekBanner" aria-label="Your week in review" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
      <span className="week-banner-icon" aria-hidden="true"><Icon name="chart" /></span>
      <div className="week-banner-text"><strong>Your week in review is ready</strong><span>{weekLabel(week)} · {hm(mins)} studied</span></div>
      <button className="btn btn-primary" type="button" onClick={() => onOpen(week)}>See your week</button>
      <button className="icon-btn" type="button" aria-label="Dismiss" onClick={() => useStudy.getState().markWeekSeen(week)}><Icon name="x" /></button>
    </motion.section>
  );
}
