'use client';
import type { DocMeta, DocPage } from '../types';
import { useStudy } from '../store';
import { uid } from '../util';
import { idb } from './idb';
import { parseFiles, type Progress } from './parse';
import { deleteDocFiles, fetchDocPages, uploadDocFile } from '../sync';

const key = (id: string) => `doc:${id}`;
const memo = new Map<string, DocPage[]>();

/** Read files, keep their pages on this device (and in the account), and start studying them. */
export async function importDocument(files: File[], onProgress: Progress = () => {}): Promise<DocMeta> {
  if (!files.length) throw new Error('Choose a file first.');
  const total = files.reduce((a, f) => a + f.size, 0);
  if (total > 50 * 1024 * 1024) throw new Error('That\'s over 50 MB. Split it into smaller files.');
  const parsed = await parseFiles(files, onProgress);
  const id = uid();
  const meta: DocMeta = {
    id,
    name: files.length > 1 ? `Photos of notes (${files.length})` : files[0].name,
    kind: parsed.kind,
    size: total,
    pageCount: parsed.pages.length,
    titles: parsed.pages.map((p) => p.title),
    createdAt: Date.now(),
    furthest: 0,
  };
  memo.set(id, parsed.pages);
  await idb.set(key(id), parsed.pages);
  if (files.length === 1) {
    onProgress('Saving a copy to your account…');
    meta.storagePath = await uploadDocFile(id, files[0]).catch(() => undefined);
  }
  useStudy.getState().addDoc(meta);
  // The AI reads it in the background, so quizzes and the assistant know it without being asked.
  void import('../ai/digest').then((m) => m.ensureDigest(id));
  return meta;
}

/** A document's pages: from memory, this device, or the account (then kept here). */
export async function getPages(id: string): Promise<DocPage[]> {
  const cached = memo.get(id);
  if (cached) return cached;
  let pages = await idb.get<DocPage[]>(key(id));
  if (!pages?.length) {
    pages = await fetchDocPages(id).catch(() => []);
    if (pages.length) await idb.set(key(id), pages);
  }
  if (pages?.length) memo.set(id, pages);
  return pages ?? [];
}

export async function hasLocalPages(id: string) { return memo.has(id) || !!(await idb.get<DocPage[]>(key(id)))?.length; }

export async function deleteDocument(doc: DocMeta) {
  memo.delete(doc.id);
  await idb.del(key(doc.id));
  void import('../ai/digest').then((m) => m.forgetDigest(doc.id));
  useStudy.getState().removeDoc(doc.id);
  if (doc.storagePath) void deleteDocFiles([doc.storagePath]).catch(() => undefined);
}

export function forgetLocalDocs() { memo.clear(); }
