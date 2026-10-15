/** Server only: Unsplash searches with UNSPLASH_ACCESS_KEY, which never reaches the browser. */
import { toPhoto } from './unsplash';
import type { UnsplashPhoto } from './types';

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

const BASE = () => (process.env.UNSPLASH_BASE_URL || 'https://api.unsplash.com').replace(/\/$/, '');
const KEY = () => (process.env.UNSPLASH_ACCESS_KEY || '').trim();
export const unsplashConfigured = () => !!KEY();

async function call(path: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${BASE()}${path}`, { headers: { Authorization: `Client-ID ${KEY()}`, 'Accept-Version': 'v1' }, cache: 'no-store' });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function searchPhotos(query: string, page: number) {
  const q = new URLSearchParams({ query, page: String(page), per_page: '12', orientation: 'landscape', content_filter: 'high' });
  const r = await call(`/search/photos?${q}`);
  if (r.status !== 200) return { status: r.status, photos: [] as UnsplashPhoto[], more: false };
  const b = o(r.body);
  const photos = (Array.isArray(b.results) ? b.results : []).map(toPhoto).filter((x): x is UnsplashPhoto => !!x);
  return { status: 200, photos, more: page < Number(b.total_pages || 0) };
}

export async function randomPhoto(query: string) {
  const q = new URLSearchParams({ query, orientation: 'landscape', content_filter: 'high' });
  const r = await call(`/photos/random?${q}`);
  return { status: r.status, photo: r.status === 200 ? toPhoto(r.body) : null };
}

/** Tell Unsplash a photo was chosen (their guidelines require it). Only Unsplash's own tracking URLs are called. */
export async function trackDownload(downloadLocation: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(downloadLocation); } catch { return false; }
  const base = new URL(BASE());
  if (u.origin !== base.origin || !/^\/photos\/[\w-]+\/download$/.test(u.pathname)) return false;
  const r = await call(`${u.pathname}${u.search}`);
  return r.status === 200;
}
