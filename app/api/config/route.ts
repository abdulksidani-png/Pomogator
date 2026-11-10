// What the browser needs to know about this site's optional services. Nothing secret:
// a Spotify client ID is public by design (sign-in uses PKCE, with no client secret).
import { aiConfigured } from '@/lib/ai/provider';
import { unsplashConfigured } from '@/lib/unsplash-server';
import { lastfmConfigured } from '@/lib/lastfm-server';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ai: aiConfigured(),
    unsplash: unsplashConfigured(),
    spotifyClientId: (process.env.SPOTIFY_CLIENT_ID || '').trim(),
    lastfm: lastfmConfigured(),
  });
}
