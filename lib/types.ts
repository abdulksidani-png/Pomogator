export type Phase = 'study' | 'quiz' | 'break';
export type RunStatus = 'idle' | 'running' | 'paused';
export type BreakKind = 'short' | 'long';
export type BreakReason = '' | 'quiz' | 'quiz-skipped' | 'short-session' | 'skipped' | 'manual';
export type Level = 'hs' | 'intro' | 'advanced' | 'exam';
export type Difficulty = 'gentle' | 'standard' | 'challenging';
export type Skin = 'auto' | 'notebook' | 'chalkboard' | 'tomato';
export type AiStatus = 'checking' | 'on' | 'off';

/** Break minutes by quiz score: 100%, 50–99%, below 50%, and no quiz. */
export interface Tier { max: number; mid: number; min: number; none: number }

export interface Settings {
  studyMin: number;
  longEvery: number;
  loop: boolean;
  tiers: { short: Tier; long: Tier };
  questions: number;
  difficulty: Difficulty;
  chime: string;
  chimeVol: number;
  ambStudy: string;
  ambBreak: string;
  ambVol: number;
  skin: Skin;
  notify: boolean;
  wake: boolean;
}

export interface StudyContext {
  subject: string;
  topic: string;
  level: Level;
  exam: string;
  goal: string;
  notes: string;
}

export interface QuizItemResult {
  concept: string;
  question: string;
  chosen: string;
  answer: string;
  correct: boolean;
}

export type QuizOutcomeStatus = 'done' | 'partial' | 'skipped' | 'too-short' | 'unavailable' | 'no-topic';

export interface QuizOutcome {
  status: QuizOutcomeStatus;
  score?: number;
  total?: number;
  items?: QuizItemResult[];
}

export interface SessionRecord {
  id: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  plannedMin: number;
  studiedMin?: number;
  subject: string;
  topic: string;
  level: Level;
  goal: string;
  quiz?: QuizOutcome;
  breakMin?: number;
  breakKind?: BreakKind;
}

export interface LastResult {
  score: number | null;
  total: number;
  items: QuizItemResult[];
  mins: number;
  kind: BreakKind;
  reason: BreakReason;
  at: number;
}

export interface TimerState {
  phase: Phase;
  status: RunStatus;
  totalMs: number;
  remainingMs: number;
  endAt: number;
  breakKind: BreakKind;
  breakReason: BreakReason;
  session: SessionRecord | null;
  cycleDone: number;
  lastResult: LastResult | null;
  lastSessionId: string;
  refreshTried: boolean;
  countedCycle: boolean;
  studiedMs: number;
}

export interface QuizQuestion {
  id: string;
  concept: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  memoryAid: string;
  optionFeedback: string[];
}

export interface QuizAnswer { chosen: number; correct: boolean }

export interface QuizState {
  ctxKey: string;
  gen: 'none' | 'loading' | 'ready' | 'failed' | 'off';
  error: string;
  questions: QuizQuestion[];
  madeOn: string;
  used: boolean;
  step: 'intro' | 'question' | 'feedback';
  index: number;
  answers: (QuizAnswer | null)[];
  forTopic: string;
}

export interface PlanAction { minutes: number; technique: string; step: string }

export interface Plan {
  summary: string;
  strong: string[];
  review: string[];
  actions: PlanAction[];
  suggestedMinutes: number;
  nextGoal: string;
}

export interface QuizResult { score: number; total: number; items: QuizItemResult[] }

export interface PlanInput {
  ctx: StudyContext;
  result: QuizResult;
  studyMin: number;
  history: { date: string; studiedMin?: number; score: number | null; total: number }[];
  weak: { concept: string; missed: number; seen: number }[];
}

export interface PlanState {
  status: 'none' | 'loading' | 'ready' | 'failed';
  topic?: string;
  applied?: boolean;
  input?: PlanInput;
  data?: Plan;
  error?: string;
}

export interface DaySummary { headline: string; wins: string[]; gaps: string[]; tomorrow: string[] }

export interface DayState {
  date: string;
  status: 'none' | 'loading' | 'ready' | 'failed';
  data?: DaySummary;
  error?: string;
}

export interface Task { id: string; text: string; done: boolean }

export interface ConceptStat {
  topic: string;
  concept: string;
  seen: number;
  missed: number;
  streak: number;
  last: number;
}

export interface Asked { date: string; items: string[] }

export interface QuizInput {
  ctx: StudyContext;
  n: number;
  difficulty: Difficulty;
  weak: string[];
  asked: string[];
}

export interface DayInput {
  sessions: { time: string; topic: string; studiedMin?: number; quiz: string; missed: string[] }[];
  weak: { concept: string; missed: number; seen: number }[];
}

/** Error shape every AI call rejects with. */
export interface AiError { code: string; message?: string }
