'use client';
/**
 * Check-in streaks in the interface: the two streaks in the header, the daily celebration card
 * (with confetti and a badge on milestones), and the badge shelf on the Stats page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { useNow } from '@/lib/now';
import { dayOf } from '@/lib/dates';
import { pullNow } from '@/lib/sync';
import { isCounted } from '@/lib/sync-map';
import { streakOf } from '@/lib/stats';
import { MILESTONES, badgeName, checkinStreak, headlineOf, type Celebration } from '@/lib/checkins';
import { Icon } from './Icon';
import { MyBuddy, openShop } from './Shop';
import { checkinPointsByDay } from '@/lib/points';
import { SOFT, SPRING } from './motion';

/** This device's choice to skip the celebration card (badges are still earned). */
const PREF = 'studybuddy.celebrate';
export function celebrationsOn(): boolean {
  try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; }
}
export function setCelebrationsOn(on: boolean) {
  try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* private window: nothing to remember */ }
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Today's date, re-rendering only when the day changes (time zone and 4 AM rollover included). */
function useToday() {
  const tz = useStudy((s) => s.settings.timezone);
  const ro = useStudy((s) => s.settings.rollover);
  return useNow((n) => dayOf(n.now, { timezone: tz, rollover: ro }));
}

export function useStreaks() {
  const checkins = useStudy((s) => s.checkins);
  const history = useStudy((s) => s.history);
  const freezes = useStudy((s) => s.settings.streakFreeze);
  const today = useToday();
  const checkin = useMemo(() => checkinStreak(checkins, today, freezes), [checkins, today, freezes]);
  const study = useMemo(() => streakOf(history.filter(isCounted).map((h) => h.date), today, { freezes }), [history, today, freezes]);
  return { checkin, study, checkedToday: checkins.includes(today), today };
}

/** The header: check-in streak and study streak, leading to Stats. */
export function StreakPills({ onClick }: { onClick: () => void }) {
  const { checkin, study, checkedToday } = useStreaks();
  const label = `Check-in streak: ${days(checkin.current)}${checkedToday || !checkin.current ? '' : ' (check in today to keep it)'}. Study streak: ${days(study.current)}. Open your stats.`;
  return (
    <button className="chip-btn streak-pills" id="streakPills" type="button" onClick={onClick} aria-label={label} title={label}>
      <span className="sp" data-lit={checkedToday ? '1' : '0'}><Icon name="flame" /><b>{checkin.current}</b></span>
      <span className="sp sp-study"><Icon name="book" /><b>{study.current}</b></span>
    </button>
  );
}

/**
 * Shows today's celebration once. A first check-in sets `checkinDue`; with an account, other devices'
 * check-ins are fetched first, so the card shows once per day per account, not once per device.
 */
