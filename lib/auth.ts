'use client';
import { getSupabase } from './supabase/client';
import { useStudy } from './store';

const callbackUrl = () => `${window.location.origin}/auth/callback`;
const isGuest = () => useStudy.getState().account.status === 'guest';

function explain(e: { message?: string; code?: string } | null): string {
  const m = e?.message || '';
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Google sign-in isn\'t switched on for this site yet. Use the email link instead.';
  if (/rate limit|too many/i.test(m)) return 'Too many emails sent. Wait a few minutes, then try again.';
  if (/invalid.*email|valid email/i.test(m)) return 'That email address doesn\'t look right.';
  return m || 'Sign-in didn\'t work. Try again.';
}

/**
 * Google sign-in. A guest's account gets Google linked to it (so their progress stays put).
 * If that Google account already has a PomoGator account, the callback sends us back here
 * with ?auth_next=google and we sign in to it normally; the guest's data merges in.
 */
export async function signInWithGoogle(opts: { link?: boolean } = {}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign-in isn\'t set up on this site yet.');
  if (opts.link !== false && isGuest()) {
    const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: callbackUrl() } });
    if (!error) return; // the browser is on its way to Google
    if (!/manual linking|linking is disabled|not enabled/i.test(error.message)) throw new Error(explain(error));
  }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } });
  if (error) throw new Error(explain(error));
}

/**
 * Email sign-in with a magic link. A guest is upgraded in place by adding the email to
 * their account; if the email already has an account, we send a normal sign-in link.
 * Returns which kind of email went out.
 */
export async function sendEmailLink(email: string): Promise<'confirm' | 'link'> {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign-in isn\'t set up on this site yet.');
  const addr = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error('That email address doesn\'t look right.');
  if (isGuest()) {
    const { error } = await sb.auth.updateUser({ email: addr }, { emailRedirectTo: callbackUrl() });
    if (!error) return 'confirm';
    if (!(error.code === 'email_exists' || /already|exists|registered/i.test(error.message))) throw new Error(explain(error));
  }
  const { error } = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } });
  if (error) throw new Error(explain(error));
  return 'link';
}
