export type Phase = 'study' | 'quiz' | 'break';
export type RunStatus = 'idle' | 'running' | 'paused';
export type BreakKind = 'short' | 'long';
export type BreakReason = '' | 'quiz' | 'quiz-skipped' | 'short-session' | 'skipped' | 'manual';
export type Level = 'hs' | 'intro' | 'advanced' | 'exam';
export type Difficulty = 'gentle' | 'standard' | 'challenging';
export type Skin = 'auto' | 'notebook' | 'chalkboard' | 'tomato' | 'midnight' | 'sakura' | 'matcha' | 'sunset' | 'jungle' | 'gator' | 'panther' | 'robotlab';
export type ClockFont = 'theme' | 'mono' | 'rounded' | 'serif' | 'condensed' | 'digital' | 'hand';
export type TimerStyle = 'classic' | 'ring' | 'minimal';
export type Background = 'theme' | 'plain' | 'dots' | 'grid' | 'lined' | 'gradient' | 'image' | 'unsplash';
export type MascotKind = 'tomato' | 'robot' | 'gorilla' | 'gator' | 'panther';

/** A photo from Unsplash, as the site keeps it. Images are always loaded from Unsplash's own servers. */
export interface UnsplashPhoto {
  id: string;
  /** Base image address; sizes are added as parameters. */
  raw: string;
  thumb: string;
  /** Average color, shown while the image loads. */
  color: string;
  alt: string;
  author: string;
  authorUrl: string;
  /** The photo's page on Unsplash. */
  link: string;
  /** Unsplash's download-tracking address, called when a photo is chosen. */
  downloadLocation: string;
  /** For the daily photo: the day it was picked. */
  day?: string;
}
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
  mascotKind: MascotKind;
  /** The Unsplash photo used when background is 'unsplash'. */
  bgPhoto: UnsplashPhoto | null;
  /** A mood (search words) for a new Unsplash photo every day; '' = keep the chosen photo. */
  bgDaily: string;
  cardStyle: 'solid' | 'glass';
  /** Show the Spotify "now playing" widget. */
  musicWidget: boolean;
  corners: Corners;
  density: 'comfortable' | 'compact';
  // screen tracking
  screenTrack: boolean;
  /** Seconds between screen checks (only changed screens are read). */
  screenSec: number;
  /** Also capture the shared tab's sound and turn speech into notes, on this device. */
  screenAudio: boolean;
  /** Send the text and a few snapshots of the shared screen to the AI, so quizzes cover what was on it. */
  screenAI: boolean;
  /** Short sounds when the timer starts, pauses or resumes. */
  controlSounds: boolean;
  /** Saved timers: named setups (look + lengths) to switch between. */
  savedTimers: TimerPreset[];
  /** Cards folded shut, by id (e.g. 'plan'). */
  folded: string[];
  /** Show the music widget in the full-screen timer. */
  focusMusic: boolean;
}

/** A saved timer: a name and the settings it brings back (see lib/presets.ts for which ones). */
export interface TimerPreset { id: string; name: string; values: Partial<Settings> }

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
  /** What was heard from a shared tab's sound during the live session (kept on this device only). */
  heard?: string;
  /** Text read from the shared screen during the live session (kept on this device, dropped from history). */
  screen?: string;
  /** What this session's quiz should cover, when the student changed it (see quizPick in the store). */
  quizPick?: QuizPick;
}

export interface LastResult {
  score: number | null;
  total: number;
  items: QuizItemResult[];
  mins: number;
  kind: BreakKind;
  reason: BreakReason;
  at: number;
  /** A study-together break: the same agreed length for everyone. */
  together?: boolean;
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
  /** Which document pages and how much lecture transcript the quiz was written from (see sourcesKey). */
  sources?: string;
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
  /** 'quiz': written after a quiz; 'work': asked for, from the to-do list, today's uploads and the shared screen. */
  kind?: 'quiz' | 'work';
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
  /** Speech heard from a shared lecture tab this session, if any. */
  heard?: string;
  /** The document pages covered this session, if a document is being studied. */
  material?: Material;
  /** The AI's notes on that document (key concepts), if it has read it. */
  digest?: Pick<DocDigest, 'summary' | 'concepts'>;
  /** Text read from the shared screen during the session, and a few snapshots of it. */
  screen?: string;
  images?: QuizImage[];
}

/** A screen snapshot sent to the AI: a small JPEG, base64. */
export interface QuizImage { mimeType: string; data: string }

