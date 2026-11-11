/**
 * Last.fm "now playing", shared by the server route and the browser (pure, tested in tests/unit/lastfm.test.ts).
 * Last.fm is the only music source: it has no per-app user limit and works with any music app that can
 * "scrobble" (Spotify, Apple Music, YouTube Music, Tidal, Deezer…), so nobody needs a Spotify developer app.
 */

/** The song on the music card. */
export interface Playback {
  title: string;
  artist: string;
  album: string;
  art: string;
  url: string;
  isPlaying: boolean;
  /** When this was read. */
  at: number;
  /** For a song that isn't playing now: when Last.fm says it was played (ms). */
  playedAt?: number;
  /** This is the song that was playing when it stopped (see `withPause`), not Last.fm's newest play. */
  paused?: boolean;
}

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
  const isPlaying = str(o(t['@attr']).nowplaying) === 'true';
  const uts = Number(str(o(t.date).uts));
  return {
    title, artist: str(o(t.artist)['#text']) || str(o(t.artist).name), album: str(o(t.album)['#text']), art,
    url: str(t.url), isPlaying, at: now,
    ...(!isPlaying && uts > 0 ? { playedAt: uts * 1000 } : {}),
  };
}

const sameSong = (a: Playback, b: Playback) => a.title === b.title && a.artist === b.artist;
/** How long a song that stopped playing is still shown as "Paused". */
export const PAUSE_MS = 30 * 60_000;

/**
 * Last.fm only knows the song that is playing right now and the songs already scrobbled. When you pause, "playing now"
 * disappears, and the newest *scrobbled* song is an older one. So the song that was playing is kept (as paused) for a
 * while, instead of switching to that older song. `held` is the last song seen playing on this page.
 */
export function withPause(held: Playback | null, polled: Playback | null, now = Date.now()): { show: Playback | null; held: Playback | null } {
  if (polled?.isPlaying) return { show: polled, held: { ...polled, at: now } };
  if (held && now - held.at < PAUSE_MS && !(polled && sameSong(held, polled))) return { show: { ...held, isPlaying: false, paused: true }, held };
  return { show: polled, held: null }; // it finished and was saved to Last.fm, or it has been a long while
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
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
