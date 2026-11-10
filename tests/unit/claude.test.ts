import { afterEach, describe, expect, it, vi } from 'vitest';
import { askClaude, claudeErrorFrom, claudeText } from '@/lib/ai/claude';
import { BUDGET, askJson, providers, spread } from '@/lib/ai/provider';

const ok = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }), { status: 200 });
const err = (status: number, type: string, message: string) => new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status });
const geminiOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Claude replies', () => {
  it('reads the text blocks and reports refusals and empty replies', () => {
    expect(claudeText({ content: [{ type: 'thinking' }, { type: 'text', text: '{"ok":1}' }] })).toBe('{"ok":1}');
    expect(() => claudeText({ content: [], stop_reason: 'refusal' })).toThrow(expect.objectContaining({ code: 'refused' }));
    expect(() => claudeText({ content: [] })).toThrow(expect.objectContaining({ code: 'empty_completion' }));
  });

  it('maps Anthropic errors to the app\'s error codes', () => {
    expect(claudeErrorFrom(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }).code).toBe('out_of_credit');
    expect(claudeErrorFrom(429, { error: { type: 'rate_limit_error' } }).code).toBe('rate_limited');
    expect(claudeErrorFrom(529, { error: { type: 'overloaded_error' } }).code).toBe('rate_limited');
    expect(claudeErrorFrom(401, { error: { type: 'authentication_error' } }).code).toBe('bad_key');
    expect(claudeErrorFrom(404, { error: { type: 'not_found_error' } }).code).toBe('model_missing');
    expect(claudeErrorFrom(400, { error: { message: 'prompt is too long: 250000 tokens' } }).code).toBe('prompt_too_large');
    expect(claudeErrorFrom(500, {}).code).toBe('upstream_error');
  });
});

describe('askClaude', () => {
  it('needs a key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(askClaude({ turns: [{ role: 'user', text: 'hi' }] })).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('uses the small model, caps the answer, sends the key only in a header, and retries once on bad JSON', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' secret \n');
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('not json')).mockResolvedValueOnce(ok('```json\n{"reply":"hi"}\n```'));
    vi.stubGlobal('fetch', fetchMock);
    const img = { mimeType: 'image/jpeg', data: 'AAAA' };
    const out = await askClaude({ system: 'be nice', maxTokens: 900, images: [img], turns: [
      { role: 'model', text: 'dropped: a chat can\'t start with the assistant' },
      { role: 'user', text: 'one' }, { role: 'user', text: 'two', images: [img] }, { role: 'model', text: 'ok' }, { role: 'user', text: 'three' },
    ] });
    expect(out).toEqual({ reply: 'hi' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('secret');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.body).not.toContain('secret');
    const body = JSON.parse(init.body);
    expect(body.model).toMatch(/haiku/);
    expect(body.max_tokens).toBe(900);
    expect(body.temperature).toBeUndefined();
    expect(body.system[0]).toEqual({ type: 'text', text: 'be nice', cache_control: { type: 'ephemeral' } });
    expect(body.system.at(-1).text).toMatch(/one JSON object/);
    // Same-role neighbours are joined so the turns alternate, starting with the student.
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[0].content.map((c: { type: string }) => c.type)).toEqual(['text', 'image', 'text']);
    expect(body.messages[2].content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'text', text: 'three' }]);
  });

  it('tries the backup model only when the first one no longer exists', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'k');
    const gone = vi.fn().mockResolvedValueOnce(err(404, 'not_found_error', 'model: x')).mockResolvedValueOnce(ok('{"a":1}'));
    vi.stubGlobal('fetch', gone);
    await expect(askClaude({ turns: [{ role: 'user', text: 'x' }] })).resolves.toEqual({ a: 1 });
    expect(JSON.parse(gone.mock.calls[1][1].body).model).not.toBe(JSON.parse(gone.mock.calls[0][1].body).model);

    const limited = vi.fn().mockResolvedValue(err(429, 'rate_limit_error', 'slow down'));
    vi.stubGlobal('fetch', limited);
    await expect(askClaude({ turns: [{ role: 'user', text: 'x' }] })).rejects.toMatchObject({ code: 'rate_limited' });
    expect(limited).toHaveBeenCalledTimes(1);
  });
});

describe('choosing the AI', () => {
  it('uses Claude when it has a key, then Gemini; AI_PROVIDER can put Gemini first', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ''); vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', '');
    expect(providers()).toEqual([]);
    vi.stubEnv('GEMINI_API_KEY', 'g');
    expect(providers()).toEqual(['gemini']);
    vi.stubEnv('ANTHROPIC_API_KEY', 'c');
    expect(providers()).toEqual(['claude', 'gemini']);
    vi.stubEnv('AI_PROVIDER', 'gemini');
    expect(providers()).toEqual(['gemini', 'claude']);
  });

  it('sends Claude less of a long document and fewer pictures than free Gemini', () => {
    expect(BUDGET.claude.material).toBeLessThan(BUDGET.gemini.material);
    expect(BUDGET.claude.images).toBeLessThan(BUDGET.gemini.images);
    expect(spread([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 4, 6]);
    expect(spread([1, 2], 3)).toEqual([1, 2]);
  });

  it('falls back to Gemini when Claude is out of credit, with a prompt built for each', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'c'); vi.stubEnv('GEMINI_API_KEY', 'g'); vi.stubEnv('AI_PROVIDER', '');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(err(400, 'invalid_request_error', 'Your credit balance is too low'))
      .mockResolvedValueOnce(geminiOk('{"from":"gemini"}'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await askJson((p) => ({ turns: [{ role: 'user', text: `for ${p}` }] }));
    expect(out).toEqual({ from: 'gemini' });
    expect(fetchMock.mock.calls[0][0]).toContain('anthropic.com');
    expect(fetchMock.mock.calls[1][0]).toContain('generativelanguage');
    expect(fetchMock.mock.calls[1][1].body).toContain('for gemini');
  });

  it('with Claude alone, running out of credit reads as a limit, and a refusal is never retried elsewhere', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'c'); vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(400, 'invalid_request_error', 'Your credit balance is too low')));
    await expect(askJson(() => ({ turns: [{ role: 'user', text: 'x' }] }))).rejects.toMatchObject({ code: 'rate_limited' });

    vi.stubEnv('GEMINI_API_KEY', 'g');
    const refuse = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }), { status: 200 }));
    vi.stubGlobal('fetch', refuse);
    await expect(askJson(() => ({ turns: [{ role: 'user', text: 'x' }] }))).rejects.toMatchObject({ code: 'refused' });
    expect(refuse).toHaveBeenCalledTimes(1);
  });
});