export function CelebrationHost({ onBadges }: { onBadges: () => void }) {
  const due = useStudy((s) => s.checkinDue);
  const status = useStudy((s) => s.account.status);
  const [c, setC] = useState<Celebration | null>(null);
  const [waited, setWaited] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  // Signing in can take a moment; don't wait for it forever.
  useEffect(() => {
    if (!due || status !== 'connecting') return;
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, [due, status]);

  useEffect(() => {
    if (!due || (status === 'connecting' && !waited)) return;
    let live = true;
    void (async () => {
      if (status === 'guest' || status === 'user') await Promise.race([pullNow(), new Promise((r) => setTimeout(r, 4000))]);
      if (!live) return;
      const got = useStudy.getState().celebrate();
      if (got && celebrationsOn()) setC(got);
    })();
    return () => { live = false; };
  }, [due, status, waited]);

  useEffect(() => {
    const d = ref.current;
    if (c && d && !d.open) d.showModal();
  }, [c]);

  const close = () => { ref.current?.close(); setC(null); };
  const kind = useStudy((s) => s.settings.mascotKind);
  const buddyOn = useStudy((s) => s.settings.mascot !== 'off');
  const checkins = useStudy((s) => s.checkins);
  const freezes = useStudy((s) => s.settings.streakFreeze);
  const today = c?.days.find((d) => d.today)?.date;
  const pts = useMemo(() => (today ? checkinPointsByDay(checkins, freezes).get(today) ?? 0 : 0), [checkins, freezes, today]);

  return (
    <dialog ref={ref} className="celebrate-dlg" aria-labelledby="celebrateTitle" onClose={() => setC(null)}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      {c && (
        <>
          {c.milestone && <Confetti />}
          <motion.div className="celebrate" initial={{ opacity: 0, scale: 0.92, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={SPRING}>
            {buddyOn && <div className="celebrate-buddy" aria-hidden="true"><MyBuddy mood={c.broken || c.first ? 'happy' : 'cheer'} kind={kind} /></div>}
            <motion.div className="celebrate-count" aria-hidden="true" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: 0.12 }}>
              <span className="flame">🔥</span><strong>{c.streak}</strong>
            </motion.div>
            <h2 id="celebrateTitle">{headlineOf(c)}</h2>
            <ol className="week-strip" aria-label="Your last 7 days">
              {c.days.map((d, i) => (
                <motion.li key={d.date} data-mark={d.mark} data-today={d.today ? '1' : undefined}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.15 + i * 0.05 }}>
                  <span className="ws-dot" aria-hidden="true">{d.mark === 'done' ? <Icon name="check" /> : d.mark === 'frozen' ? '❄' : ''}</span>
                  <span className="ws-letter" aria-hidden="true">{d.letter}</span>
                  <span className="sr-only">{d.date}: {d.mark === 'done' ? 'checked in' : d.mark === 'frozen' ? 'covered by a streak freeze' : 'no check-in'}</span>
                </motion.li>
              ))}
            </ol>
            <p className="celebrate-line">{c.line}</p>
            {pts > 0 && (
              <button className="btn-quiet pts-earned" type="button" id="checkinPoints" onClick={() => { close(); openShop(); }} title="Open the buddy shop">
                <Icon name="coin" />+{pts} study points{pts > 10 ? ' (streak bonus)' : ''}
              </button>
            )}
            {c.milestone && (
              <motion.div className="badge-earned" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 0.35 }}>
                <Medal m={c.milestone} earned />
                <span><strong>New badge: {badgeName(c.milestone)}</strong><br />Saved to your profile.</span>
              </motion.div>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" type="button" autoFocus onClick={close}>Keep going</button>
              {c.milestone && <button className="btn" type="button" onClick={() => { close(); onBadges(); }}>See my badges</button>}
            </div>
          </motion.div>
        </>
      )}
    </dialog>
  );
}

/** Falling paper confetti for milestones. Hidden when the device asks for reduced motion. */
function Confetti() {
  const COLORS = ['var(--accent)', '#F2C14E', '#E07A7A', '#5EB3B3', '#8E75B2', '#7A9E7E'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <i key={i} style={{
          '--x': `${(i * 37) % 100}%`, '--d': `${((i * 53) % 90) / 100}s`, '--t': `${2.2 + ((i * 29) % 12) / 10}s`,
          '--r': `${(i * 67) % 360}deg`, '--s': `${0.7 + ((i * 17) % 6) / 10}`, background: COLORS[i % COLORS.length],
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

/** A milestone medal: the number of days on a ribbon. */
export function Medal({ m, earned }: { m: number; earned: boolean }) {
  return (
    <span className="medal" data-earned={earned ? '1' : '0'} aria-hidden="true">
      <span className="medal-ribbon" />
      <span className="medal-face"><b>{m}</b></span>
    </span>
  );
}

/** Stats page: every milestone, earned or still ahead. */
export function BadgeShelf() {
  const badges = useStudy((s) => s.badges);
  const { checkin } = useStreaks();
  const next = MILESTONES.find((m) => !badges[m]);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <section className="card stats-card" id="badgesCard" aria-labelledby="badgeTitle">
      <div className="card-h">
        <h2 id="badgeTitle">Streak badges</h2>
        <span className="meta">{next ? `Next: ${badgeName(next)} (${Math.max(0, next - checkin.current)} to go)` : 'All earned. Legendary.'}</span>
      </div>
      <ul className="badge-shelf">
        {MILESTONES.map((m) => (
          <li key={m} data-earned={badges[m] ? '1' : '0'}>
            <Medal m={m} earned={!!badges[m]} />
            <span className="badge-name">{badgeName(m)}</span>
            <span className="badge-when">{badges[m] ? fmt(badges[m]) : `${m}-day check-in streak`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
