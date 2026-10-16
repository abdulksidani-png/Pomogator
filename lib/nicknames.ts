/**
 * Private nicknames for friends ("Alex (bio lab)"), so two friends with the same username can be told apart.
 * Only you see them: they live in your synced settings, keyed by the friend's account id. Pure; tested in
 * tests/unit/nicknames.test.ts.
 */
export const MAX_NICKNAME = 24;

export function cleanNickname(v: unknown): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, MAX_NICKNAME);
}

export function cleanNicknames(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, n] of Object.entries(v as Record<string, unknown>).slice(0, 300)) {
    const nick = cleanNickname(n);
    if (nick && /^[\w-]{1,64}$/.test(id)) out[id] = nick;
  }
  return out;
}

/** The name to show: your nickname for them, else their own username. */
export const shownName = (nicks: Record<string, string>, id: string | undefined, name: string) => (id && nicks[id]) || name;
