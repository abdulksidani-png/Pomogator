/**
 * Browser side of the AI features. Every call goes to this site's own /api/ai/* routes,
 * which hold the Gemini API key on the server.
 */
import type { AiError, AiStatus, AssistantInput, AssistantReply, DayInput, DaySummary, DocDigest, Material, Plan, PlanInput, QuizInput, QuizQuestion } from './types';
import { cleanAssistant, cleanDay, cleanDigest, cleanPlan, cleanQuiz } from './quiz';

let status: AiStatus = 'checking';
let readyP: Promise<AiStatus> | null = null;

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`/api/ai/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw { code: 'cancelled' } satisfies AiError;
    throw { code: 'offline' } satisfies AiError;
  }
  const j = (await r.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!r.ok) {
    if (r.status === 503 && j?.code === 'not_configured') status = 'off';
    throw { code: j?.code || 'upstream_error', message: j?.message } satisfies AiError;
  }
  return j;
}

export const AI = {
  /** Asks the server once whether the AI is configured. */
  ready(): Promise<AiStatus> {
    if (!readyP) {
      readyP = fetch('/api/ai/status')
        .then((r) => (r.ok ? r.json() : { configured: false }))
        .then((j: { configured?: boolean }) => (status = j.configured ? 'on' : 'off'))
        .catch(() => (status = 'off'));
    }
    return readyP;
  },
  status: (): AiStatus => status,
  available: () => status === 'on',
  async quiz(input: QuizInput, signal?: AbortSignal): Promise<QuizQuestion[]> {
    return cleanQuiz(await post('quiz', input, signal), input.n);
  },
  async plan(input: PlanInput, signal?: AbortSignal): Promise<Plan> {
    return cleanPlan(await post('plan', input, signal));
  },
  async day(input: DayInput, signal?: AbortSignal): Promise<DaySummary> {
    return cleanDay(await post('day-summary', input, signal));
  },
  async digest(material: Material, signal?: AbortSignal): Promise<DocDigest> {
    return cleanDigest(await post('digest', { material }, signal), material.pageCount);
  },
  async assistant(input: AssistantInput, signal?: AbortSignal): Promise<AssistantReply> {
    return cleanAssistant(await post('assistant', input, signal));
  },
};
