/** Browser side: which optional services this site has switched on (asked once per page load). */
export interface SiteConfig { ai: boolean; unsplash: boolean; spotifyClientId: string; lastfm: boolean }

let p: Promise<SiteConfig> | null = null;
export function siteConfig(): Promise<SiteConfig> {
  if (!p) {
    p = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ({ ai: !!j?.ai, unsplash: !!j?.unsplash, spotifyClientId: String(j?.spotifyClientId || ''), lastfm: !!j?.lastfm }))
      .catch(() => ({ ai: false, unsplash: false, spotifyClientId: '', lastfm: false }));
  }
  return p;
}
