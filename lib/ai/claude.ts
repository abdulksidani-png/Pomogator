/**
 * Server-only: talks to Anthropic's Claude API (the Messages API) with the key in ANTHROPIC_API_KEY.
 * The key never reaches the browser. This API is paid per use, so everything here is set up to be cheap:
 * the smallest Claude model, a cap on how long each answer can be, and the standing instructions marked
 * cacheable (repeat messages in one chat re-read the document at a fraction of the price).
 */
import type { AiError } from '../types';
import { parseJson, type Image, type Turn } from './gemini';

const BASE = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
/** The smallest, cheapest Claude model first; the backup is used if the first one is ever retired. */
const MODELS = () => [process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', process.env.ANTHROPIC_MODEL_BACKUP || 'claude-haiku-4-5'];

/** The key, trimmed (a pasted key often carries a space or line break). */
const apiKey = () => (process.env.ANTHROPIC_API_KEY || '').trim();
export const claudeConfigured = () => !!apiKey();

interface ClaudeReply {
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  error?: { type?: string; message?: string };
}

const fail = (code: string, message?: string): AiError => ({ code, message });
const JSON_ONLY = 'Reply with one JSON object and nothing else: no markdown, no code fence, no text before or after it.';

async function call(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ClaudeReply & { httpStatus: number }> {
  let r: Response;
  try {
    r = await fetch(`${BASE()}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ ...body, model }),
      signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw fail('cancelled');
    throw fail('upstream_error', 'Couldn\'t reach Anthropic.');
  }
  const j = (await r.json().catch(() => ({}))) as ClaudeReply;
  return { ...j, httpStatus: r.status };
}

/** Turn Anthropic's error into one of the app's error codes. */
export function claudeErrorFrom(status: number, j: ClaudeReply): AiError {
  const msg = j.error?.message ?? '';
  const type = j.error?.type ?? '';
  if (/credit balance|billing/i.test(msg) || type === 'billing_error') return fail('out_of_credit', msg);
  if (status === 429 || status === 529 || type === 'rate_limit_error' || type === 'overloaded_error') return fail('rate_limited', msg);
  if (status === 401 || status === 403) return fail('bad_key', msg);
  if (status === 404) return fail('model_missing', msg);
  if (status === 413 || (status === 400 && /too long|too large|maximum|exceed/i.test(msg))) return fail('prompt_too_large', msg);
  return fail('upstream_error', msg || `Anthropic returned ${status}.`);
}

/** The text of the answer (skipping any thinking blocks). */
export function claudeText(j: ClaudeReply): string {
  if (j.stop_reason === 'refusal') throw fail('refused');
  const text = (j.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
  if (!text.trim()) throw fail('empty_completion');
  return text;
}

const imageBlock = (im: Image) => ({ type: 'image', source: { type: 'base64', media_type: im.mimeType, data: im.data } });

/**
 * Ask Claude for a JSON reply. Same contract as the Gemini client: `turns` is the conversation (the last one is
 * the student's), `system` holds standing instructions. `maxTokens` caps the length (and cost) of the answer.
 * Falls back to the backup model when the first is missing, and retries once when the JSON doesn't parse.
 */
export async function askClaude(opts: { system?: string; turns: Turn[]; images?: Image[]; maxTokens?: number; signal?: AbortSignal }): Promise<unknown> {
  if (!claudeConfigured()) throw fail('not_configured');
  // Claude wants the turns to alternate, starting with the student: join neighbours with the same role.
  const messages: { role: 'user' | 'assistant'; content: Record<string, unknown>[] }[] = [];
  opts.turns.forEach((t, i) => {
    const role = t.role === 'model' ? 'assistant' as const : 'user' as const;
    const blocks = [
      ...(role === 'user' ? (t.images ?? []).map(imageBlock) : []),
      ...(i === opts.turns.length - 1 ? (opts.images ?? []).map(imageBlock) : []),
      { type: 'text', text: t.text },
    ];
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else if (messages.length || role === 'user') messages.push({ role, content: blocks });
  });
  const system = [
    ...(opts.system ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }] : []),
    { type: 'text', text: JSON_ONLY },
  ];
  const body = { max_tokens: Math.min(4000, Math.max(200, opts.maxTokens ?? 1500)), system, messages };

  let lastErr: AiError = fail('upstream_error');
  for (const model of MODELS()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const j = await call(model, body, opts.signal);
      if (j.httpStatus !== 200) {
        lastErr = { ...claudeErrorFrom(j.httpStatus, j), why: `claude ${j.httpStatus}` };
        // A busy server (500/529) usually passes in a moment: wait briefly and ask once more.
        if (j.httpStatus >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 900)); continue; }
        break;
      }
      try { return parseJson(claudeText(j)); }
      catch (e) {
        lastErr = e as AiError;
        if (lastErr.code !== 'invalid_json' && lastErr.code !== 'empty_completion') throw lastErr;
      }
    }
    if (lastErr.code !== 'model_missing') break; // only a retired model is worth trying the backup for
  }
  throw lastErr;
}
