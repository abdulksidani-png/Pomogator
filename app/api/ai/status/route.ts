// Tells the browser whether AI features are switched on.
// Phase 3 turns this on once the Claude routes exist and ANTHROPIC_API_KEY is set.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ configured: false });
}
