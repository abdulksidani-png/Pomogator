'use client';
// Spotify sends people back here after they sign in. Finish the sign-in, then return to the timer.
import { useEffect } from 'react';
import { finishSpotifyLogin } from '@/lib/spotify';

export default function SpotifyCallback() {
  useEffect(() => {
    void finishSpotifyLogin(new URLSearchParams(window.location.search)).then((problem) => {
      window.location.replace(problem ? `/?spotify_error=${encodeURIComponent(problem)}` : '/?spotify=connected');
    });
  }, []);
  return <p style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>Connecting Spotify…</p>;
}
