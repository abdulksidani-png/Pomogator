import type { AiError, AssistantReply, DaySummary, DocDigest, Plan, ProposedTask, QuizQuestion, WeeklyAi } from './types';
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

/** Validate the weekly report's AI part: a headline, a 2–3 sentence summary and three focus steps. */
export function cleanWeekly(d: unknown, fallbackFocus: string[] = []): WeeklyAi {
  if (!isObj(d)) throw { code: 'invalid_json' } satisfies AiError;
  const summary = str(d.summary).slice(0, 700);
  if (!summary) throw { code: 'empty_completion' } satisfies AiError;
  const focus = list(d.focus, 3).map((f) => f.slice(0, 220));
  return { headline: str(d.headline).slice(0, 120), summary, focus: focus.length ? focus : fallbackFocus.slice(0, 3) };
}

/** Validate a document digest: a topic, a summary, key concepts and section notes. */
export function cleanDigest(d: unknown, pageCount: number): DocDigest {
  if (!isObj(d)) throw { code: 'invalid_json' } satisfies AiError;
  const summary = str(d.summary).slice(0, 900);
  if (!summary) throw { code: 'empty_completion' } satisfies AiError;
  const sections = (Array.isArray(d.sections) ? d.sections : []).filter(isObj).map((x) => {
    const from = clamp(Math.round(Number(x.from) || 1), 1, Math.max(1, pageCount));
    return { from, to: clamp(Math.round(Number(x.to) || from), from, Math.max(1, pageCount)), title: str(x.title).slice(0, 80), summary: str(x.summary).slice(0, 300) };
  }).filter((x) => x.title || x.summary).slice(0, 12);
  return { topic: str(d.topic).slice(0, 80), summary, concepts: list(d.concepts, 10).map((c) => c.slice(0, 60)), sections };
}

/** Validate the assistant's reply: a message, plus any to-do items it proposed. */
export function cleanAssistant(d: unknown): AssistantReply {
  if (!isObj(d)) throw { code: 'invalid_json' } satisfies AiError;
  const reply = str(d.reply).slice(0, 8000);
  const tasks: ProposedTask[] = (Array.isArray(d.tasks) ? d.tasks : [])
    .map((t) => ({
      text: str(isObj(t) ? t.text : t).replace(/\s+/g, ' ').slice(0, 140),
      sessions: clamp(Math.round(Number(isObj(t) ? t.sessions : 1) || 1), 1, 12),
    }))
    .filter((t) => t.text)
    .slice(0, 20);
  if (!reply && !tasks.length) throw { code: 'empty_completion' } satisfies AiError;
  return { reply: reply || 'Here\'s a to-do list for you.', tasks };
}

/** How a proposed task reads in the to-do list, e.g. "Read chapter 4 · 2 sessions". */
export const taskLine = (t: ProposedTask) => `${t.text} · ${t.sessions} session${t.sessions === 1 ? '' : 's'}`;

/** Viewer-facing copy for every error code an AI call can fail with. */
export function aiErrorText(e: unknown): string {
  const code = isObj(e) ? String(e.code ?? '') : '';
  switch (code) {
    case 'not_configured': return 'Quizzes aren\'t switched on for this site yet. The timer works without them.';
    case 'unavailable': return 'The AI can\'t be reached right now.';
    case 'offline': return 'You\'re offline, so no quiz this round.';
    case 'daily_limit': return 'You\'ve used today\'s AI allowance. The timer keeps working, and the AI comes back tomorrow.';
    case 'rate_limited': return 'The free AI limit was reached for now. Wait a minute and try again; if it keeps happening, it resets tomorrow.';
    case 'unauthorized': return 'Your sign-in expired. Sign in again, then try again.';
    case 'refused': return 'The AI declined this request. Try rewording it.';
    case 'bad_key': case 'model_missing': return 'The AI isn\'t working on this site right now. The timer works without it; try again later.';
    case 'prompt_too_large': return 'Your notes are too long. Trim them and try again.';
    case 'invalid_json': case 'empty_completion': return 'The reply came back incomplete. Try again.';
    default: return 'Couldn\'t reach the AI. Check your connection and try again.';
  }
}
