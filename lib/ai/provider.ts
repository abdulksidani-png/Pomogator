/**
 * Server-only: which AI answers. Claude (ANTHROPIC_API_KEY, paid per use) when its key is set, else Google
 * Gemini (GEMINI_API_KEY, free tier). With both keys, the other one steps in when the first can't answer
 * (out of credit, over its limit, a bad key), so quizzes keep working. AI_PROVIDER=gemini or =claude puts
 * that one first.
 */
import type { AiError } from '../types';
import { askClaude, claudeConfigured } from './claude';
import { askJson as askGemini, geminiConfigured, type Image, type Turn } from './gemini';

export type Provider = 'claude' | 'gemini';

/** The AIs with a key, in the order they're tried. */
export function providers(): Provider[] {
  const have: Provider[] = [...(claudeConfigured() ? ['claude' as const] : []), ...(geminiConfigured() ? ['gemini' as const] : [])];
  const first = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  return first === 'gemini' || first === 'claude' ? [...have.filter((p) => p === first), ...have.filter((p) => p !== first)] : have;
}
export const aiConfigured = () => providers().length > 0;

/**
 * How much is sent with each request. Claude is paid by the amount of text read and written, so it gets a
 * smaller slice of a long document and fewer pictures than free Gemini.
 */
export const BUDGET: Record<Provider, { material: number; images: number; chatPhotos: number }> = {
  claude: { material: 24_000, images: 3, chatPhotos: 2 },
  gemini: { material: 60_000, images: 6, chatPhotos: 4 },
};

/** At most `n` items, spread evenly over the list (so a long session keeps its first and last screen snapshots). */
export function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  if (n <= 1) return items.slice(-1);
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

const SWITCH = new Set(['timeout', 'rate_limited', 'out_of_credit', 'bad_key', 'model_missing', 'upstream_error', 'prompt_too_large']);

export interface Ask { system?: string; turns: Turn[]; images?: Image[]; temperature?: number; maxTokens?: number; signal?: AbortSignal }

/**
 * Ask for a JSON reply from the first AI that can answer. `build` makes the request for a given AI, so each
 * one gets a prompt sized to its budget.
 */
export async function askJson(build: (p: Provider) => Ask, order: Provider[] = providers()): Promise<unknown> {
  if (!order.length) throw { code: 'not_configured' } satisfies AiError;
  let lastErr: AiError = { code: 'upstream_error' };
  for (const p of order) {
    try {
      const ask = build(p);
      return await (p === 'claude' ? askClaude(ask) : askGemini(ask));
    } catch (e) {
      lastErr = e as AiError;
      if (!SWITCH.has(lastErr.code)) throw lastErr;
      if (order.length > 1) console.warn(`AI: ${p} couldn't answer (${lastErr.code}); trying the next one.`);
    }
  }
  // Out of credit reads as "limit reached" to the student; the server log has the real reason.
  throw lastErr.code === 'out_of_credit' ? { code: 'rate_limited', message: lastErr.message } : lastErr;
}
