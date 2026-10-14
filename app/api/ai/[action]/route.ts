// Placeholder for every AI route (quiz, plan, day-summary, read-image, ...).
// Phase 3 replaces this with real Claude calls, sign-in checks and daily limits.
export const dynamic = 'force-dynamic';

export function POST() {
  return Response.json(
    { code: 'not_configured', message: 'AI features are not set up on this site yet.' },
    { status: 503 },
  );
}
