import { describe, expect, it } from 'vitest';
import { RECENT_MS, isRecentDoc, putAway, splitDocs } from '@/lib/recent';
import { DEFAULT_CONTEXT } from '@/lib/defaults';
import type { DocMeta } from '@/lib/types';

const NOW = Date.UTC(2026, 10, 10, 12);
const HOUR = 3600_000;
const doc = (id: string, hoursAgo: number): DocMeta => ({ id, name: `${id}.pdf`, kind: 'pdf', size: 1, pageCount: 9, titles: [], createdAt: NOW - hoursAgo * HOUR, furthest: 0 });

describe('recent study material', () => {
  it('a document is recent for two days after its upload or its last use', () => {
    const none = { docId: '', docUsedAt: 0 };
    expect(isRecentDoc(doc('a', 1), none, NOW)).toBe(true);
    expect(isRecentDoc(doc('a', 47), none, NOW)).toBe(true);
    expect(isRecentDoc(doc('a', 49), none, NOW)).toBe(false);
    // An old upload that was studied yesterday is still in use.
    expect(isRecentDoc(doc('a', 500), { docId: 'a', docUsedAt: NOW - 20 * HOUR }, NOW)).toBe(true);
    expect(isRecentDoc(doc('b', 500), { docId: 'a', docUsedAt: NOW - 20 * HOUR }, NOW)).toBe(false);
    expect(RECENT_MS).toBe(48 * HOUR);
  });

  it('the picker lists recent uploads and the selected document; the rest is older material', () => {
    const docs = [doc('old', 900), doc('new', 2), doc('mid', 30), doc('chosen', 700)];
    const { recent, older } = splitDocs(docs, { docId: 'chosen', docUsedAt: NOW - 100 * HOUR }, NOW);
    expect(recent.map((d) => d.id)).toEqual(['new', 'mid', 'chosen']);
    expect(older.map((d) => d.id)).toEqual(['old']);
  });

  it('puts away a document left selected long ago, with the goal and a topic that came from it', () => {
    const ctx = { ...DEFAULT_CONTEXT, docId: 'phil', topic: 'Ancient Greek philosophy', topicDoc: 'phil', docGoal: 'to slide 5', goalPage: 5, startPage: 3, docUsedAt: NOW - 30 * 24 * HOUR };
    const out = putAway(ctx, [doc('phil', 40 * 24)], NOW)!;
    expect(out.doc.id).toBe('phil');
    expect(out.ctx).toMatchObject({ docId: '', topic: '', topicDoc: '', docGoal: '', goalPage: 0, startPage: 1 });
    // Saved before this existed (no "last used" time at all): put away too.
    expect(putAway({ ...ctx, docUsedAt: undefined as never }, [doc('phil', 40 * 24)], NOW)).not.toBeNull();
  });

  it('keeps a topic the student typed, and leaves material in use alone', () => {
    const typed = { ...DEFAULT_CONTEXT, docId: 'phil', topic: 'Exam 2 review', topicDoc: '', docUsedAt: 0 };
    expect(putAway(typed, [doc('phil', 400)], NOW)!.ctx.topic).toBe('Exam 2 review');
    expect(putAway({ ...typed, docUsedAt: NOW - HOUR }, [doc('phil', 400)], NOW)).toBeNull();
    expect(putAway({ ...DEFAULT_CONTEXT, topic: 'No document here' }, [doc('phil', 400)], NOW)).toBeNull();
    expect(putAway({ ...typed, docId: 'gone' }, [], NOW)).toBeNull();
  });
});
