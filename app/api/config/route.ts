// What the browser needs to know about this site's optional services: only on/off, nothing secret.
import { aiConfigured } from '@/lib/ai/provider';
import { unsplashConfigured } from '@/lib/unsplash-server';
import { lastfmConfigured } from '@/lib/lastfm-server';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ai: aiConfigured(),
    unsplash: unsplashConfigured(),
    lastfm: lastfmConfigured(),
  });
}
