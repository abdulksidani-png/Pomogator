/**
 * Pure helpers for documents: understanding goals like "up to the Aristotle slide",
 * matching what's on screen to a page, and spotting when the screen changed.
 */

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were', 'has', 'have', 'into', 'onto', 'its', 'our',
  'you', 'your', 'not', 'but', 'all', 'any', 'can', 'will', 'his', 'her', 'their', 'they', 'them', 'what', 'which', 'who',
  'how', 'why', 'when', 'where', 'also', 'more', 'most', 'some', 'such', 'than', 'then', 'there', 'these', 'those', 'one',
  'two', 'out', 'about', 'over', 'under', 'between', 'each', 'other', 'very', 'just', 'only',
]);

/** Words worth comparing: lowercase, letters/digits, 3+ characters, no filler words. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/* ---------------- goals ---------------- */

const GOAL_FILLER = new Set([
  'study', 'studying', 'until', 'till', 'through', 'thru', 'slide', 'slides', 'page', 'pages', 'get', 'reach', 'finish', 'end',
  'want', 'goal', 'before', 'section', 'part', 'lecture', 'chapter', 'topic', 'covering', 'cover', 'read', 'go', 'going', 'done',
  'learn', 'review', 'start', 'starting', 'stop', 'stopping', 'least', 'way',
]);

export interface GoalMatch { page: number; how: 'number' | 'title' | 'text' | 'end' }

/**
 * Turn a plain-language goal into the page to reach, searching from `from` onwards.
 * Understands "slide 18", "18", "the end", or words from a slide ("up to the Aristotle slide").
 */
export function resolveGoal(q: string, pages: { title: string; text?: string }[], from = 1): GoalMatch | null {
  const n = pages.length;
  if (!n) return null;
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const num = s.match(/^(?:up\s+to\s+|until\s+|through\s+)?(?:the\s+)?(?:slide|page|p\.?|#)?\s*(\d{1,4})$/) || s.match(/\b(?:slide|page)\s*#?\s*(\d{1,4})\b/);
  if (num) return { page: Math.min(n, Math.max(1, Number(num[1]))), how: 'number' };
  if (/\b(the\s+end|last\s+(slide|page)|whole|entire|everything|all\s+of\s+it)\b/.test(s)) return { page: n, how: 'end' };

  const kws = [...new Set(tokens(s).filter((w) => !GOAL_FILLER.has(w)))];
  if (!kws.length) return null;
  const start = Math.min(Math.max(1, from), n);
  let best: { page: number; score: number; how: 'title' | 'text' } | null = null;
  for (let i = start; i <= n; i++) {
    const p = pages[i - 1];
    const tt = new Set(tokens(p.title));
    const bt = new Set(tokens(p.text ?? ''));
    let score = 0;
    let inTitle = 0;
    for (const k of kws) {
      if (tt.has(k) || [...tt].some((t) => t.startsWith(k) || k.startsWith(t) && t.length >= 4)) { score += 3; inTitle++; }
      else if (bt.has(k)) score += 1;
    }
    if (inTitle === kws.length) return { page: i, how: 'title' }; // first slide titled with every word
    if (score > 0 && (!best || score > best.score)) best = { page: i, score, how: inTitle ? 'title' : 'text' };
  }
  return best ? { page: best.page, how: best.how } : null;
}

/* ---------------- matching the screen to a page ---------------- */

export interface PageIndex {
  idf: Map<string, number>;
  pages: { tokens: Set<string>; title: Set<string>; weight: number }[];
}

export function buildIndex(pages: { title: string; text: string }[]): PageIndex {
  const df = new Map<string, number>();
  const sets = pages.map((p) => {
    const t = new Set([...tokens(p.title), ...tokens(p.text)]);
    for (const w of t) df.set(w, (df.get(w) ?? 0) + 1);
    return { tokens: t, title: new Set(tokens(p.title)) };
  });
  const N = pages.length || 1;
  const idf = new Map<string, number>();
  for (const [w, c] of df) idf.set(w, Math.log(1 + N / c));
  return {
    idf,
    pages: sets.map((s) => ({ ...s, weight: [...s.tokens].reduce((a, w) => a + (idf.get(w) ?? 0), 0) })),
  };
}

export interface PageGuess { page: number; score: number; margin: number }

/**
 * Which page is showing? Scores each page by how much of its distinctive wording appears on
 * screen (and vice versa), with a bonus when the page's title is fully visible.
 */
export function matchPage(screenText: string, index: PageIndex): PageGuess | null {
  const n = index.pages.length;
  if (!n) return null;
  // A visible "12 / 40" or "Slide 12 of 40" counter is the strongest signal.
  const counter = screenText.match(/\b(\d{1,4})\s*(?:\/|of)\s*(\d{1,4})\b/i);
  if (counter && Number(counter[2]) === n && Number(counter[1]) >= 1 && Number(counter[1]) <= n) {
    return { page: Number(counter[1]), score: 1, margin: 1 };
  }
  const seen = new Set(tokens(screenText).filter((w) => index.idf.has(w)));
  if (!seen.size) return null;
  const seenWeight = [...seen].reduce((a, w) => a + (index.idf.get(w) ?? 0), 0);
  const scores = index.pages.map((p) => {
    let shared = 0;
    for (const w of seen) if (p.tokens.has(w)) shared += index.idf.get(w) ?? 0;
    if (!shared || !p.weight) return 0;
    const recall = shared / p.weight;   // how much of the page is on screen
    const precision = shared / seenWeight; // how much of the screen is this page
    let f = (2 * recall * precision) / (recall + precision);
    if (p.title.size && [...p.title].every((w) => seen.has(w))) f += 0.2;
    return f;
  });
  let bi = 0;
  for (let i = 1; i < n; i++) if (scores[i] > scores[bi]) bi = i;
  const second = Math.max(0, ...scores.filter((_, i) => i !== bi));
  return { page: bi + 1, score: scores[bi], margin: scores[bi] - second };
}

/** Good enough to trust without asking anyone. */
export const confident = (g: PageGuess | null) => !!g && g.score >= 0.3 && g.margin >= 0.08;

/* ---------------- change detection ---------------- */

/** 64-bit difference hash of a 9×8 grayscale thumbnail (72 luminance values, row by row). */
export function dHash(gray: ArrayLike<number>): string {
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
  return bits;
}

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Share of pixels that changed between two grayscale thumbnails (e.g. 64×36).
 * Slides built on the same template look alike at tiny sizes, so this compares at a
 * size where a new title or bullet clearly shows, while ignoring faint video noise.
 */
export function changedFraction(a: ArrayLike<number>, b: ArrayLike<number> | null, tolerance = 24): number {
  if (!b || a.length !== b.length || !a.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tolerance) n++;
  return n / a.length;
}

/** Big slide-title-sized text from OCR lines: the tallest line near the top. */
export function pickTitle(lines: { text: string; height: number; top: number }[], frameHeight: number): string {
  const usable = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length >= 3 && /[a-z]{2}/i.test(l.text));
  if (!usable.length) return '';
  const upper = usable.filter((l) => l.top < frameHeight * 0.45);
  const pool = upper.length ? upper : usable;
  return pool.reduce((a, b) => (b.height > a.height * 1.1 ? b : a)).text.slice(0, 120);
}
