import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_KEY, SUPABASE_URL } from './env';

/** A Supabase client for server routes, signed in as whoever sent the request. */
export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try { toSet.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a place that can't set cookies; the middleware refreshes them */ }
      },
    },
  });
}
