'use client';
import { useEffect, useMemo, useRef } from 'react';
import { pointsOf, useStudy } from '@/lib/store';
import { COSMETICS, wearing } from '@/lib/cosmetics';
import { POINT_RULES } from '@/lib/points';
import { MASCOTS } from '@/lib/appearance';
import { Mascot, type Mood } from './Mascot';
import type { MascotKind } from '@/lib/types';
import { Icon } from './Icon';

const OPEN = 'pomogator:shop';
/** Open the buddy shop from anywhere (header chip, Appearance, Stats). */
export const openShop = () => window.dispatchEvent(new Event(OPEN));

/** Study points left to spend (a number, so it's safe as a Zustand selector). */
export const useBalance = () => useStudy((s) => pointsOf(s).balance);

/** Your own buddy, wearing what you put on in the shop. */
export function MyBuddy({ mood, kind }: { mood: Mood; kind?: MascotKind }) {
  const wear = useStudy((s) => s.settings.wear);
  return <Mascot mood={mood} kind={kind} wear={wear} />;
}

/** The header chip: points to spend; opens the shop. */
export function PointsChip() {
  const balance = useBalance();
  const label = `${balance} study points. Open the buddy shop.`;
  return (
    <button className="chip-btn points-chip" id="pointsBtn" type="button" onClick={openShop} aria-label={label} title={label}>
      <Icon name="coin" /><b>{balance}</b>
    </button>
  );
}

/**
 * The buddy shop: cosmetics bought with study points. Anything bought works on every buddy,
 * so the previews show it on the buddy you have picked, and the buddy row switches who wears it.
 */
export function ShopDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const kind = useStudy((s) => s.settings.mascotKind);
  const wear = useStudy((s) => s.settings.wear);
  const owned = useStudy((s) => s.owned);
  const checkins = useStudy((s) => s.checkins);
  const history = useStudy((s) => s.history);
  const bank = useStudy((s) => s.pointsBank);
  const freezes = useStudy((s) => s.settings.streakFreeze);
  const p = useMemo(() => pointsOf({ checkins, history, owned, pointsBank: bank, settings: { streakFreeze: freezes } }), [checkins, history, owned, bank, freezes]);

  useEffect(() => {
    const open = () => ref.current?.showModal();
    window.addEventListener(OPEN, open);
    return () => window.removeEventListener(OPEN, open);
  }, []);

  const close = () => ref.current?.close();
  const st = useStudy.getState();
  const buy = (id: string, name: string) => {
    if (st.buyCosmetic(id)) { st.showToast(`Unlocked: ${name}. Your buddy has it on.`); }
  };

  return (
    <dialog ref={ref} id="shopDlg" aria-labelledby="shopTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head"><h2 id="shopTitle">Buddy shop</h2>
        <button className="icon-btn" type="button" aria-label="Close the shop" onClick={close}><Icon name="x" /></button></div>
      <div className="dlg-body">
        <section className="shop-top" aria-label="Your study points">
          <div className="shop-buddy" aria-hidden="true"><Mascot mood="happy" kind={kind} wear={wear} /></div>
          <div className="shop-bal">
            <p className="shop-points"><Icon name="coin" /><b id="pointsBalance">{p.balance}</b> study points</p>
            <p className="hint">Earned {p.earned} · spent {p.spent}</p>
            <ul className="shop-rules">{POINT_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </section>

        <div className="set-row stack">
          <span className="field-label">Who wears it<span className="sub">Everything you unlock fits every buddy.</span></span>
          <div className="shop-who" role="group" aria-label="Buddy">
            {MASCOTS.map((m) => (
              <button key={m.id} type="button" className="chip-btn" aria-pressed={kind === m.id}
                onClick={() => st.updateSettings((x) => { x.mascotKind = m.id; x.mascot = 'on'; })}>{m.name}</button>
            ))}
          </div>
        </div>

        <ul className="shop-grid" aria-label="Cosmetics">
          {COSMETICS.map((c) => {
            const has = owned.includes(c.id);
            const on = wear.includes(c.id);
            const short = c.price - p.balance;
            return (
              <li key={c.id} className="shop-item" data-id={c.id} data-owned={has ? '1' : '0'}>
                <span className="shop-prev" aria-hidden="true"><Mascot mood="idle" kind={kind} wear={wearing(wear, c.id, true)} /></span>
                <b>{c.name}</b>
                <span className="shop-blurb">{c.blurb}</span>
                {has ? (
                  <button className="btn" type="button" aria-pressed={on} onClick={() => st.setWear(c.id, !on)}>{on ? <><Icon name="check" />Wearing</> : 'Wear'}</button>
                ) : (
                  <>
                    <button className="btn btn-primary" type="button" disabled={short > 0} onClick={() => buy(c.id, c.name)}>
                      <Icon name="coin" />Unlock · {c.price}
                    </button>
                    <span className="shop-need">{short > 0 ? `${short} more points to go` : 'You can unlock this'}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint">One hat, one pair of glasses and one tie at a time. Points come from your own days and sessions, so they're the same on every device you sign in on.</p>
      </div>
      <div className="dlg-foot"><button className="btn btn-primary" type="button" onClick={close}>Done</button></div>
    </dialog>
  );
}
