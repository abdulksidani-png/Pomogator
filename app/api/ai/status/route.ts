// Tells the browser whether AI features are switched on (ANTHROPIC_API_KEY or GEMINI_API_KEY is set on the server).
import { aiConfigured } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ configured: aiConfigured() });
}
