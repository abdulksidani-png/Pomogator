'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { todayFor } from '@/lib/dates';
import { DEFINITIONS, WEEKDAYS, addDays, computeStats, weekStartOf, type DayStat, type Stats } from '@/lib/stats';
import { Icon } from './Icon';
import { SOFT } from './motion';

type Range = 'week' | 'month' | 'all';
const RANGES: { id: Range; name: string }[] = [{ id: 'week', name: 'This week' }, { id: 'month', name: 'Last 30 days' }, { id: 'all', name: 'All time' }];
const SLOT_NAMES = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', night: 'Nights' };

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });

/** The Stats page: totals for a time range, charts, best times, topics, documents and concepts. */
export function StatsView({ onBack }: { onBack: () => void }) {
  const history = useStudy((s) => s.history);
  const docs = useStudy((s) => s.docs);
  const settings = useStudy((s) => s.settings);
  const [range, setRange] = useState<Range>('week');
  const today = todayFor(settings);
  const weekStart = weekStartOf(today, settings.weekStart);
  const from = range === 'week' ? weekStart : range === 'month' ? addDays(today, -29) : undefined;

  const s = useMemo(
    () => computeStats({ history, docs, today, timezone: settings.timezone, from, dayCount: 84, freezes: settings.streakFreeze }),
    [history, docs, today, settings.timezone, from, settings.streakFreeze],
  );
  // The column chart: this week's seven days (the rest of the week still empty), or the last 30 days.
  const columns: DayStat[] = range === 'week'
    ? Array.from({ length: 7 }, (_, i) => { const date = addDays(weekStart, i); return s.days.find((d) => d.date === date) ?? { date, minutes: 0, sessions: 0, correct: 0, answered: 0 }; })
    : s.days.slice(-30);

  return (
    <div className="stats-page">
      <div className="stats-head">
        <button className="btn-quiet" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to the timer</button>
        <h1>Your stats</h1>
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.name}</button>)}
        </div>
      </div>

      {history.length === 0 ? (
        <section className="card stats-empty">
          <h2>Nothing to show yet</h2>
          <p>Finish a study session and your minutes, quiz scores and streaks show up here.</p>
          <button className="btn btn-primary" type="button" onClick={onBack}>Start studying</button>
        </section>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Study time" def={DEFINITIONS.studyTime} value={hm(s.studyMin)} note={`${s.sessions} session${s.sessions === 1 ? '' : 's'}`} i={0} />
            <Tile label="Average session" def={DEFINITIONS.sessions} value={s.avgSessionMin === null ? '–' : `${s.avgSessionMin} min`} note={s.sessions ? 'per counted session' : 'no sessions yet'} i={1} />
            <Tile label="Quiz accuracy" def={DEFINITIONS.accuracy} value={s.accuracy === null ? '–' : `${s.accuracy}%`} note={`${s.correct} of ${s.answered} right`} i={2} />
            <Tile label="Goals met" def={DEFINITIONS.goals} value={s.goalsPct === null ? '–' : `${s.goalsPct}%`} note={s.goalsSet ? `${s.goalsMet} of ${s.goalsSet} goals` : 'set a goal on a document'} i={3} />
            <Tile label="Study streak" def={DEFINITIONS.streak} value={`${s.streak.current} day${s.streak.current === 1 ? '' : 's'}`}
              note={`best ${s.streak.longest}${settings.streakFreeze ? ` · ${s.streak.freezesLeft} freeze${s.streak.freezesLeft === 1 ? '' : 's'}` : ''}`} i={4} />
            <Tile label="Breaks earned" def={DEFINITIONS.breaks} value={hm(s.breakMin)} note="from quizzes and sessions" i={5} />
          </div>

          <section className="card stats-card" aria-labelledby="minTitle">
            <div className="card-h"><h2 id="minTitle">Minutes per day</h2><span className="meta">{range === 'week' ? 'This week' : 'Last 30 days'}</span></div>
            <Columns days={columns} />
          </section>

          <section className="card stats-card" aria-labelledby="heatTitle">
            <div className="card-h"><h2 id="heatTitle">Last 12 weeks</h2><span className="meta">Darker means more study</span></div>
            <Heatmap days={s.days} weekStart={settings.weekStart} today={today} />
          </section>

          <div className="stats-two">
            <section className="card stats-card" aria-labelledby="bestTitle">
              <div className="card-h"><h2 id="bestTitle">When you study best <Def text={`${DEFINITIONS.bestDay} ${DEFINITIONS.bestTime}`} /></h2></div>
              <ul className="best-list">
                <li><span>Most study</span><strong>{s.bestDayMinutes ? `${WEEKDAYS[s.bestDayMinutes.day]}s` : '–'}</strong><em>{s.bestDayMinutes ? `${s.bestDayMinutes.avgMin} min a day` : 'study on a few days first'}</em></li>
                <li><span>Best quiz day</span><strong>{s.bestDayAccuracy ? `${WEEKDAYS[s.bestDayAccuracy.day]}s` : '–'}</strong><em>{s.bestDayAccuracy ? `${s.bestDayAccuracy.accuracy}% right` : 'needs 3+ answers on a day'}</em></li>
                <li><span>Best time of day</span><strong>{s.bestTime ? SLOT_NAMES[s.bestTime.slot] : '–'}</strong><em>{s.bestTime ? `${s.bestTime.accuracy}% right` : 'needs 3+ answers'}</em></li>
              </ul>
            </section>
            <section className="card stats-card" aria-labelledby="topicTitle">
              <div className="card-h"><h2 id="topicTitle">Topics <Def text={DEFINITIONS.accuracy} /></h2><span className="meta">quiz accuracy</span></div>
              {s.byTopic.length ? <Bars rows={[...s.byTopic.slice(0, 6).map((t) => ({ label: t.topic, pct: t.accuracy, sub: `${hm(t.minutes)} · ${t.answered} answered` })),
                ...s.byDoc.slice(0, 3).map((d) => ({ label: d.name, pct: d.accuracy, sub: `document · ${d.answered} answered` }))]} />
                : <p className="muted small">Quiz results by topic show up here.</p>}
            </section>
          </div>

          {s.docs.length > 0 && (
            <section className="card stats-card" aria-labelledby="docTitle">
              <div className="card-h"><h2 id="docTitle">Documents <Def text={DEFINITIONS.docProgress} /></h2>
                <span className="cov-key" aria-hidden="true"><i className="c0" />not yet <i className="c1" />studied <i className="c2" />studied + quizzed</span>
              </div>
              <div className="doc-stats">
                {s.docs.map((d) => <DocCoverage key={d.docId} d={d} titles={docs.find((x) => x.id === d.docId)?.titles ?? []} />)}
              </div>
            </section>
          )}

          <div className="stats-two">
            <section className="card stats-card" aria-labelledby="missTitle">
              <div className="card-h"><h2 id="missTitle">Most missed</h2></div>
              {s.mostMissed.length ? (
                <ul className="concept-list">{s.mostMissed.map((c) => <li key={c.topic + c.concept}><strong>{c.concept}</strong><span>{c.topic} · missed {c.missed} of {c.seen}</span></li>)}</ul>
              ) : <p className="muted small">No misses yet. Nice.</p>}
            </section>
            <section className="card stats-card" aria-labelledby="mastTitle">
              <div className="card-h"><h2 id="mastTitle">Mastered <Def text={DEFINITIONS.mastered} /></h2></div>
              {s.mastered.length ? (
                <ul className="concept-list">{s.mastered.map((c) => <li key={c.topic + c.concept}><strong><Icon name="check" />{c.concept}</strong><span>{c.topic}</span></li>)}</ul>
              ) : <p className="muted small">Concepts you missed and then got right twice in a row land here.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** A "?" that shows how a number is worked out, on hover or focus. */
function Def({ text }: { text: string }) {
  return <span className="def" tabIndex={0} role="note" aria-label={text} data-def={text}>?</span>;
}

function Tile({ label, def, value, note, i }: { label: string; def: string; value: string; note: string; i: number }) {
  return (
    <motion.div className="card tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.04 }}>
      <span className="tile-label">{label} <Def text={def} /></span>
      <strong className="tile-value">{value}</strong>
      <span className="tile-note">{note}</span>
    </motion.div>
  );
}

/** One floating tooltip per chart, positioned over the hovered or focused mark. */
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const show = (el: Element, body: ReactNode) => {
    const b = box.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (b) setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, body });
  };
  const handlers = (body: ReactNode) => ({
    onPointerEnter: (e: React.PointerEvent) => show(e.currentTarget, body),
    onFocus: (e: React.FocusEvent) => show(e.currentTarget, body),
    onPointerLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  const el = tip ? <div className="chart-tip" role="status" style={{ left: tip.x, top: tip.y }}>{tip.body}</div> : null;
  return { box, handlers, el };
}

/** Minutes per day as thin columns, rounded at the top and square at the baseline. */
function Columns({ days }: { days: DayStat[] }) {
  const { box, handlers, el } = useTip();
  const max = Math.max(...days.map((d) => d.minutes));
  const top = max <= 0 ? 60 : Math.ceil(max / 30) * 30; // a clean ceiling: 30, 60, 90 …
  const ticks = [0, top / 2, top];
  const wide = days.length > 10;
  return (
    <div className="chart" ref={box}>
      <div className="col-plot">
        <div className="col-axis" aria-hidden="true">{[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}</div>
        <div className="col-area">
          <div className="col-grids" aria-hidden="true">{ticks.map((t) => <span key={t} className="col-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}</div>
          <div className={`cols${wide ? ' wide' : ''}`}>
            {days.map((d, i) => (
              <div key={d.date} className="col-slot" tabIndex={0} aria-label={`${shortDate(d.date)}: ${d.minutes} minutes`}
                {...handlers(<><strong>{d.minutes} min</strong><span>{dayName(d.date)} {shortDate(d.date)} · {d.sessions} session{d.sessions === 1 ? '' : 's'}</span></>)}>
                <motion.span className="col-bar" style={{ height: `${(d.minutes / top) * 100}%` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...SOFT, delay: i * 0.015 }} />
                <span className="col-x">{wide ? (i % 5 === 0 || i === days.length - 1 ? shortDate(d.date) : '') : dayName(d.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {el}
      <details className="table-view">
        <summary>Show as a table</summary>
        <table><thead><tr><th>Day</th><th>Minutes</th><th>Sessions</th></tr></thead>
          <tbody>{days.map((d) => <tr key={d.date}><td>{dayName(d.date)} {shortDate(d.date)}</td><td>{d.minutes}</td><td>{d.sessions}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

const heatLevel = (min: number) => (min <= 0 ? 0 : min < 25 ? 1 : min < 50 ? 2 : min < 100 ? 3 : 4);

/** A calendar of the last 12 weeks: one cell per day, darker for more minutes. */
function Heatmap({ days, weekStart, today }: { days: DayStat[]; weekStart: number; today: string }) {
  const { box, handlers, el } = useTip();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = weekStartOf(addDays(today, -83), weekStart);
  const weeks: string[][] = [];
  for (let d = first; d <= today; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const rowNames = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7].slice(0, 3));
  return (
    <div className="chart" ref={box}>
      <div className="heat">
        <div className="heat-rows" aria-hidden="true">{rowNames.map((n, i) => <span key={n}>{i % 2 === 0 ? n : ''}</span>)}</div>
        <div className="heat-weeks">
          {weeks.map((w) => (
            <div key={w[0]} className="heat-week">
              {w.map((date) => {
                const d = byDate.get(date);
                if (date > today) return <span key={date} className="heat-cell future" aria-hidden="true" />;
                const min = d?.minutes ?? 0;
                return <span key={date} className={`heat-cell l${heatLevel(min)}`} tabIndex={0} aria-label={`${shortDate(date)}: ${min} minutes`}
                  {...handlers(<><strong>{min} min</strong><span>{dayName(date)} {shortDate(date)}</span></>)} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heat-key" aria-hidden="true">Less {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat-cell l${l}`} />)} More</div>
      {el}
    </div>
  );
}

/** Horizontal bars of accuracy, each with its value at the tip. */
function Bars({ rows }: { rows: { label: string; pct: number | null; sub: string }[] }) {
  return (
    <ul className="hbars">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="hbar-top"><span className="hbar-label" title={r.label}>{r.label}</span><span className="hbar-sub">{r.sub}</span></div>
          <div className="hbar-row">
            <div className="hbar-track"><motion.span className="hbar" style={{ width: `${r.pct ?? 0}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...SOFT, delay: i * 0.04 }} /></div>
            <span className="hbar-val">{r.pct === null ? '–' : `${r.pct}%`}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** How far through a document, with one cell per page: not yet, studied, or studied and quizzed. */
function DocCoverage({ d, titles }: { d: Stats['docs'][number]; titles: string[] }) {
  const { box, handlers, el } = useTip();
  return (
    <div className="doc-cov chart" ref={box}>
      <div className="doc-cov-head"><strong title={d.name}>{d.name}</strong><span>{d.reached} of {d.pageCount} · {d.pct}%</span></div>
      <div className="doc-bar"><span style={{ width: `${d.pct}%` }} /></div>
      <div className="cov-cells">
        {d.studied.map((st, i) => {
          const lvl = d.quizzed[i] ? 2 : st ? 1 : 0;
          const what = lvl === 2 ? 'studied and quizzed' : lvl === 1 ? 'studied' : 'not studied yet';
          return <span key={i} className={`cov c${lvl}`} tabIndex={0} aria-label={`Page ${i + 1}: ${what}`}
            {...handlers(<><strong>{i + 1}. {titles[i] || `Page ${i + 1}`}</strong><span>{what}</span></>)} />;
        })}
      </div>
      {el}
    </div>
  );
}
