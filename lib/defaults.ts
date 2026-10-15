import type { QuizState, Settings, StudyContext, SyncState, TimerState } from './types';
import { MIN } from './util';

export const DEFAULT_SETTINGS: Settings = {
  studyMin: 25,
  longEvery: 4,
  loop: false,
  tiers: { short: { max: 15, mid: 10, min: 5, none: 5 }, long: { max: 30, mid: 22, min: 15, none: 15 } },
  questions: 3,
  difficulty: 'standard',
  chime: 'bell',
  chimeVol: 0.7,
  ambStudy: 'none',
  ambBreak: 'none',
  ambVol: 0.5,
  skin: 'auto',
  notify: false,
  wake: false,
  displayName: '',
  timezone: '',
  weekStart: 1,
  rollover: 0,
  streakFreeze: false,
  accent: '',
  clockFont: 'theme',
  timerStyle: 'classic',
  background: 'theme',
  bgDim: 0.35,
  mascot: 'auto',
  mascotKind: 'tomato',
  bgPhoto: null,
  bgDaily: '',
  cardStyle: 'solid',
  musicWidget: true,
  corners: 'theme',
  density: 'comfortable',
  screenTrack: false,
  screenSec: 2,
  screenAudio: false,
  controlSounds: true,
  savedTimers: [],
  folded: [],
  focusMusic: true,
};

export function freshSync(): SyncState {
  return {
    ownerId: '', ownerAnon: false,
    v: { settings: 0, context: 0, app: 0, tasks: 0 },
    acked: { settings: 0, context: 0, app: 0, tasks: 0 },
    pushed: {}, lastPull: 0, clearPending: false, docsPushed: {}, docsDeleted: [],
  };
}

export const DEFAULT_CONTEXT: StudyContext = { subject: '', topic: '', level: 'intro', exam: '', goal: '', notes: '', docId: '', docGoal: '', goalPage: 0, startPage: 1 };

export const PRESETS = [25, 30, 35, 40, 45];

export function freshTimer(s: Settings): TimerState {
  return {
    phase: 'study', status: 'idle', totalMs: s.studyMin * MIN, remainingMs: s.studyMin * MIN, endAt: 0,
    breakKind: 'short', breakReason: '', session: null, cycleDone: 0, lastResult: null, lastSessionId: '',
    refreshTried: false, countedCycle: false, studiedMs: 0,
  };
}

export function freshQuiz(): QuizState {
  return { ctxKey: '', gen: 'none', error: '', questions: [], madeOn: '', used: false, step: 'intro', index: 0, answers: [], forTopic: '' };
}
