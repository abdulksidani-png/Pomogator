// Tells the browser whether AI features are switched on (GEMINI_API_KEY is set on the server).
import { geminiConfigured } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ configured: geminiConfigured() });
}
