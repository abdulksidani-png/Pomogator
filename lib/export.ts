'use client';
/** "Download my data": everything PomoGator keeps about you, as one JSON file. */
import { useStudy } from './store';
import { useChat } from './assistant';
import { idb } from './docs/idb';
import { todayFor } from './dates';
import type { DocPage } from './types';

export async function exportData(): Promise<void> {
  const s = useStudy.getState();
  const docs = await Promise.all(s.docs.map(async (d) => ({
    ...d,
    pages: (await idb.get<DocPage[]>(`doc:${d.id}`)) ?? null,
    aiNotes: (await idb.get<unknown>(`digest:${d.id}`)) ?? null,
  })));
  const data = {
    app: 'PomoGator',
    format: 1,
    exportedAt: new Date().toISOString(),
    account: { status: s.account.status, email: s.account.email ?? null, name: s.account.name ?? null },
    settings: s.settings,
    studying: s.context,
    tasks: s.tasks,
    sessions: s.history,
    conceptStats: s.stats,
    plan: s.plan,
    weeklyReports: s.weekly,
    checkIns: s.checkins,
    badges: s.badges,
    documents: docs,
    assistantChat: useChat.getState().messages.map(({ images, ...m }) => ({ ...m, photos: images?.length ?? 0 })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pomogator-data-${todayFor(s.settings)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