/** What a quiz is written from: the shared screen, the document, the lecture audio. The topic always counts. */
export interface QuizPick { screen: boolean; doc: boolean; heard: boolean }

/** A plan for the next session from the to-do list, today's uploads and the shared screen (no quiz needed). */
export interface WorkPlanInput {
  ctx: StudyContext;
  tasks: { text: string; done: boolean }[];
  uploads: { name: string; topic: string; summary: string; concepts: string[] }[];
  screen?: string;
  studyMin: number;
  weak: { concept: string; missed: number; seen: number }[];
}

/** Pages of a document sent to the AI. */
export interface Material {
  name: string;
  /** "slide", "page" or "section". */
  unit: string;
  pageCount: number;
  pages: { n: number; title: string; text: string }[];
}

/** What the AI took away from a document when it was uploaded, kept so quizzes and the assistant remember it. */
export interface DocDigest {
  /** A short topic label, e.g. "Pythagoras and early Greek philosophy". */
  topic: string;
  summary: string;
  concepts: string[];
  sections: { from: number; to: number; title: string; summary: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** Tasks the assistant proposed, waiting for the student to add them. */
  tasks?: ProposedTask[];
  /** What happened to the proposal. */
  tasksAdded?: 'added' | 'replaced' | 'dismissed';
  error?: boolean;
  /** Photos the student attached. `data` (full size, for the AI) stays in memory; only the thumbnail is saved. */
  images?: ChatImage[];
  /** How the study buddy reacts to this reply. */
  mood?: 'happy' | 'sad';
}

export interface ChatImage { thumb: string; mimeType?: string; data?: string }

export interface ProposedTask { text: string; sessions: number }

export interface AssistantInput {
  messages: { role: 'user' | 'assistant'; text: string; images?: QuizImage[] }[];
  ctx: StudyContext;
  timer: { studyMin: number; shortBreak: number; longBreak: number; longEvery: number; state: string };
  tasks: { text: string; done: boolean }[];
  material?: Material;
  /** Every uploaded document the AI has read: name and notes, so it can talk about any of them. */
  library?: { name: string; pageCount: number; unit: string; topic: string; summary: string; concepts: string[] }[];
  heard?: string;
  /** The student's local date and time, e.g. "Tue 14 Oct, 3:05 PM". */
  now?: string;
}

export interface AssistantReply { reply: string; tasks: ProposedTask[]; mood?: 'happy' | 'sad' }

export interface DayInput {
  sessions: { time: string; topic: string; studiedMin?: number; quiz: string; missed: string[] }[];
  weak: { concept: string; missed: number; seen: number }[];
}

/** Error shape every AI call rejects with. */
export interface AiError { code: string; message?: string }

/** What the AI gets to write the weekly report's summary (lib/weekly.ts → weeklyInput). */
export interface WeeklyInput {
  week: string;
  inProgress: boolean;
  daysLeft: number;
  now: { studyMin: number; sessions: number; accuracy: number | null; goalsPct: number | null; streak: number; studyDays: number };
  prev: { studyMin: number; sessions: number; accuracy: number | null; goalsPct: number | null; streak: number; studyDays: number };
  days: { day: string; minutes: number; accuracy: number | null }[];
  topics: { topic: string; minutes: number; accuracy: number | null }[];
  missed: { concept: string; topic: string; missed: number }[];
  mastered: string[];
  docs: { name: string; pct: number; coveredThisWeek: number; unit: string }[];
  bestDay: string;
  bestTime: string;
  /** Focus steps worked out from the numbers, which the AI may sharpen. */
  hints: string[];
}

/** The AI's part of a weekly report. */
export interface WeeklyAi { headline: string; summary: string; focus: string[] }

/** A saved summary for one week (keyed by the week's first day), with the numbers it was written from. */
export interface WeeklySaved extends WeeklyAi { sig: string; at: number }

/** Studying together: a room of up to 4 friends with one shared timer (times are on the server's clock). */
export interface CollabMember { id: string; name: string; buddy: MascotKind; status: 'joined' | 'invited' }
export interface CollabTimer {
  phase: 'study' | 'break';
  status: 'idle' | 'running' | 'paused';
  /** Server-clock ms when the running phase ends. */
  endAt?: number;
  /** Time left while paused. */
  remainingMs?: number;
  round: number;
  /** Who pressed last, for "Sam started the timer". */
  by?: string;
}
export interface CollabRoom {
  id: string; host: string; studyMin: number; breakMin: number; note: string;
  state: CollabTimer; v: number; members: CollabMember[];
}
