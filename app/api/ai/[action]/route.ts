// Every AI feature: quiz, plan, day summary, weekly report, document digests and the study assistant.
// Checks sign-in and the daily allowance, asks Gemini (lib/ai/gemini.ts), and validates the reply.
import { askJson, geminiConfigured } from '@/lib/ai/gemini';
import { LIMITS, assistantSystem, dayPrompt, digestPrompt, planPrompt, quizPrompt, weeklyPrompt } from '@/lib/ai/prompts';
import { spendAiCall } from '@/lib/ai/quota';
import { cleanAssistant, cleanDay, cleanDigest, cleanPlan, cleanQuiz, cleanWeekly } from '@/lib/quiz';
import type { AiError, AssistantInput, DayInput, Material, PlanInput, QuizInput, WeeklyInput } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUS: Record<string, number> = {
  not_found: 404, not_configured: 503, unauthorized: 401, daily_limit: 429, rate_limited: 429, bad_request: 400,
  prompt_too_large: 413, refused: 422, bad_key: 502, model_missing: 502, invalid_json: 502, empty_completion: 502,
};

// Only the error code goes back to the browser; Google's own wording (which can name the project) stays in the server log.
const fail = (e: AiError) => Response.json({ code: e.code, ...(e.code === 'not_configured' ? { message: e.message } : {}) }, { status: STATUS[e.code] ?? 502 });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!['quiz', 'plan', 'day-summary', 'assistant', 'digest', 'weekly'].includes(action)) return fail({ code: 'not_found' });
  if (!geminiConfigured()) return fail({ code: 'not_configured', message: 'AI features are not set up on this site yet.' });
  const body = await req.json().catch(() => null);
  const needsCtx = action === 'quiz' || action === 'plan' || action === 'assistant';
  if (!isObj(body) || (needsCtx && !isObj(body.ctx)) || (action === 'digest' && !(isObj(body.material) && Array.isArray(body.material.pages)))) return fail({ code: 'bad_request' });
  const over = await spendAiCall();
  if (over) return fail(over);

  try {
    if (action === 'quiz') {
      const input = body as unknown as QuizInput;
      const n = Math.min(3, Math.max(1, Number(input.n) || 3));
      const raw = await askJson({ turns: [{ role: 'user', text: quizPrompt({ ...input, n, weak: input.weak ?? [], asked: input.asked ?? [] }) }], signal: req.signal });
      const questions = cleanQuiz(raw, n);
      if (!questions.length) return fail({ code: 'invalid_json' });
      return Response.json({ questions });
    }
    if (action === 'plan') {
      const raw = await askJson({ turns: [{ role: 'user', text: planPrompt(body as unknown as PlanInput) }], signal: req.signal });
      return Response.json(cleanPlan(raw));
    }
    if (action === 'digest') {
      const m = body.material as unknown as Material;
      const raw = await askJson({ turns: [{ role: 'user', text: digestPrompt(m) }], temperature: 0.3, signal: req.signal });
      return Response.json(cleanDigest(raw, Number(m.pageCount) || m.pages.length));
    }
    if (action === 'weekly') {
      const w = body as unknown as WeeklyInput;
      if (!isObj(w.now) || !isObj(w.prev)) return fail({ code: 'bad_request' });
      const hints = (Array.isArray(w.hints) ? w.hints : []).filter((h): h is string => typeof h === 'string').slice(0, 3);
      const raw = await askJson({ turns: [{ role: 'user', text: weeklyPrompt({ ...w, hints, days: Array.isArray(w.days) ? w.days.slice(0, 7) : [], topics: Array.isArray(w.topics) ? w.topics.slice(0, 8) : [],
        missed: Array.isArray(w.missed) ? w.missed.slice(0, 8) : [], mastered: Array.isArray(w.mastered) ? w.mastered.slice(0, 8) : [], docs: Array.isArray(w.docs) ? w.docs.slice(0, 8) : [] }) }], temperature: 0.5, signal: req.signal });
      return Response.json(cleanWeekly(raw, hints));
    }
    if (action === 'day-summary') {
      const raw = await askJson({ turns: [{ role: 'user', text: dayPrompt(body as unknown as DayInput) }], signal: req.signal });
      return Response.json(cleanDay(raw));
    }
    const input = body as unknown as AssistantInput;
    const turns = (Array.isArray(input.messages) ? input.messages : [])
      .filter((m) => isObj(m) && typeof m.text === 'string' && m.text.trim())
      .slice(-LIMITS.chatTurns)
      .map((m) => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, text: m.text.slice(0, LIMITS.chatChars) }));
    if (!turns.length || turns[turns.length - 1].role !== 'user') return fail({ code: 'bad_request' });
    const raw = await askJson({ system: assistantSystem(input), turns, temperature: 0.6, signal: req.signal });
    return Response.json(cleanAssistant(raw));
  } catch (e) {
    const err = isObj(e) && typeof e.code === 'string' ? (e as unknown as AiError) : { code: 'upstream_error' };
    if (err.code !== 'cancelled' && err.code !== 'rate_limited') console.error('AI call failed:', action, err.code, err.message);
    return fail(err);
  }
}
