'use client';
/** Browser side of Last.fm "now playing": asks /api/lastfm about the username saved in Settings → Music. */
import { create } from 'zustand';
import { withPause, type Playback } from './lastfm-core';

// Spotify sign-ins from before the move to Last.fm: nothing reads them any more.
try { localStorage.removeItem('studybuddy.spotify'); sessionStorage.removeItem('studybuddy.spotify.pkce'); localStorage.removeItem('studybuddy.spotify.pkce'); } catch { /* private window */ }

interface LastfmState { playback: Playback | null; checked: boolean; error: string; user: string }
/** The last song seen playing on this page (see withPause). */
let held: Playback | null = null;
export const useLastfm = create<LastfmState>(() => ({ playback: null, checked: false, error: '', user: '' }));

const MESSAGES: Record<string, (u: string) => string> = {
  no_user: (u) => `Last.fm has no user called "${u}". Check the spelling in Settings → Music.`,
  private: () => 'That Last.fm profile hides what it plays. On last.fm, open Settings → Privacy and turn off "Hide recent listening".',
  rate_limited: () => 'Last.fm is busy. Trying again shortly.',
};

/** Ask what `user` is playing. Keeps the last answer when offline or Last.fm is busy. */
export async function refreshLastfm(user: string) {
  if (useLastfm.getState().user !== user) { held = null; useLastfm.setState({ user, playback: null, checked: false, error: '' }); }
  if (!user) return;
  try {
    const r = await fetch(`/api/lastfm?user=${encodeURIComponent(user)}`);
    const j = (await r.json().catch(() => null)) as { playback?: Playback | null; code?: string } | null;
    if (useLastfm.getState().user !== user) return; // changed while asking
    if (r.ok) {
      const polled = j?.playback ? { ...j.playback, at: Date.now() } : null;
      const next = withPause(held, polled);
      held = next.held;
      useLastfm.setState({ playback: next.show, checked: true, error: '' });
      return;
    }
    const msg = MESSAGES[j?.code ?? '']?.(user);
    useLastfm.setState({ checked: true, error: msg ?? 'Couldn\'t reach Last.fm. Trying again shortly.', ...(j?.code === 'no_user' || j?.code === 'private' ? { playback: null } : {}) });
  } catch { /* offline: keep the last state */ }
}
