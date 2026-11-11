import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from '@/lib/supabase/env';

// Keeps the sign-in cookie fresh on every request, so server routes can trust it.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseConfigured()) return response;
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try { await supabase.auth.getUser(); } catch { /* Supabase unreachable: carry on, the page still works */ }
  return response;
}

// Only pages, the sign-in callback and the AI routes need it. Everything else (files, the vendor scripts, and the
// music / photo / config routes, which are polled or cached for everyone) skips it: each run asks Supabase who the
// visitor is, which would be one extra request per file and per music check, and a refreshed cookie must never ride
// on a reply that is cached for other people.
export const config = {
  matcher: ['/((?!_next/|vendor/|api/lastfm|api/unsplash|api/config|api/ai/status|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js|mjs|css|json|wasm|map|txt|xml|gz|traineddata)$).*)'],
};
