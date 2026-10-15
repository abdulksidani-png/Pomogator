/** Browser side: turn a stored document's pages into the excerpt sent to the AI. */
import { useStudy, unitWord } from '../store';
import { getPages } from '../docs/library';
import { LIMITS } from './prompts';
import type { Material } from '../types';

/** Pages `from`–`to` of a document (1-based), as many as fit in `budget` characters. */
export async function materialFor(docId: string, from = 1, to = Infinity, budget = LIMITS.material): Promise<Material | undefined> {
  const doc = useStudy.getState().docs.find((d) => d.id === docId);
  if (!doc) return undefined;
  const all = await getPages(docId);
  if (!all.length) return undefined;
  let used = 0;
  const pages: Material['pages'] = [];
  for (const p of all) {
    if (p.index < from || p.index > to) continue;
    const text = p.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (used + text.length > budget && pages.length) break;
    pages.push({ n: p.index, title: p.title || `${unitWord(doc, 1)} ${p.index}`, text });
    used += text.length + p.title.length + 20;
  }
  return { name: doc.name, unit: unitWord(doc, 1), pageCount: doc.pageCount, pages };
}

/** For the assistant: the whole document if it fits, otherwise starting from where the student is. */
export async function materialForChat(docId: string, startPage: number): Promise<Material | undefined> {
  const whole = await materialFor(docId);
  if (!whole) return undefined;
  const size = whole.pages.reduce((n, p) => n + p.text.length, 0);
  const complete = whole.pages.length && whole.pages[whole.pages.length - 1].n >= whole.pageCount;
  return complete && size <= LIMITS.material ? whole : materialFor(docId, Math.max(1, startPage - 2));
}
