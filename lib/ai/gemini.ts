/**
 * Server-only: talks to Google's Gemini API with the key in GEMINI_API_KEY.
 * The key never reaches the browser. Replies are requested as JSON and parsed here;
 * a reply that isn't valid JSON is retried once.
 */
import type { AiError } from '../types';

const BASE = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
/** "Latest" aliases follow Google's newest Flash models, so the site doesn't break when old ones retire. */
const MODELS = () => [process.env.GEMINI_MODEL || 'gemini-flash-latest', process.env.GEMINI_MODEL_BACKUP || 'gemini-flash-lite-latest'];

/** The key, trimmed (a pasted key often carries a space or line break). GOOGLE_API_KEY works too. */
const apiKey = () => (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
export const geminiConfigured = () => !!apiKey();

export interface Turn { role: 'user' | 'model'; text: string }
export interface Image { mimeType: string; data: string }

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

const fail = (code: string, message?: string): AiError => ({ code, message });

async function call(model: string, body: unknown, signal?: AbortSignal): Promise<GeminiReply & { httpStatus: number }> {
  let r: Response;
  try {
    r = await fetch(`${BASE()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw fail('cancelled');
    throw fail('upstream_error', 'Couldn\'t reach Google.');
  }
  const j = (await r.json().catch(() => ({}))) as GeminiReply;
  return { ...j, httpStatus: r.status };
}

/** Turn Google's error into one of the app's error codes. */
export function errorFrom(status: number, j: GeminiReply): AiError {
  const msg = j.error?.message ?? '';
  if (status === 429 || j.error?.status === 'RESOURCE_EXHAUSTED') return fail('rate_limited', msg);
  if (status === 400 && /api key/i.test(msg)) return fail('bad_key', msg);
  if (status === 401 || status === 403) return fail('bad_key', msg);
  if (status === 404) return fail('model_missing', msg);
  if (status === 400 && /token|too large|exceeds/i.test(msg)) return fail('prompt_too_large', msg);
  return fail('upstream_error', msg || `Google returned ${status}.`);
}

/** The text of the first answer, skipping any "thinking" parts. */
export function replyText(j: GeminiReply): string {
  if (j.promptFeedback?.blockReason) throw fail('refused');
  const c = j.candidates?.[0];
  if (!c) throw fail('empty_completion');
  if (c.finishReason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(c.finishReason)) throw fail('refused');
  const text = (c.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text.trim()) throw fail('empty_completion');
  return text;
}

/** Parse JSON, tolerating a ```json fence or text around the object. */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw fail('invalid_json');
}

/**
 * Ask for a JSON reply. `turns` is the conversation (the last one is the student's);
 * `system` holds standing instructions. Falls back to the backup model when the main one
 * is missing or out of free quota, and retries once when the JSON doesn't parse.
 */
export async function askJson(opts: { system?: string; turns: Turn[]; images?: Image[]; temperature?: number; signal?: AbortSignal }): Promise<unknown> {
  if (!geminiConfigured()) throw fail('not_configured');
  const contents = opts.turns.map((t, i) => ({
    role: t.role,
    parts: [
      ...(i === opts.turns.length - 1 ? (opts.images ?? []).map((im) => ({ inlineData: im })) : []),
      { text: t.text },
    ],
  }));
  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents,
    generationConfig: { responseMimeType: 'application/json', temperature: opts.temperature ?? 0.7 },
  };
  let lastErr: AiError = fail('upstream_error');
  for (const model of MODELS()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const j = await call(model, body, opts.signal);
      if (j.httpStatus !== 200) {
        lastErr = errorFrom(j.httpStatus, j);
        break; // try the backup model (helps when one model's free quota is used up)
      }
      try { return parseJson(replyText(j)); }
      catch (e) {
        lastErr = e as AiError;
        if (lastErr.code !== 'invalid_json' && lastErr.code !== 'empty_completion') throw lastErr;
      }
    }
    if (lastErr.code === 'bad_key' || lastErr.code === 'refused') break;
  }
  throw lastErr;
}
