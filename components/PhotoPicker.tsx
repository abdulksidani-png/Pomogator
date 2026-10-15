'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { PHOTO_MOODS } from '@/lib/appearance';
import { todayFor } from '@/lib/dates';
import { chooseUnsplashPhoto, refreshDailyPhoto, searchUnsplash, unsplashErrorText } from '@/lib/unsplash-client';
import { unsplashHome, withUtm } from '@/lib/unsplash';
import type { UnsplashPhoto } from '@/lib/types';
import { Icon } from './Icon';
import { SOFT } from './motion';

/** "Photo by Name on Unsplash", with the links Unsplash's guidelines ask for. */
export function PhotoCredit({ photo }: { photo: UnsplashPhoto }) {
  return (
    <span className="photo-credit">
      Photo by <a href={withUtm(photo.authorUrl)} target="_blank" rel="noreferrer">{photo.author}</a> on <a href={unsplashHome} target="_blank" rel="noreferrer">Unsplash</a>
    </span>
  );
}

/** Pick a page background from Unsplash: by mood or by search, with an optional new photo each day. */
export function PhotoPicker() {
  const s = useStudy((st) => st.settings);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<{ q: string; photos: UnsplashPhoto[]; page: number; more: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (q: string, page = 1) => {
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await searchUnsplash(term, page);
      setShown((prev) => ({ q: term, page, more: r.more, photos: page > 1 && prev?.q === term ? [...prev.photos, ...r.photos] : r.photos }));
      if (!r.photos.length && page === 1) setErr(`No photos found for "${term}".`);
    } catch (e) { setErr(unsplashErrorText(e)); }
    finally { setBusy(false); }
  };

  const daily = s.background === 'unsplash' && !!s.bgDaily;
  const toggleDaily = (on: boolean) => {
    const q = shown?.q || s.bgDaily || PHOTO_MOODS[0].query;
    useStudy.getState().updateSettings((x) => {
      x.bgDaily = on ? q : '';
      if (on) { x.background = 'unsplash'; if (x.bgPhoto) x.bgPhoto = { ...x.bgPhoto, day: todayFor(x) }; } // a new one tomorrow
    });
    if (on) void refreshDailyPhoto();
  };

  return (
    <div className="photo-picker">
      <div className="mood-chips" role="group" aria-label="Photo moods">
        {PHOTO_MOODS.map((m) => (
          <button key={m.query} type="button" className="chip" aria-pressed={shown?.q === m.query} disabled={busy} onClick={() => { setQuery(''); void run(m.query); }}>{m.name}</button>
        ))}
      </div>
      <form className="photo-search" onSubmit={(e) => { e.preventDefault(); void run(query); }}>
        <label className="sr-only" htmlFor="photoSearch">Search Unsplash photos</label>
        <input type="text" id="photoSearch" placeholder="Search photos, e.g. rainy library" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !query.trim()}>Search</button>
      </form>
      {err && <p className="hint warn" role="alert">{err}</p>}
      {shown && shown.photos.length > 0 && (
        <>
          <div className="photo-grid">
            {shown.photos.map((p, i) => (
              <motion.button key={p.id} type="button" className="photo-tile" aria-pressed={s.background === 'unsplash' && s.bgPhoto?.id === p.id}
                aria-label={`Use photo by ${p.author}: ${p.alt}`} style={{ backgroundColor: p.color }}
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SOFT, delay: Math.min(i, 11) * 0.025 }}
                onClick={() => chooseUnsplashPhoto(p, daily ? shown.q : '')}>
                <img src={p.thumb} alt="" loading="lazy" />
                <span className="photo-by">{p.author}</span>
                {s.background === 'unsplash' && s.bgPhoto?.id === p.id && <span className="photo-check"><Icon name="check" /></span>}
              </motion.button>
            ))}
          </div>
          {shown.more && <button className="btn-quiet" type="button" disabled={busy} onClick={() => void run(shown.q, shown.page + 1)}>{busy ? 'Loading…' : 'More photos'}</button>}
        </>
      )}
      {busy && !shown && <p className="hint loading-line"><span className="spin" aria-hidden="true" />Finding photos…</p>}
      <label className="check-inline" htmlFor="photoDaily">
        <input type="checkbox" id="photoDaily" checked={daily} onChange={(e) => toggleDaily(e.target.checked)} />
        New photo every day{daily ? <span className="muted">({PHOTO_MOODS.find((m) => m.query === s.bgDaily)?.name ?? s.bgDaily})</span> : null}
      </label>
      {s.background === 'unsplash' && s.bgPhoto && <p className="hint"><PhotoCredit photo={s.bgPhoto} /></p>}
    </div>
  );
}
