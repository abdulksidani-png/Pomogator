'use client';
/** Browser side of Last.fm "now playing": asks /api/lastfm about the username saved in Settings → Music. */
import { create } from 'zustand';
import type { Playback } from './spotify';

interface LastfmState { playback: Playback | null; checked: boolean; error: string; user: string }
export const useLastfm = create<LastfmState>(() => ({ playback: null, checked: false, error: '', user: '' }));

const MESSAGES: Record<string, (u: string) => string> = {
  no_user: (u) => `Last.fm has no user called "${u}". Check the spelling in Settings → Music.`,
  private: () => 'That Last.fm profile hides what it plays. On last.fm, open Settings → Privacy and turn off "Hide recent listening".',
  rate_limited: () => 'Last.fm is busy. Trying again shortly.',
};

/** Ask what `user` is playing. Keeps the last answer when offline or Last.fm is busy. */
export async function refreshLastfm(user: string) {
  if (useLastfm.getState().user !== user) useLastfm.setState({ user, playback: null, checked: false, error: '' });
  if (!user) return;
  try {
    const r = await fetch(`/api/lastfm?user=${encodeURIComponent(user)}`);
    const j = (await r.json().catch(() => null)) as { playback?: Playback | null; code?: string } | null;
    if (useLastfm.getState().user !== user) return; // changed while asking
    if (r.ok) { useLastfm.setState({ playback: j?.playback ? { ...j.playback, at: Date.now() } : null, checked: true, error: '' }); return; }
    const msg = MESSAGES[j?.code ?? '']?.(user);
    useLastfm.setState({ checked: true, error: msg ?? 'Couldn\'t reach Last.fm. Trying again shortly.', ...(j?.code === 'no_user' || j?.code === 'private' ? { playback: null } : {}) });
  } catch { /* offline: keep the last state */ }
}
