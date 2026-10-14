'use client';
import { create } from 'zustand';

/** The current time, refreshed four times a second by the app's ticker. Only clock parts subscribe. */
export const useNow = create<{ now: number }>(() => ({ now: Date.now() }));

/** Scrolls to the study panel and puts the cursor in the first useful field. */
export function focusContext(hasTopic: boolean) {
  document.getElementById('ctxCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById(hasTopic ? 'ctxTopic' : 'ctxSubject')?.focus({ preventScroll: true }), 300);
}
