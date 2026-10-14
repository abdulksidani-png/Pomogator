import type { AiError, DaySummary, Plan, QuizQuestion } from './types';
import { clamp, shuffle, uid } from './util';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => String(v ?? '').trim();
const stripLetter = (s: unknown) => str(s).replace(/^\s*(?:\(?[A-Da-d]\)|[A-Da-d][.:)])\s+/, '').trim();

/**
 * Validate and normalize a quiz reply. Drops malformed questions, strips "A." prefixes,
 * and reshuffles options (keeping per-option feedback aligned) so the answer position varies.
 */
export function cleanQuiz(data: unknown, n: number, rand: () => number = Math.random): QuizQuestion[] {
  const arr: unknown[] = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.questions) ? data.questions : [];
  const out: QuizQuestion[] = [];
  for (const q of arr) {
    if (!isObj(q) || typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.options) || q.options.length !== 4) continue;
    const ci = Number(q.correctIndex);
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) continue;
    const opts = q.options.map(stripLetter);
    if (opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== 4) continue;
    const fb = Array.isArray(q.optionFeedback) && q.optionFeedback.length === 4 ? q.optionFeedback.map(str) : ['', '', '', ''];
    const order = shuffle([0, 1, 2, 3], rand);
    out.push({
      id: str(q.id) || uid(),
      concept: (str(q.concept) || 'Key idea').slice(0, 60),
      question: q.question.trim(),
      options: order.map((i) => opts[i]),
      correctIndex: order.indexOf(ci),
      explanation: str(q.explanation),
      memoryAid: str(q.memoryAid),
      optionFeedback: order.map((i) => fb[i]),
    });
    if (out.length >= n) break;
  }
  return out;
}

const list = (x: unknown, max = 6) => (Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, max) : []);

export function cleanPlan(d: unknown): Plan {
  if (!isObj(d)) throw { code: 'invalid_json' } satisfies AiError;
  const actions = (Array.isArray(d.actions) ? d.actions : [])
    .map((a) => ({
      minutes: clamp(Math.round(Number(isObj(a) ? a.minutes : 0) || 5), 1, 60),
      technique: (str(isObj(a) ? a.technique : '') || 'Study').slice(0, 40),
      step: str(isObj(a) ? a.step : ''),
    }))
    .filter((a) => a.step)
    .slice(0, 4);
  if (!actions.length) throw { code: 'invalid_json' } satisfies AiError;
  const sm = Math.round((Number(d.suggestedMinutes) || 25) / 5) * 5;
  return {
    summary: str(d.summary),
    strong: list(d.strong),
    review: list(d.review),
    actions,
    suggestedMinutes: clamp(sm, 25, 45),
    nextGoal: str(d.nextGoal).slice(0, 200),
  };
}

export function cleanDay(d: unknown): DaySummary {
  if (!isObj(d)) throw { code: 'invalid_json' } satisfies AiError;
  return { headline: str(d.headline), wins: list(d.wins, 5), gaps: list(d.gaps, 5), tomorrow: list(d.tomorrow, 5) };
}

/** Viewer-facing copy for every error code an AI call can fail with. */
export function aiErrorText(e: unknown): string {
  const code = isObj(e) ? String(e.code ?? '') : '';
  switch (code) {
    case 'not_configured': return 'Quizzes aren\'t switched on for this site yet. The timer works without them.';
    case 'unavailable': return 'Quizzes need Claude, which this site can\'t reach right now.';
    case 'offline': return 'You\'re offline, so no quiz this round.';
    case 'daily_limit': return 'You\'ve used today\'s AI allowance. The timer keeps working, and quizzes come back tomorrow.';
    case 'rate_limited': return 'Claude is busy right now. Try again in a minute.';
    case 'unauthorized': return 'Your sign-in expired. Sign in again, then try again.';
    case 'refused': return 'Claude declined to write questions for this topic. Try rewording the topic.';
    case 'prompt_too_large': return 'Your notes are too long. Trim them and try again.';
    case 'invalid_json': case 'empty_completion': return 'The reply came back incomplete. Try again.';
    default: return 'Couldn\'t reach Claude. Check your connection and try again.';
  }
}
