/** Server only: Last.fm lookups with LASTFM_API_KEY, which never reaches the browser. */
import { lastfmError, toLastfmPlayback } from './lastfm-core';

const BASE = () => (process.env.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com').replace(/\/$/, '');
const KEY = () => (process.env.LASTFM_API_KEY || '').trim();
export const lastfmConfigured = () => !!KEY();

/** What a Last.fm user is playing now (or played last). */
export async function lastfmNowPlaying(user: string) {
  const q = new URLSearchParams({ method: 'user.getrecenttracks', user, api_key: KEY(), format: 'json', limit: '1' });
  const r = await fetch(`${BASE()}/2.0/?${q}`, { headers: { 'User-Agent': 'PomoGator/1.0' }, cache: 'no-store' });
  const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
  if (!r.ok || body?.error) return { ok: false as const, ...lastfmError(body?.error) };
  return { ok: true as const, playback: toLastfmPlayback(body) };
}
