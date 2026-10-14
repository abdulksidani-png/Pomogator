import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';

// Where Google sign-in and email links send people back to.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const home = new URL('/', url.origin);
  const fail = (msg: string, extra?: Record<string, string>) => {
    home.searchParams.set('auth_error', msg);
    for (const [k, v] of Object.entries(extra ?? {})) home.searchParams.set(k, v);
    return NextResponse.redirect(home);
  };

  const errorCode = searchParams.get('error_code');
  if (errorCode) {
    // The Google account already has its own StudyBuddy account: sign in to that one instead,
    // and the guest's progress gets merged into it on the way in.
    if (errorCode === 'identity_already_exists') return fail('', { auth_next: 'google' });
    return fail(searchParams.get('error_description') || 'Sign-in didn\'t finish. Try again.');
  }

  const supabase = await createSupabaseServer();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message.includes('code verifier') ? 'Open the sign-in link in the same browser you requested it from.' : error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
  } else {
    return fail('That sign-in link is missing its code. Request a new one.');
  }

  home.searchParams.set('signed_in', '1');
  return NextResponse.redirect(home);
}
