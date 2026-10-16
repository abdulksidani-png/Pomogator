// What a Last.fm user is listening to, for the music card and friends. The API key stays on the server.
// Answers are cached for 15 seconds per username, so many friends looking at one person cost one Last.fm call.
import { LASTFM_USER } from '@/lib/lastfm-core';
import { lastfmConfigured, lastfmNowPlaying } from '@/lib/lastfm-server';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200, cacheSecs = 0) =>
  Response.json(body, { status, headers: cacheSecs ? { 'Cache-Control': `public, s-maxage=${cacheSecs}, stale-while-revalidate=${cacheSecs * 2}` } : {} });

export async function GET(req: Request) {
  if (!lastfmConfigured()) return json({ code: 'not_configured' }, 503);
  const user = (new URL(req.url).searchParams.get('user') || '').trim();
  if (!LASTFM_USER.test(user)) return json({ code: 'bad_request' }, 400);
  try {
    const r = await lastfmNowPlaying(user);
    return r.ok ? json({ playback: r.playback }, 200, 15) : json({ code: r.code }, r.status, r.status === 404 ? 60 : 0);
  } catch {
    return json({ code: 'upstream_error' }, 502);
  }
}
