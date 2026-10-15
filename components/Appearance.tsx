'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStudy } from '@/lib/store';
import { ACCENTS, BACKGROUNDS, CLOCK_FONTS, CORNERS, MASCOTS, THEMES, TIMER_STYLES, applyAppearance } from '@/lib/appearance';
import { siteConfig } from '@/lib/config';
import { refreshDailyPhoto } from '@/lib/unsplash-client';
import { Mascot } from './Mascot';
import { PhotoPicker } from './PhotoPicker';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { idb } from '@/lib/docs/idb';
import type { Settings } from '@/lib/types';
import { Icon } from './Icon';

const BG_KEY = 'look:bg-image';

/** Keeps the page's look in step with the settings, including a photo background saved on this device. */
export function useAppearance() {
  const s = useStudy((st) => st.settings);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const bgVersion = useBgVersion();
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    if (s.background === 'image') {
      void idb.get<Blob>(BG_KEY).then((blob) => {
        if (!alive || !blob) { setBgUrl(null); return; }
        url = URL.createObjectURL(blob);
        setBgUrl(url);
      });
    } else setBgUrl(null);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [s.background, bgVersion]);
  useEffect(() => { applyAppearance(s, bgUrl); }, [s, bgUrl]);
  // The daily Unsplash photo: check on load, when the mood changes, and when the tab comes back (maybe on a new day).
  useEffect(() => { void refreshDailyPhoto(); }, [s.bgDaily, s.background]);
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') void refreshDailyPhoto(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
}

// A tiny signal so a newly uploaded photo shows up at once.
let bump = 0;
const listeners = new Set<() => void>();
function useBgVersion() {
  const [v, setV] = useState(bump);
  useEffect(() => { const on = () => setV(bump); listeners.add(on); return () => { listeners.delete(on); }; }, []);
  return v;
}
const bgChanged = () => { bump++; listeners.forEach((l) => l()); };

function Seg<T extends string>({ label, value, options, onPick, fontFor }: {
  label: string; value: T; options: { id: T; name: string }[]; onPick: (v: T) => void; fontFor?: (id: T) => string | undefined;
}) {
  const id = `seg-${label.replace(/\W+/g, '')}`;
  return (
    <div className="set-row">
      <span className="field-label" id={id}>{label}</span>
      <div className="seg font-seg" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onPick(o.id)} style={fontFor?.(o.id) ? { fontFamily: fontFor(o.id) } : undefined}>{o.name}</button>
        ))}
      </div>
    </div>
  );
}

