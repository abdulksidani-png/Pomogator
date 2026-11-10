// Every AI feature: quiz, plan, day summary, weekly report, document digests and the study assistant.
// Checks sign-in and the daily allowance, asks the AI (Claude or Gemini, lib/ai/provider.ts), and validates the reply.
import { BUDGET, aiConfigured, askJson, providers, spread } from '@/lib/ai/provider';
import { LIMITS, assistantSystem, dayPrompt, digestPrompt, planPrompt, quizPrompt, weeklyPrompt, workPlanPrompt } from '@/lib/ai/prompts';
import { spendAiCall } from '@/lib/ai/quota';
import { cleanAssistant, cleanDay, cleanDigest, cleanPlan, cleanQuiz, cleanWeekly } from '@/lib/quiz';
import type { AiError, AssistantInput, DayInput, Material, PlanInput, QuizImage, QuizInput, WeeklyInput, WorkPlanInput } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUS: Record<string, number> = {
  not_found: 404, not_configured: 503, unauthorized: 401, daily_limit: 429, site_limit: 429, rate_limited: 429, bad_request: 400,
  prompt_too_large: 413, refused: 422, bad_key: 502, model_missing: 502, invalid_json: 502, empty_completion: 502,
};

// Only the error code goes back to the browser; the AI company's own wording (which can name the account) stays in the server log.
const fail = (e: AiError) => Response.json({ code: e.code, ...(e.code === 'not_configured' ? { message: e.message } : {}), ...(e.why && /^(gemini|claude) \d{3}$/.test(e.why) ? { why: e.why } : {}) }, { status: STATUS[e.code] ?? 502 });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Screen snapshots for the quiz: at most six small JPEG/PNG images, anything else is dropped. */
function validImages(v: unknown, max = 6): QuizImage[] {
  return (Array.isArray(v) ? v : []).filter(isObj)
    .filter((im) => (im.mimeType === 'image/jpeg' || im.mimeType === 'image/png') && typeof im.data === 'string' && im.data.length < 600_000 && /^[A-Za-z0-9+/=]+$/.test(im.data.slice(0, 200)))
    .slice(0, max).map((im) => ({ mimeType: im.mimeType as string, data: im.data as string }));
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!['quiz', 'plan', 'plan-now', 'day-summary', 'assistant', 'digest', 'weekly'].includes(action)) return fail({ code: 'not_found' });
  if (!aiConfigured()) return fail({ code: 'not_configured', message: 'AI features are not set up on this site yet.' });
  const body = await req.json().catch(() => null);
  const needsCtx = action === 'quiz' || action === 'plan' || action === 'plan-now' || action === 'assistant';
  if (!isObj(body) || (needsCtx && !isObj(body.ctx)) || (action === 'digest' && !(isObj(body.material) && Array.isArray(body.material.pages)))) return fail({ code: 'bad_request' });
  const order = providers();
  const over = await spendAiCall(order[0] === 'claude');
  if (over) return fail(over);
  const signal = req.signal;

  try {
    if (action === 'quiz') {
      const input = body as unknown as QuizInput;
      const n = Math.min(3, Math.max(1, Number(input.n) || 3));
      const images = validImages(input.images);
      const raw = await askJson((p) => {
        const shots = spread(images, BUDGET[p].images);
        return { turns: [{ role: 'user', text: quizPrompt({ ...input, images: shots, n, weak: input.weak ?? [], asked: input.asked ?? [] }, BUDGET[p].material) }], images: shots, maxTokens: 2200, signal };
      }, order);
      const questions = cleanQuiz(raw, n);
      if (!questions.length) return fail({ code: 'invalid_json' });
      return Response.json({ questions });
    }
    if (action === 'plan') {
      const raw = await askJson(() => ({ turns: [{ role: 'user', text: planPrompt(body as unknown as PlanInput) }], maxTokens: 1200, signal }), order);
      return Response.json(cleanPlan(raw));
    }
    if (action === 'plan-now') {
      const w = body as unknown as WorkPlanInput;
      const input: WorkPlanInput = {
        ctx: w.ctx, studyMin: Number(w.studyMin) || 25,
        tasks: (Array.isArray(w.tasks) ? w.tasks : []).filter(isObj).slice(0, 30).map((t) => ({ text: String(t.text ?? '').slice(0, 200), done: !!t.done })),
        uploads: (Array.isArray(w.uploads) ? w.uploads : []).filter(isObj).slice(0, 6).map((u) => ({ name: String(u.name ?? '').slice(0, 120), topic: String(u.topic ?? '').slice(0, 120), summary: String(u.summary ?? '').slice(0, 900), concepts: (Array.isArray(u.concepts) ? u.concepts : []).map(String).slice(0, 10) })),
        ...(typeof w.screen === 'string' ? { screen: w.screen.slice(-8000) } : {}),
        weak: (Array.isArray(w.weak) ? w.weak : []).filter(isObj).slice(0, 6).map((c) => ({ concept: String(c.concept ?? ''), missed: Number(c.missed) || 0, seen: Number(c.seen) || 0 })),
      };
      const raw = await askJson(() => ({ turns: [{ role: 'user', text: workPlanPrompt(input) }], maxTokens: 1200, signal }), order);
      return Response.json(cleanPlan(raw));
    }
    if (action === 'digest') {
      const m = body.material as unknown as Material;
      const raw = await askJson((p) => ({ turns: [{ role: 'user', text: digestPrompt(m, BUDGET[p].material) }], temperature: 0.3, maxTokens: 1500, signal }), order);
      return Response.json(cleanDigest(raw, Number(m.pageCount) || m.pages.length));
    }
    if (action === 'weekly') {
      const w = body as unknown as WeeklyInput;
      if (!isObj(w.now) || !isObj(w.prev)) return fail({ code: 'bad_request' });
      const hints = (Array.isArray(w.hints) ? w.hints : []).filter((h): h is string => typeof h === 'string').slice(0, 3);
      const raw = await askJson(() => ({ turns: [{ role: 'user', text: weeklyPrompt({ ...w, hints, days: Array.isArray(w.days) ? w.days.slice(0, 7) : [], topics: Array.isArray(w.topics) ? w.topics.slice(0, 8) : [],
        missed: Array.isArray(w.missed) ? w.missed.slice(0, 8) : [], mastered: Array.isArray(w.mastered) ? w.mastered.slice(0, 8) : [], docs: Array.isArray(w.docs) ? w.docs.slice(0, 8) : [] }) }], temperature: 0.5, maxTokens: 900, signal }), order);
      return Response.json(cleanWeekly(raw, hints));
    }
    if (action === 'day-summary') {
      const raw = await askJson(() => ({ turns: [{ role: 'user', text: dayPrompt(body as unknown as DayInput) }], maxTokens: 700, signal }), order);
      return Response.json(cleanDay(raw));
    }
    const input = body as unknown as AssistantInput;
    // Photos the student attached ride on their own messages; only so many in one request, newest first.
    const turnsFor = (maxPhotos: number) => {
      let photos = maxPhotos;
      return (Array.isArray(input.messages) ? input.messages : [])
        .filter((m) => isObj(m) && typeof m.text === 'string' && m.text.trim())
        .slice(-LIMITS.chatTurns)
        .reverse()
        .map((m) => {
          const user = m.role !== 'assistant';
          const images = user && photos > 0 ? validImages(m.images, photos) : [];
          photos -= images.length;
          return { role: user ? 'user' as const : 'model' as const, text: m.text.slice(0, LIMITS.chatChars), ...(images.length ? { images } : {}) };
        })
        .reverse();
    };
    const check = turnsFor(0);
    if (!check.length || check[check.length - 1].role !== 'user') return fail({ code: 'bad_request' });
    const raw = await askJson((p) => ({ system: assistantSystem(input, BUDGET[p].material), turns: turnsFor(Math.min(LIMITS.chatPhotos, BUDGET[p].chatPhotos)), temperature: 0.6, maxTokens: 1800, signal }), order);
    return Response.json(cleanAssistant(raw));
  } catch (e) {
    const err = isObj(e) && typeof e.code === 'string' ? (e as unknown as AiError) : { code: 'upstream_error' };
    if (err.code !== 'cancelled' && err.code !== 'rate_limited') console.error('AI call failed:', action, err.code, err.message);
    return fail(err);
  }
}
