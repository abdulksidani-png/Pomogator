'use client';
/**
 * Full-screen timer ("focus mode"): the timer fills the screen, with the music widget in a corner.
 * The page asks the browser for real full screen; where that isn't allowed (iPhone Safari, or a refused
 * request) the timer still fills the window. Leaving the browser's full screen (Esc) leaves focus mode too.
 */
import { create } from 'zustand';

export const useFocusMode = create<{ on: boolean }>(() => ({ on: false }));

let browserFull = false;

export async function enterFocus() {
  if (useFocusMode.getState().on) return;
  useFocusMode.setState({ on: true });
  const el = document.documentElement;
  try {
    if (el.requestFullscreen && !document.fullscreenElement) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      browserFull = true;
    }
  } catch { browserFull = false; } // full window instead of full screen
}

export function exitFocus() {
  if (!useFocusMode.getState().on) return;
  useFocusMode.setState({ on: false });
  if (browserFull && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  browserFull = false;
}

export const toggleFocus = () => (useFocusMode.getState().on ? exitFocus() : void enterFocus());

/** Esc (or the browser's own "exit full screen") also leaves focus mode. Returns the cleanup. */
export function watchFullscreen() {
  const on = () => { if (!document.fullscreenElement && browserFull) { browserFull = false; exitFocus(); } };
  document.addEventListener('fullscreenchange', on);
  return () => document.removeEventListener('fullscreenchange', on);
}
