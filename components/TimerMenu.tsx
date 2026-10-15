'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { activePreset, describePreset, presetValues, snapshot, MAX_NAME } from '@/lib/presets';
import type { TimerPreset } from '@/lib/types';
import { Icon } from './Icon';
import { useArmed } from './Panels';
import { SPRING } from './motion';

/** "My timers": saved setups (theme, clock font, buddy, lengths) you can name and switch between. */
export function TimerMenu() {
  const settings = useStudy((s) => s.settings);
  const list = settings.savedTimers;
  const active = activePreset(list, settings);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const { saveTimer, applyTimer } = useStudy.getState();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveTimer(name)) setName('');
  };

  return (
    <div className="timer-menu-wrap" ref={wrap}>
      <button ref={btn} className="chip-btn tm-btn" type="button" aria-haspopup="dialog" aria-expanded={open} id="timerMenuBtn"
        aria-label={active ? `Saved timers: ${active.name}` : 'Saved timers'} title="Saved timers: your favorite look and lengths" onClick={() => setOpen((o) => !o)}>
        <Icon name="bookmark" /><span className="tm-btn-label">{active ? active.name : 'My timers'}</span>
      </button>
      {open && (
        <motion.div className="timer-menu" role="dialog" aria-label="Saved timers" id="timerMenu"
          initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}>
          <div className="menu-head"><b>Saved timers</b><span>Theme, clock, buddy and lengths, in one tap.</span></div>
          {list.length ? (
            <ul className="tm-list">
              {list.map((p) => <PresetRow key={p.id} p={p} active={active?.id === p.id} onApply={() => { applyTimer(p.id); setOpen(false); }} />)}
            </ul>
          ) : (
            <p className="tm-empty">Nothing saved yet. Pick a theme, clock font, buddy and session length you like, then name it here.</p>
          )}
          <form className="tm-save" onSubmit={save} autoComplete="off">
            <label className="sr-only" htmlFor="tmName">Name for this setup</label>
            <input type="text" id="tmName" placeholder={active ? `Save as a new timer` : 'Name it, e.g. Exam cram'} maxLength={MAX_NAME}
              value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Save</button>
          </form>
          <p className="tm-now"><span>Saves what you have now:</span> {describePreset(snapshot(settings))}</p>
        </motion.div>
      )}
    </div>
  );
}

function PresetRow({ p, active, onApply }: { p: TimerPreset; active: boolean; onApply: () => void }) {
  const [armed, press] = useArmed();
  return (
    <li className="tm-row">
      <button className="tm-item" type="button" aria-pressed={active} onClick={onApply}>
        <b>{p.name}{active && <Icon name="check" />}</b>
        <span>{describePreset(presetValues(p))}</span>
      </button>
      <button className={`tm-del${armed ? ' armed' : ''}`} type="button" aria-label={armed ? `Press again to delete ${p.name}` : `Delete ${p.name}`}
        title={armed ? 'Press again to delete' : 'Delete'} onClick={() => press(() => useStudy.getState().deleteTimer(p.id))}>
        {armed ? 'Delete?' : <Icon name="trash" />}
      </button>
    </li>
  );
}
