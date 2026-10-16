/**
 * Last.fm "now playing", shared by the server route and the browser (pure, tested in tests/unit/lastfm.test.ts).
 * Last.fm has no per-app user limit: anyone who links Spotify (or Apple Music, YouTube Music…) to their Last.fm
 * account can share what they're playing, which gets around Spotify's 5-user cap for development-mode apps.
 */
import type { Playback } from './spotify';

/** Last.fm usernames: 2–15 characters, starting with a letter; letters, numbers, - and _. */
export const LASTFM_USER = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;
export const cleanLastfmUser = (v: unknown) => (typeof v === 'string' && LASTFM_USER.test(v.trim()) ? v.trim() : '');

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');
// Last.fm's grey star, sent when a track has no cover.
const PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f';

/** user.getRecentTracks → the newest track, marked playing while Last.fm says "nowplaying". */
export function toLastfmPlayback(j: unknown, now = Date.now()): Playback | null {
  const recent = o(o(j).recenttracks);
  const list = Array.isArray(recent.track) ? recent.track : recent.track ? [recent.track] : [];
  const t = o(list[0]);
  const title = str(t.name);
  if (!title) return null;
  const images = (Array.isArray(t.image) ? t.image : []) as Obj[];
  const pick = (size: string) => str(images.find((i) => i.size === size)?.['#text']);
  const art = [pick('extralarge'), pick('large'), pick('medium')].find((u) => u && !u.includes(PLACEHOLDER)) || '';
  return {
    title, artist: str(o(t.artist)['#text']) || str(o(t.artist).name), album: str(o(t.album)['#text']), art,
    url: str(t.url), device: '', isPlaying: str(o(t['@attr']).nowplaying) === 'true', progressMs: 0, durationMs: 0, at: now,
  };
}

/** Last.fm's error numbers → what the route answers. */
export function lastfmError(code: unknown): { code: string; status: number } {
  const n = Number(code);
  if (n === 6) return { code: 'no_user', status: 404 };
  if (n === 17) return { code: 'private', status: 403 };
  if (n === 29) return { code: 'rate_limited', status: 429 };
  if (n === 10 || n === 26) return { code: 'bad_key', status: 502 };
  return { code: 'upstream_error', status: 502 };
}
