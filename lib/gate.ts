/**
 * Guests (no account yet) can use the timer, to-dos and looks, but nothing that reaches the AI:
 * quizzes, plans, the study assistant, document uploads (every upload is read by the AI) and screen sharing.
 * That keeps the site's AI allowance for people it can be counted against. The server enforces the same rule
 * (lib/ai/quota.ts); this is the friendly side of it: ask to sign in instead of failing.
 * On a copy of the site without accounts (no Supabase) nobody is a guest, so nothing is held back.
 */
let guest: () => boolean = () => false;
/** The store registers how to tell (kept out of here so the AI client and the store can both import this). */
export const setGuestCheck = (fn: () => boolean) => { guest = fn; };
export const isGuest = () => guest();

export const NEED_ACCOUNT = 'pomogator:need-account';
/** True when the visitor is a guest: the feature must stop, and the "make a free account" dialog opens. */
export function needAccount(what: string): boolean {
  if (!guest()) return false;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NEED_ACCOUNT, { detail: what }));
  return true;
}
