/** Browser side of Unsplash backgrounds: search, the daily photo, and choosing a photo. */
import { useStudy } from './store';
import { todayFor } from './dates';
import type { UnsplashPhoto } from './types';

export interface SearchResult { photos: UnsplashPhoto[]; more: boolean }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw { code: (j as { code?: string } | null)?.code || 'upstream_error' };
  return j as T;
}

export const searchUnsplash = (q: string, page = 1) =>
  get<SearchResult>(`/api/unsplash/search?q=${encodeURIComponent(q)}&page=${page}`);

/** Unsplash asks apps to report when a photo is chosen. Failures don't matter to the student. */
export function trackChoice(p: UnsplashPhoto) {
  if (!p.downloadLocation) return;
  void fetch('/api/unsplash/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ downloadLocation: p.downloadLocation }) }).catch(() => undefined);
}

/** Use a photo as the page background (with "every day" on, it's today's photo for that mood). */
export function chooseUnsplashPhoto(p: UnsplashPhoto, daily = '') {
  useStudy.getState().updateSettings((x) => { x.bgPhoto = { ...p, day: todayFor(x) }; x.background = 'unsplash'; x.bgDaily = daily; });
  trackChoice(p);
}

export function unsplashErrorText(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'rate_limited') return 'Unsplash is busy for this hour. Try again in a bit.';
  if (code === 'not_configured') return 'Photo search isn\'t set up on this site yet.';
  if (code === 'bad_key') return 'The site\'s Unsplash key isn\'t working. Check UNSPLASH_ACCESS_KEY in Vercel.';
  return 'Couldn\'t load photos. Check your connection and try again.';
}

let checking = false;
/** With "new photo every day" on, fetch today's photo for the chosen mood once a day. */
export async function refreshDailyPhoto() {
  const s = useStudy.getState().settings;
  if (checking || s.background !== 'unsplash' || !s.bgDaily) return;
  const today = todayFor(s);
  if (s.bgPhoto?.day === today) return;
  checking = true;
  try {
    const { photo } = await get<{ photo: UnsplashPhoto }>(`/api/unsplash/random?q=${encodeURIComponent(s.bgDaily)}&day=${today}`);
    const now = useStudy.getState().settings;
    if (now.background === 'unsplash' && now.bgDaily === s.bgDaily) {
      useStudy.getState().updateSettings((x) => { x.bgPhoto = { ...photo, day: today }; });
      trackChoice(photo);
    }
  } catch { /* keep yesterday's photo */ }
  finally { checking = false; }
}
