'use client';
/**
 * Bot check for sign-ins (Cloudflare Turnstile). Supabase's "Attack Protection → CAPTCHA" refuses every guest start and
 * email sign-in that doesn't carry a token, so this asks Turnstile for one right before each of those calls.
 *
 * It only switches on when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (a public key, safe in the browser). Without it
 * nothing changes: no script is loaded and no token is sent, which is also how a copy of the site without CAPTCHA works.
 * The widget is "interaction-only": invisible for nearly everyone, and it shows a small box at the bottom of the
 * screen only when Cloudflare needs the person to click.
 */
const SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MS = 60_000; // long enough for a person to tick the box

interface Turnstile {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

export const captchaEnabled = () => !!SITE_KEY;

let loading: Promise<Turnstile> | null = null;
let box: HTMLElement | null = null;
let widget = '';
let waiting: { ok: (t: string) => void; fail: (e: Error) => void } | null = null;
let queue: Promise<unknown> = Promise.resolve();

function load(): Promise<Turnstile> {
  if (!loading) {
    loading = new Promise<Turnstile>((ok, fail) => {
      if (window.turnstile) return ok(window.turnstile);
      const s = document.createElement('script');
      s.src = SCRIPT; s.async = true;
      s.onload = () => (window.turnstile ? ok(window.turnstile) : fail(new Error('captcha unavailable')));
      s.onerror = () => fail(new Error('captcha blocked'));
      document.head.appendChild(s);
    }).catch((e) => { loading = null; throw e; }); // try again next time (an ad blocker may have been switched off)
  }
  return loading;
}

async function ready(): Promise<Turnstile> {
  const t = await load();
  if (!box) {
    box = document.createElement('div');
    box.id = 'captchaBox';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:16px;display:flex;justify-content:center;z-index:2147483000;pointer-events:none';
    document.body.appendChild(box);
  }
  if (!widget) {
    widget = t.render(box, {
      sitekey: SITE_KEY, appearance: 'interaction-only', execution: 'execute',
      callback: (token: string) => { waiting?.ok(token); waiting = null; },
      'error-callback': () => { waiting?.fail(new Error('captcha failed')); waiting = null; },
      'timeout-callback': () => { waiting?.fail(new Error('captcha timed out')); waiting = null; },
    });
    // The box lets clicks through while invisible; the widget itself must be clickable when it shows.
    const frame = box.firstElementChild as HTMLElement | null;
    if (frame) frame.style.pointerEvents = 'auto';
  }
  return t;
}

/** Start loading Turnstile early, so the first sign-in doesn't wait for the script. */
export function preloadCaptcha() { if (SITE_KEY) void ready().catch(() => undefined); }

/** A fresh one-time token, or undefined when CAPTCHA isn't switched on. Rejects if the check can't run or fails. */
export function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return Promise.resolve(undefined);
  const run = async (): Promise<string> => {
    const t = await ready();
    return new Promise<string>((ok, fail) => {
      const timer = setTimeout(() => { waiting = null; fail(new Error('captcha timed out')); }, WAIT_MS);
      waiting = { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); } };
      t.reset(widget);
      t.execute(widget);
    });
  };
  const next = queue.then(run, run); // one check at a time; a token is used once
  queue = next.catch(() => undefined);
  return next;
}

/** Plain words for when the check couldn't run (most often an ad blocker or a flaky connection). */
export const CAPTCHA_HELP = 'The safety check couldn\'t run. Turn off any ad or script blocker for this site, check your connection, then try again.';
