import { describe, expect, it } from 'vitest';
import { breakFor, nextBreakKind, tierRows } from '@/lib/breaks';
import { cleanPlan, cleanQuiz, aiErrorText } from '@/lib/quiz';
import { addAsked, askedToday, isVagueTopic, recordConcepts, weakConcepts, ctxKey } from '@/lib/context';
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS } from '@/lib/defaults';
import { fmt, mergeDeep } from '@/lib/util';
import type { ConceptStat } from '@/lib/types';

const short = DEFAULT_SETTINGS.tiers.short;
const long = DEFAULT_SETTINGS.tiers.long;

describe('break tiers', () => {
  it('matches the brief for 3 questions', () => {
    expect(breakFor(3, 3, short)).toBe(15);
    expect(breakFor(2, 3, short)).toBe(10);
    expect(breakFor(1, 3, short)).toBe(5);
    expect(breakFor(0, 3, short)).toBe(5);
  });
  it('uses percentages for 1 and 2 questions', () => {
    expect(breakFor(1, 1, short)).toBe(15);
    expect(breakFor(0, 1, short)).toBe(5);
    expect(breakFor(1, 2, short)).toBe(10);
  });
  it('gives the no-quiz break when nothing was answered', () => {
    expect(breakFor(0, 0, short)).toBe(5);
    expect(breakFor(0, 0, long)).toBe(15);
  });
  it('uses the long tiers', () => {
    expect(tierRows(3, long).map((r) => r.mins)).toEqual([30, 22, 15, 15]);
  });
  it('makes the 4th counted session end in a long break', () => {
    expect(nextBreakKind(2, 4)).toBe('short');
    expect(nextBreakKind(3, 4)).toBe('long');
  });
});

const raw = {
  questions: [
    { id: 'q1', concept: 'Location', question: 'Where?', options: ['A. Matrix', 'B. Cytoplasm', 'C. Membrane', 'D. Nucleus'], correctIndex: 0,
      explanation: 'e', memoryAid: 'm', optionFeedback: ['right', 'f1', 'f2', 'f3'] },
    { id: 'bad', question: 'Broken', options: ['x', 'y'], correctIndex: 5 },
    { id: 'dupe', question: 'Dupes', options: ['a', 'a', 'b', 'c'], correctIndex: 0 },
    { id: 'q2', concept: 'Yield', question: 'How many?', options: ['1', '2', '3', '4'], correctIndex: 2, optionFeedback: ['a', 'b', 'right', 'd'] },
  ],
};

describe('cleanQuiz', () => {
  it('drops malformed questions and strips letter prefixes', () => {
    const qs = cleanQuiz(raw, 3);
    expect(qs.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(qs[0].options.sort()).toEqual(['Cytoplasm', 'Matrix', 'Membrane', 'Nucleus']);
  });
  it('keeps the answer and its feedback together after shuffling', () => {
    for (let i = 0; i < 20; i++) {
      const [q] = cleanQuiz(raw, 1);
      expect(q.options[q.correctIndex]).toBe('Matrix');
      expect(q.optionFeedback[q.correctIndex]).toBe('right');
      expect(q.optionFeedback[q.options.indexOf('Nucleus')]).toBe('f3');
    }
  });
  it('respects the question count and accepts a bare array', () => {
    expect(cleanQuiz(raw.questions, 1)).toHaveLength(1);
    expect(cleanQuiz(null, 3)).toEqual([]);
  });
});

describe('cleanPlan', () => {
  it('rounds and clamps the suggested length to 25–45', () => {
    const p = cleanPlan({ summary: 's', actions: [{ minutes: 10, technique: 'Recall', step: 'Do it' }], suggestedMinutes: 31 });
    expect(p.suggestedMinutes).toBe(30);
    expect(cleanPlan({ actions: [{ step: 'x' }], suggestedMinutes: 90 }).suggestedMinutes).toBe(45);
  });
  it('rejects a plan with no usable actions', () => {
    expect(() => cleanPlan({ actions: [] })).toThrow();
  });
});

describe('concepts and repeats', () => {
  it('tracks misses until answered right twice in a row', () => {
    const stats: Record<string, ConceptStat> = {};
    const item = (correct: boolean) => [{ concept: 'NADH yield', question: 'q', chosen: 'a', answer: 'b', correct }];
    recordConcepts(stats, 'bio|krebs', item(false));
    expect(weakConcepts(stats, 'bio|krebs').map((c) => c.concept)).toEqual(['NADH yield']);
    recordConcepts(stats, 'bio|krebs', item(true));
    expect(weakConcepts(stats, 'bio|krebs')).toHaveLength(1);
    recordConcepts(stats, 'bio|krebs', item(true));
    expect(weakConcepts(stats, 'bio|krebs')).toHaveLength(0);
  });
  it('remembers only today\'s questions', () => {
    const a = { date: '2000-01-01', items: ['old'] };
    expect(askedToday(a)).toEqual([]);
    addAsked(a, ['new']);
    expect(askedToday(a)).toEqual(['new']);
  });
  it('changes the quiz key when the topic changes', () => {
    const k1 = ctxKey({ ...DEFAULT_CONTEXT, topic: 'Krebs' }, DEFAULT_SETTINGS);
    const k2 = ctxKey({ ...DEFAULT_CONTEXT, topic: 'Glycolysis' }, DEFAULT_SETTINGS);
    expect(k1).not.toBe(k2);
  });
  it('flags one-word topics without notes as vague', () => {
    expect(isVagueTopic({ ...DEFAULT_CONTEXT, topic: 'math' })).toBe(true);
    expect(isVagueTopic({ ...DEFAULT_CONTEXT, topic: 'derivatives of trig functions' })).toBe(false);
  });
});

describe('helpers', () => {
  it('formats time rounding up', () => {
    expect(fmt(25 * 60_000)).toBe('25:00');
    expect(fmt(1)).toBe('00:01');
    expect(fmt(0)).toBe('00:00');
  });
  it('fills missing settings from defaults and ignores wrong types', () => {
    const s = mergeDeep(DEFAULT_SETTINGS, { studyMin: 40, tiers: { short: { max: '20' } } });
    expect(s.studyMin).toBe(40);
    expect(s.tiers.short.max).toBe(15);
    expect(s.tiers.long.max).toBe(30);
  });
  it('has copy for every error code', () => {
    expect(aiErrorText({ code: 'daily_limit' })).toMatch(/allowance/);
    expect(aiErrorText({})).toMatch(/connection/);
  });
});