export function AppearanceDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const s = useStudy((st) => st.settings);
  const update = useStudy.getState().updateSettings;
  const { showToast } = useStudy.getState();
  const photoRef = useRef<HTMLInputElement>(null);
  const [unsplash, setUnsplash] = useState(false);
  useEffect(() => { void siteConfig().then((c) => setUnsplash(c.unsplash)); }, []);
  const close = () => dialogRef.current?.close();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((x) => { x[k] = v; });

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Choose an image file.'); return; }
    if (f.size > 15_000_000) { showToast('That image is over 15 MB. Choose a smaller one.'); return; }
    await idb.set(BG_KEY, f);
    bgChanged();
    set('background', 'image');
  };
  const reset = () => update((x) => {
    for (const k of ['skin', 'accent', 'clockFont', 'timerStyle', 'background', 'bgDim', 'bgDaily', 'mascot', 'mascotKind', 'cardStyle', 'corners', 'density'] as const) {
      (x as unknown as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
    }
  });

  return (
    <dialog ref={dialogRef} id="lookDlg" aria-labelledby="lookTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dlg-head"><h2 id="lookTitle">Appearance</h2>
        <button className="icon-btn" type="button" aria-label="Close appearance" onClick={close}><Icon name="x" /></button></div>
      <div className="dlg-body">
        <fieldset>
          <legend>Theme</legend>
          <div className="theme-grid" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" className="theme-card" aria-pressed={s.skin === t.id} onClick={() => set('skin', t.id)}>
                <span className="theme-prev" style={{ background: t.id === 'auto' ? `linear-gradient(110deg, ${t.colors[0]} 50%, #131C19 50%)` : t.colors[0] }}>
                  <span className="pc" style={{ background: t.id === 'auto' ? 'transparent' : t.colors[1], border: `1px solid ${t.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}` }} />
                  <span className="pa" style={{ background: t.colors[2] }} />
                  <span className="pb" style={{ background: t.colors[3] }} />
                </span>
                {t.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Accent color</legend>
          <div className="swatches" role="group" aria-label="Accent color">
            <button type="button" className="swatch default" aria-pressed={!s.accent} aria-label="Theme's own accent" title="Theme's own" onClick={() => set('accent', '')} />
            {ACCENTS.map((c) => (
              <button key={c} type="button" className="swatch" aria-pressed={s.accent.toLowerCase() === c.toLowerCase()} aria-label={`Accent ${c}`} style={{ background: c }} onClick={() => set('accent', c)} />
            ))}
            <label className="swatch-custom" title="Any color">
              <span className="sr-only">Pick any color</span>
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '#2f4bc8'} onChange={(e) => set('accent', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Timer</legend>
          <Seg label="Style" value={s.timerStyle} options={TIMER_STYLES} onPick={(v) => set('timerStyle', v)} />
          <Seg label="Clock font" value={s.clockFont} options={CLOCK_FONTS} onPick={(v) => set('clockFont', v)} fontFor={(id) => CLOCK_FONTS.find((f) => f.id === id)?.family} />
        </fieldset>

        <fieldset>
          <legend>Study buddy</legend>
          <div className="buddy-grid" role="group" aria-label="Study buddy">
            {MASCOTS.map((m) => (
              <button key={m.id} type="button" className="buddy-card" aria-pressed={s.mascotKind === m.id}
                onClick={() => update((x) => { x.mascotKind = m.id; if (x.mascot === 'off') x.mascot = 'auto'; })}>
                <span className="buddy-prev"><Mascot mood={s.mascotKind === m.id ? 'happy' : 'idle'} kind={m.id} /></span>
                {m.name}
              </button>
            ))}
          </div>
          <Seg label="Show it" value={s.mascot} options={[{ id: 'auto', name: 'Automatic' }, { id: 'on', name: 'Always' }, { id: 'off', name: 'Hidden' }]} onPick={(v) => set('mascot', v)} />
          <p className="hint">Automatic: the tomato appears with the Tomato theme; any other buddy you pick always appears.</p>
        </fieldset>

        <fieldset>
          <legend>Page</legend>
          <Seg label="Background" value={s.background} options={BACKGROUNDS.filter((b) => b.id !== 'image' && b.id !== 'unsplash')} onPick={(v) => set('background', v)} />
          {unsplash && (
            <div className="set-row stack">
              <span className="field-label">Photo backgrounds<span className="sub">Free photos from Unsplash. Pick a mood or search.</span></span>
              <PhotoPicker />
            </div>
          )}
          <div className="set-row">
            <span className="field-label">Your photo<span className="sub">Saved on this device only</span></span>
            <div className="bg-row">
              <button className="btn" type="button" aria-pressed={s.background === 'image'} onClick={() => photoRef.current?.click()}>
                <Icon name="upload" />{s.background === 'image' ? 'Change photo' : 'Use a photo'}
              </button>
              {(s.background === 'image' || s.background === 'unsplash') && (
                <label className="inline small">Dim
                  <input type="range" min={0} max={0.8} step={0.05} value={s.bgDim} onChange={(e) => set('bgDim', Number(e.target.value))} aria-label="Dim the photo" />
                </label>
              )}
            </div>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          <Seg label="Cards" value={s.cardStyle} options={[{ id: 'solid', name: 'Solid' }, { id: 'glass', name: 'Glass' }]} onPick={(v) => set('cardStyle', v)} />
          <Seg label="Corners" value={s.corners} options={CORNERS} onPick={(v) => set('corners', v)} />
          <Seg label="Spacing" value={s.density} options={[{ id: 'comfortable', name: 'Comfortable' }, { id: 'compact', name: 'Compact' }]} onPick={(v) => set('density', v)} />
        </fieldset>
      </div>
      <div className="dlg-foot spread">
        <button className="btn-quiet" type="button" onClick={reset}>Reset to default look</button>
        <button className="btn btn-primary" type="button" onClick={close}>Done</button>
      </div>
    </dialog>
  );
}
