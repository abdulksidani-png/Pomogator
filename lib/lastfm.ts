'use client';
/** Browser side of Last.fm "now playing": asks /api/lastfm about the username saved in Settings → Music. */
import { create } from 'zustand';
import { withPause, type Playback } from './lastfm-core';

// Spotify sign-ins from before the move to Last.fm: nothing reads them any more.
try { localStorage.removeItem('studybuddy.spotify'); sessionStorage.removeItem('studybuddy.spotify.pkce'); localStorage.removeItem('studybuddy.spotify.pkce'); } catch { /* private window */ }

interface LastfmState {
  playback: Playback | null; checked: boolean; error: string; user: string;
  /** Last.fm answered, but with nothing recent enough to show: "nothing playing right now". */
  idle: boolean;
}
export const useLastfm = create<LastfmState>(() => ({ playback: null, checked: false, error: '', user: '', idle: false }));

/**
 * The last song seen playing in this browser (see withPause), kept across reloads so reopening the site still shows
 * the song you paused instead of an older one.
 */
const HELD = 'studybuddy.music';
let held: Playback | null = null;
let heldFor = '';
function loadHeld(user: string) {
  heldFor = user; held = null;
  try {
    const j = JSON.parse(localStorage.getItem(HELD) || 'null') as { user?: string; song?: Playback } | null;
    if (j?.user === user && j.song && typeof j.song.title === 'string' && typeof j.song.at === 'number') held = j.song;
  } catch { /* no storage */ }
}
function saveHeld(user: string) {
  try { if (held) localStorage.setItem(HELD, JSON.stringify({ user, song: held })); else localStorage.removeItem(HELD); } catch { /* no storage */ }
}

const MESSAGES: Record<string, (u: string) => string> = {
  no_user: (u) => `Last.fm has no user called "${u}". Check the spelling in Settings → Music.`,
  private: () => 'That Last.fm profile hides what it plays. On last.fm, open Settings → Privacy and turn off "Hide recent listening".',
  rate_limited: () => 'Last.fm is busy. Trying again shortly.',
};

/** Ask what `user` is playing. Keeps the last answer when offline or Last.fm is busy. */
export async function refreshLastfm(user: string) {
  if (useLastfm.getState().user !== user) useLastfm.setState({ user, playback: null, checked: false, error: '', idle: false });
  if (heldFor !== user) loadHeld(user);
  if (!user) return;
  try {
    const r = await fetch(`/api/lastfm?user=${encodeURIComponent(user)}`);
    const j = (await r.json().catch(() => null)) as { playback?: Playback | null; code?: string } | null;
    if (useLastfm.getState().user !== user) return; // changed while asking
    if (r.ok) {
      const polled = j?.playback ? { ...j.playback, at: Date.now() } : null;
      const next = withPause(held, polled);
      const changed = next.held?.title !== held?.title || next.held?.artist !== held?.artist || !!next.held !== !!held;
      held = next.held;
      if (changed || held) saveHeld(user); // also refreshes "last seen playing" while a song plays
      useLastfm.setState({ playback: next.show, idle: next.idle, checked: true, error: '' });
      return;
    }
    const msg = MESSAGES[j?.code ?? '']?.(user);
    useLastfm.setState({ checked: true, error: msg ?? 'Couldn\'t reach Last.fm. Trying again shortly.', ...(j?.code === 'no_user' || j?.code === 'private' ? { playback: null, idle: false } : {}) });
  } catch { /* offline: keep the last state */ }
}
