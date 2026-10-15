/**
 * Server-only: a daily allowance of AI calls per person, so a stranger can't use up the
 * site's free Gemini quota. Guests (anonymous sign-ins) get fewer calls than accounts.
 * Without Supabase (local runs, tests), or before migration 3 is run, there's no allowance.
 */
import { createSupabaseServer } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import type { AiError } from '../types';

const limit = (name: string, fallback: number) => Math.max(1, Number(process.env[name]) || fallback);

/** Count one AI call. Returns an error when the caller isn't signed in or is over today's allowance. */
export async function spendAiCall(): Promise<AiError | null> {
  if (!supabaseConfigured()) return null;
  const sb = await createSupabaseServer();
  const { data } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  const user = data.user;
  if (!user) return { code: 'unauthorized' };
  const max = user.is_anonymous ? limit('AI_DAILY_LIMIT_GUEST', 40) : limit('AI_DAILY_LIMIT_USER', 150);
  const { data: used, error } = await sb.rpc('use_ai');
  if (error) return null; // migration 3 not run yet, or a database hiccup: don't block studying
  return Number(used) > max ? { code: 'daily_limit' } : null;
}
