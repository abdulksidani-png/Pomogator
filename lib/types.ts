export type Phase = 'study' | 'quiz' | 'break';
export type RunStatus = 'idle' | 'running' | 'paused';
export type BreakKind = 'short' | 'long';
export type BreakReason = '' | 'quiz' | 'quiz-skipped' | 'short-session' | 'skipped' | 'manual';
export type Level = 'hs' | 'intro' | 'advanced' | 'exam';
export type Difficulty = 'gentle' | 'standard' | 'challenging';
export type Skin = 'auto' | 'notebook' | 'chalkboard' | 'tomato' | 'midnight' | 'sakura' | 'matcha' | 'sunset';
export type ClockFont = 'theme' | 'mono' | 'rounded' | 'serif' | 'condensed' | 'digital' | 'hand';
export type TimerStyle = 'classic' | 'ring' | 'minimal';
export type Background = 'theme' | 'plain' | 'dots' | 'grid' | 'lined' | 'gradient' | 'image';
export type Corners = 'theme' | 'sharp' | 'soft' | 'round';
export type DocKind = 'pdf' | 'pptx' | 'docx' | 'text' | 'image';

/** One page of a document: a PDF page, a PowerPoint slide or a section of a Word file. Numbered from 1. */
export interface DocPage { index: number; title: string; text: string }

/** What the app keeps about a document everywhere; the page text itself lives in IndexedDB and the database. */
export interface DocMeta {
  id: string;
  name: string;
  kind: DocKind;
  size: number;
  pageCount: number;
  titles: string[];
  createdAt: number;
  /** Furthest page reached in any session. */
  furthest: number;
  storagePath?: string;
}

export interface SeenEvent { at: number; page: number; title: string; source: 'screen' | 'manual'; conf?: number }
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
  // profile
  displayName: string;
  /** IANA time zone, e.g. "America/New_York". Empty means "detect on this device". */
  timezone: string;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: number;
  /** Hour a new day starts (0 = midnight, 4 = 4 AM). */
  rollover: number;
  streakFreeze: boolean;
  // appearance
  accent: string;
  clockFont: ClockFont;
  timerStyle: TimerStyle;
  background: Background;
  bgDim: number;
  mascot: 'auto' | 'on' | 'off';
  corners: Corners;
  density: 'comfortable' | 'compact';
  // screen tracking
  screenTrack: boolean;
  screenEvery: number;
  screenAskOnStart: boolean;
}

export interface SliceVersions { settings: number; context: number; app: number; tasks: number }

/** Bookkeeping for cloud sync. Persisted with the rest of the data on this device. */
export interface SyncState {
  /** The account this device's data belongs to ('' = never synced). */
  ownerId: string;
  ownerAnon: boolean;
  /** When each slice last changed here (ms). */
  v: SliceVersions;
  /** The newest version of each slice the server is known to have. */
  acked: SliceVersions;
  /** Session id → hash of the copy the server has. */
  pushed: Record<string, string>;
  lastPull: number;
  /** History was cleared here and still needs clearing in the account. */
  clearPending: boolean;
  /** Document id → hash of the copy the server has. */
  docsPushed: Record<string, string>;
  /** Documents deleted here that still need deleting in the account. */
  docsDeleted: string[];
}

export type AccountStatus = 'local' | 'connecting' | 'guest' | 'user';

export interface Account {
  status: AccountStatus;
  userId?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  syncing: boolean;
  error?: string;
  lastSynced?: number;
  /** Shown once after an email link is sent. */
  pendingEmail?: string;
  /** A setup step that's still needed, shown in the footer. */
  notice?: string;
}

export interface StudyContext {
  subject: string;
  topic: string;
  level: Level;
  exam: string;
  goal: string;
  notes: string;
  /** The document being studied ('' = none). */
  docId: string;
  /** The goal as typed, e.g. "up to the Aristotle slide". */
  docGoal: string;
  /** The page that goal resolves to (0 = no goal). */
  goalPage: number;
  /** Where the next session starts. */
  startPage: number;
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
  docId?: string;
  docName?: string;
  startPage?: number;
  goalPage?: number;
  /** Furthest page reached in this session. */
  endPage?: number;
  goalMet?: boolean;
  progressSource?: 'screen' | 'manual' | 'assumed';
  seen?: SeenEvent[];
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
