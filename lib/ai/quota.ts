/**
 * Server-only: a daily allowance of AI calls per person, so a stranger can't use up the site's AI
 * (Gemini's quota, or paid Claude credit). Guests (anonymous sign-ins) get no AI at all: every call belongs to an
 * account, so usage can be counted per person. The allowance is smaller when the answers come from paid Claude. With migration 7 there is also a
 * ceiling for the whole site per day (AI_DAILY_LIMIT_SITE), the backstop against a flood of new guests.
 * Without Supabase (local runs, tests), or before migration 3 is run, there's no allowance.
 */
import { createSupabaseServer } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import type { AiError } from '../types';

const limit = (name: string, fallback: number) => Math.max(1, Number(process.env[name]) || fallback);

/** Count one AI call. Returns an error when the caller isn't signed in or is over today's allowance. */
export async function spendAiCall(paid = false): Promise<AiError | null> {
  if (!supabaseConfigured()) return null;
  const sb = await createSupabaseServer();
  const { data } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  const user = data.user;
  if (!user) return { code: 'unauthorized' };
  if (user.is_anonymous) return { code: 'sign_in' };
  const max = limit('AI_DAILY_LIMIT_USER', paid ? 60 : 150);
  const { data: used, error } = await sb.rpc('use_ai');
  if (error) return null; // migration 3 not run yet, or a database hiccup: don't block studying
  if (Number(used) > max) return { code: 'daily_limit' };
  // Everyone together (migration 7; skipped until it's run).
  const site = await sb.rpc('ai_calls_today');
  if (!site.error && Number(site.data) > limit('AI_DAILY_LIMIT_SITE', paid ? 600 : 5000)) return { code: 'site_limit' };
  return null;
}
