/**
 * Unsplash photos, shared by browser and server: turning Unsplash's reply into the small UnsplashPhoto
 * the site keeps, sizing image URLs, and the attribution links Unsplash requires (with UTM tags).
 * The searching itself happens on the server (lib/unsplash-server.ts) with the secret key.
 */
import type { UnsplashPhoto } from './types';

export const UTM = 'utm_source=studybuddy&utm_medium=referral';
export const unsplashHome = `https://unsplash.com/?${UTM}`;
export const withUtm = (url: string) => `${url}${url.includes('?') ? '&' : '?'}${UTM}`;

/** An image URL at a given width (Unsplash's image server resizes on request). */
export function photoUrl(p: Pick<UnsplashPhoto, 'raw'>, width: number): string {
  try {
    const u = new URL(p.raw);
    u.searchParams.set('w', String(width));
    u.searchParams.set('q', '80');
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'max');
    return u.toString();
  } catch { return p.raw; }
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** Keep only what the site needs from an Unsplash photo object; null if it's missing essentials. */
export function toPhoto(raw: unknown): UnsplashPhoto | null {
  const p = o(raw), urls = o(p.urls), user = o(p.user), links = o(p.links), ulinks = o(user.links);
  if (!s(p.id) || !s(urls.raw) || !s(urls.small)) return null;
  return {
    id: s(p.id),
    raw: s(urls.raw),
    thumb: s(urls.small),
    color: /^#[0-9a-f]{6}$/i.test(s(p.color)) ? s(p.color) : '#8a8f99',
    alt: (s(p.alt_description) || s(p.description) || 'Photo').slice(0, 160),
    author: s(user.name) || 'Unknown',
    authorUrl: s(ulinks.html) || 'https://unsplash.com',
    link: s(links.html) || 'https://unsplash.com',
    downloadLocation: s(links.download_location),
  };
}
