/**
 * "Recent" study material. An uploaded document stays in the library for good, but it only stays *selected* (and so
 * offered for the quiz) while it's in use: uploaded, picked, or studied within the last two days. After that it is
 * put away under "Older material", where it can be picked again. Pure; tested in tests/unit/recent.test.ts.
 */
import type { DocMeta, StudyContext } from './types';

export const RECENT_MS = 48 * 60 * 60 * 1000;

/** When the document was last in use: its upload, or the last time it was picked or studied (for the selected one). */
const lastUse = (doc: Pick<DocMeta, 'id' | 'createdAt'>, ctx: Pick<StudyContext, 'docId' | 'docUsedAt'>) =>
  Math.max(doc.createdAt || 0, ctx.docId === doc.id ? ctx.docUsedAt || 0 : 0);

export const isRecentDoc = (doc: Pick<DocMeta, 'id' | 'createdAt'>, ctx: Pick<StudyContext, 'docId' | 'docUsedAt'>, now: number) =>
  now - lastUse(doc, ctx) < RECENT_MS;

/** The documents the picker lists: recent ones, plus the selected one, newest first. The rest are "older material". */
export function splitDocs<T extends Pick<DocMeta, 'id' | 'createdAt'>>(docs: readonly T[], ctx: Pick<StudyContext, 'docId' | 'docUsedAt'>, now: number) {
  const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
  const recent = sorted.filter((d) => d.id === ctx.docId || isRecentDoc(d, ctx, now));
  return { recent, older: sorted.filter((d) => !recent.includes(d)) };
}

/**
 * If the selected document hasn't been used for two days, the context without it (and without a topic that came from
 * it), plus the document that was put away. Null when there is nothing to put away.
 */
export function putAway(ctx: StudyContext, docs: readonly DocMeta[], now: number): { ctx: StudyContext; doc: DocMeta } | null {
  const doc = ctx.docId ? docs.find((d) => d.id === ctx.docId) : undefined;
  if (!doc || isRecentDoc(doc, ctx, now)) return null;
  const fromDoc = ctx.topicDoc === doc.id;
  return { doc, ctx: { ...ctx, docId: '', docGoal: '', goalPage: 0, startPage: 1, docUsedAt: 0, topicDoc: '', ...(fromDoc ? { topic: '' } : {}) } };
}
