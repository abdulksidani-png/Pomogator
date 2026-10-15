// Unsplash photo search for backgrounds. The access key stays on the server.
// Replies are cached for an hour (search) or a day (daily photo) to stay within Unsplash's hourly limit.
import { randomPhoto, searchPhotos, trackDownload, unsplashConfigured } from '@/lib/unsplash-server';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200, cacheSecs = 0) =>
  Response.json(body, { status, headers: cacheSecs ? { 'Cache-Control': `public, s-maxage=${cacheSecs}, stale-while-revalidate=${cacheSecs * 4}` } : {} });

const failure = (status: number) =>
  json({ code: status === 403 || status === 429 ? 'rate_limited' : status === 401 ? 'bad_key' : 'upstream_error' }, status === 429 || status === 403 ? 429 : 502);

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!unsplashConfigured()) return json({ code: 'not_configured' }, 503);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (!q) return json({ code: 'bad_request' }, 400);
  try {
    if (action === 'search') {
      const page = Math.min(20, Math.max(1, Number(url.searchParams.get('page')) || 1));
      const r = await searchPhotos(q, page);
      return r.status === 200 ? json({ photos: r.photos, more: r.more }, 200, 3600) : failure(r.status);
    }
    if (action === 'random') {
      // The client adds ?day=YYYY-MM-DD, so everyone with the same mood shares one cached photo a day.
      const r = await randomPhoto(q);
      return r.photo ? json({ photo: r.photo }, 200, 86_400) : failure(r.status);
    }
  } catch { return failure(502); }
  return json({ code: 'not_found' }, 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== 'track') return json({ code: 'not_found' }, 404);
  if (!unsplashConfigured()) return json({ code: 'not_configured' }, 503);
  const body = (await req.json().catch(() => null)) as { downloadLocation?: unknown } | null;
  const ok = typeof body?.downloadLocation === 'string' && (await trackDownload(body.downloadLocation).catch(() => false));
  return json({ ok }, ok ? 200 : 400);
}
