'use client';
/**
 * Documents are read by the AI once, right after upload (or the first time this device needs one
 * uploaded elsewhere). The resulting study notes (topic, summary, key concepts, sections) are kept on
 * this device and fed to quizzes and the study assistant, so the student never has to ask for a summary.
 */
import { create } from 'zustand';
import { AI } from '../ai-client';
import { idb } from '../docs/idb';
import { useStudy, unitWord } from '../store';
import { materialFor } from './material';
import type { DocDigest } from '../types';

export interface DigestState { status: 'reading' | 'ready' | 'failed'; data?: DocDigest }

export const useDigests = create<Record<string, DigestState>>(() => ({}));

const key = (id: string) => `digest:${id}`;
const inFlight = new Set<string>();

/** The file name as a topic, the way an upload fills it in ("Pythagoras_and_Philosophy (1).pptx" → "Pythagoras and Philosophy (1)"). */
export const nameAsTopic = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 140);

/** Load a saved digest, or have the AI read the document now. Safe to call often. */
export async function ensureDigest(docId: string): Promise<DocDigest | undefined> {
  const have = useDigests.getState()[docId];
  if (have?.status === 'ready') return have.data;
  if (inFlight.has(docId)) return undefined;
  inFlight.add(docId);
  try {
    const saved = await idb.get<DocDigest>(key(docId)).catch(() => undefined);
    if (saved) { useDigests.setState({ [docId]: { status: 'ready', data: saved } }); adoptTopic(docId, saved); return saved; }
    await AI.ready();
    if (!AI.available()) return undefined;
    useDigests.setState({ [docId]: { status: 'reading' } });
    const material = await materialFor(docId);
    if (!material?.pages.length) { useDigests.setState({ [docId]: { status: 'failed' } }); return undefined; }
    const data = await AI.digest(material);
    await idb.set(key(docId), data).catch(() => undefined);
    useDigests.setState({ [docId]: { status: 'ready', data } });
    adoptTopic(docId, data);
    return data;
  } catch {
    useDigests.setState({ [docId]: { status: 'failed' } });
    return undefined;
  } finally {
    inFlight.delete(docId);
  }
}

/** If the topic is still just the file name (or empty), use the AI's topic instead. */
function adoptTopic(docId: string, d: DocDigest) {
  const st = useStudy.getState();
  const doc = st.docs.find((x) => x.id === docId);
  if (!doc || st.context.docId !== docId || !d.topic) return;
  const t = st.context.topic.trim();
  if (!t || t === nameAsTopic(doc.name)) st.setContext({ topic: d.topic });
}

export function forgetDigest(docId: string) {
  void idb.del(key(docId));
  useDigests.setState((s) => { const n = { ...s }; delete n[docId]; return n; }, true);
}

/** What the assistant gets about every document read so far. */
export function libraryForAssistant() {
  const st = useStudy.getState(), digests = useDigests.getState();
  return st.docs.flatMap((doc) => {
    const d = digests[doc.id]?.data;
    return d ? [{ name: doc.name, pageCount: doc.pageCount, unit: unitWord(doc, 1), topic: d.topic, summary: d.summary, concepts: d.concepts }] : [];
  });
}

/** Load every saved digest from this device (no AI calls), e.g. when the page opens. */
export async function loadSavedDigests() {
  for (const doc of useStudy.getState().docs) {
    if (useDigests.getState()[doc.id]) continue;
    const saved = await idb.get<DocDigest>(key(doc.id)).catch(() => undefined);
    if (saved) useDigests.setState({ [doc.id]: { status: 'ready', data: saved } });
  }
}
