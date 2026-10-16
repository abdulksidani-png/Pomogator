import { describe, expect, it } from 'vitest';
import { localDate } from '@/lib/dates';
import {
  attemptsFor, isCounted, mergeHistory, rebuildAsked, rebuildStats, rowToSession, sessionHash, sessionToRow,
} from '@/lib/sync-map';
import { recordConcepts, topicKey } from '@/lib/context';
import { normalizeData } from '@/lib/store';
import type { ConceptStat, SessionRecord } from '@/lib/types';

const t = (s: string) => Date.parse(s);

describe('local dates', () => {
  it('uses the chosen time zone', () => {
    const ts = t('2026-10-15T02:30:00Z'); // 10:30 PM Oct 14 in New York, 11:30 AM Oct 15 in Tokyo
    expect(localDate(ts, 'America/New_York')).toBe('2026-10-14');
    expect(localDate(ts, 'Asia/Tokyo')).toBe('2026-10-15');
  });
  it('counts late-night study toward the previous day with a 4 AM rollover', () => {
    const ts = t('2026-10-15T05:30:00Z'); // 1:30 AM Oct 15 in New York
    expect(localDate(ts, 'America/New_York', 0)).toBe('2026-10-15');
    expect(localDate(ts, 'America/New_York', 4)).toBe('2026-10-14');
    expect(localDate(t('2026-10-15T08:30:00Z'), 'America/New_York', 4)).toBe('2026-10-15'); // 4:30 AM
  });
  it('falls back to the device time zone for an unknown zone', () => {
    expect(localDate(Date.now(), 'Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', date: '2026-10-14', startedAt: t('2026-10-14T14:00:00Z'), endedAt: t('2026-10-14T14:25:00Z'),
  plannedMin: 25, studiedMin: 25, subject: 'Biology', topic: 'Krebs', level: 'intro', goal: '',
  quiz: { status: 'done', score: 2, total: 3, items: [
    { concept: 'Location', question: 'Where?', chosen: 'Matrix', answer: 'Matrix', correct: true },
    { concept: 'NADH yield', question: 'How many?', chosen: '2', answer: '3', correct: false },
    { concept: 'Start', question: 'Joins?', chosen: 'OAA', answer: 'OAA', correct: true },
  ] },
  breakMin: 10, breakKind: 'short',
  ...over,
});

describe('session rows', () => {
  it('round-trips through database rows unchanged', () => {
    const h = session();
    const row = sessionToRow(h, 'u1');
    const back = rowToSession(row, attemptsFor(h, 'u1').reverse());
    expect(back).toEqual(h);
    expect(sessionHash(back)).toBe(sessionHash(h));
  });
  it('handles numbers coming back as strings and sessions without a quiz', () => {
    const h = session({ quiz: { status: 'too-short' }, breakMin: 5, studiedMin: 9.5 });
    const row = { ...sessionToRow(h, 'u1'), planned_min: '25.0', studied_min: '9.5' } as unknown as ReturnType<typeof sessionToRow>;
    const back = rowToSession(row, []);
    expect(back.studiedMin).toBe(9.5);
    expect(back.quiz).toEqual({ status: 'too-short' });
  });
  it('marks a session counted only at half the planned time or more', () => {
    expect(isCounted(session({ studiedMin: 12.5 }))).toBe(true);
    expect(isCounted(session({ studiedMin: 12.4 }))).toBe(false);
  });
});

describe('merging two devices', () => {
  it('keeps sessions from both devices, oldest first', () => {
    const a = session({ id: 'a', startedAt: 1 });
    const b = session({ id: 'b', startedAt: 2 });
    expect(mergeHistory([b], [a]).map((h) => h.id)).toEqual(['a', 'b']);
  });
  it('prefers the copy that has its break recorded', () => {
    const local = session({ breakMin: undefined, breakKind: undefined });
    const remote = session();
    expect(mergeHistory([local], [remote])[0].breakMin).toBe(10);
    expect(mergeHistory([remote], [local])[0].breakMin).toBe(10);
  });
  it('rebuilds concept stats identical to recording them live', () => {
    const h1 = session({ id: 'a', endedAt: 1000 });
    const h2 = session({ id: 'b', endedAt: 2000, quiz: { status: 'done', score: 1, total: 1, items: [{ concept: 'NADH yield', question: 'Again?', chosen: '3', answer: '3', correct: true }] } });
    const live: Record<string, ConceptStat> = {};
    recordConcepts(live, topicKey(h1), h1.quiz!.items!, 1000);
    recordConcepts(live, topicKey(h2), h2.quiz!.items!, 2000);
    expect(rebuildStats([h2, h1])).toEqual(live);
  });
  it('remembers today\'s questions from every device', () => {
    const asked = rebuildAsked([session()], { date: '2026-10-14', items: ['Local q'] }, '2026-10-14');
    expect(asked.items).toEqual(['Local q', 'Where?', 'How many?', 'Joins?']);
    expect(rebuildAsked([session()], { date: '2026-10-13', items: ['Old'] }, '2026-10-15').items).toEqual([]);
  });
});

describe('restoring saved data', () => {
  it('turns interrupted requests into retryable states', () => {
    const d = normalizeData({ quiz: { gen: 'loading' } as never, plan: { status: 'loading' } });
    expect(d.quiz.gen).toBe('none');
    expect(d.plan.status).toBe('failed');
  });
  it('keeps sync bookkeeping, including which sessions were sent', () => {
    const d = normalizeData({ sync: { ownerId: 'u1', ownerAnon: true, v: { settings: 5 }, acked: {}, pushed: { s1: 'h' }, lastPull: 0, clearPending: false } as never });
    expect(d.sync.pushed).toEqual({ s1: 'h' });
    expect(d.sync.v).toEqual({ settings: 5, context: 0, app: 0, tasks: 0 });
  });
});

describe('saved settings with open-ended maps', () => {
  it('keeps friend nicknames when loading (the defaults have none, so a plain merge would drop them)', () => {
    const d = normalizeData({ settings: { nicknames: { 'friend-1': 'Alex (bio lab)', 'friend-2': '  ' } } as never });
    expect(d.settings.nicknames).toEqual({ 'friend-1': 'Alex (bio lab)' });
    expect(normalizeData(undefined).settings.nicknames).toEqual({});
  });
});
