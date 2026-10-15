'use client';
/**
 * The study assistant's chat: messages, sending, and to-do proposals. The chat is kept on this
 * device only (localStorage). It sees the study panel, the timer, the to-do list, the selected
 * document and any lecture transcript, and it can propose tasks, which are added only on a click.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useStudy, remainingAt } from './store';
import { AI } from './ai-client';
import { aiErrorText, taskLine } from './quiz';
import { MIN, uid } from './util';
import type { AssistantInput, ChatMessage } from './types';

interface ChatState {
  open: boolean;
  busy: boolean;
  messages: ChatMessage[];
  /** Text to put in the box when the panel opens (e.g. from "Plan with AI"). */
  draft: string;
}

export const useChat = create<ChatState>()(
  persist((): ChatState => ({ open: false, busy: false, messages: [], draft: '' }), {
    name: 'studybuddy.chat',
    storage: createJSONStorage(() => localStorage),
    partialize: (s) => ({ messages: s.messages.slice(-60) }),
  }),
);

let ctl: AbortController | null = null;

export function openAssistant(draft = '') { useChat.setState({ open: true, ...(draft ? { draft } : {}) }); }
export function closeAssistant() { useChat.setState({ open: false }); }
export function clearChat() { ctl?.abort(); useChat.setState({ messages: [], busy: false }); }

function timerState(): AssistantInput['timer'] {
  const { timer: T, settings: s } = useStudy.getState();
  const left = Math.ceil(remainingAt(T, Date.now()) / MIN);
  let state = 'The timer isn\'t running';
  if (T.phase === 'quiz') state = 'The student just finished a session and is taking the quiz';
  else if (T.status !== 'idle') {
    const what = T.phase === 'study' ? `studying (session ${Math.min(T.cycleDone + 1, s.longEvery)} of ${s.longEvery})` : `on a ${T.breakKind} break`;
    state = `Right now: ${what}, ${left} min left${T.status === 'paused' ? ', paused' : ''}`;
  }
  return { studyMin: s.studyMin, shortBreak: s.tiers.short.none, longBreak: s.tiers.long.none, longEvery: s.longEvery, state };
}

/** Send a message and wait for the reply. */
export async function sendToAssistant(text: string) {
  const t = text.trim();
  if (!t || useChat.getState().busy) return;
  const mine: ChatMessage = { id: uid(), role: 'user', text: t, at: Date.now() };
  useChat.setState((s) => ({ messages: [...s.messages, mine], busy: true, draft: '' }));
  ctl?.abort();
  const my = (ctl = new AbortController());
  try {
    await AI.ready();
    if (!AI.available()) throw { code: 'not_configured' };
    const st = useStudy.getState();
    const { materialForChat } = await import('./ai/material');
    const material = st.context.docId ? await materialForChat(st.context.docId, st.context.startPage) : undefined;
    const library = (await import('./ai/digest')).libraryForAssistant();
    const history = useChat.getState().messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    const input: AssistantInput = {
      messages: history,
      ctx: { ...st.context },
      timer: timerState(),
      tasks: st.tasks.map((x) => ({ text: x.text, done: x.done })),
      ...(material ? { material } : {}),
      ...(library.length ? { library } : {}),
      ...(st.timer.session?.heard ? { heard: st.timer.session.heard.slice(-6000) } : {}),
      now: new Date().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };
    const r = await AI.assistant(input, my.signal);
    if (my !== ctl) return;
    const reply: ChatMessage = { id: uid(), role: 'assistant', text: r.reply, at: Date.now(), ...(r.tasks.length ? { tasks: r.tasks } : {}) };
    useChat.setState((s) => ({ messages: [...s.messages, reply], busy: false }));
  } catch (e) {
    if (my !== ctl || (e as { code?: string })?.code === 'cancelled') return;
    const err: ChatMessage = { id: uid(), role: 'assistant', text: aiErrorText(e), at: Date.now(), error: true };
    useChat.setState((s) => ({ messages: [...s.messages, err], busy: false }));
  }
}

/** Act on a to-do proposal: add the tasks, replace the list with them, or dismiss them. */
export function resolveTasks(messageId: string, how: 'added' | 'replaced' | 'dismissed') {
  const msg = useChat.getState().messages.find((m) => m.id === messageId);
  if (!msg?.tasks?.length || msg.tasksAdded) return;
  if (how !== 'dismissed') {
    const lines = msg.tasks.map(taskLine);
    useStudy.getState().addTasks(lines, how === 'replaced');
    useStudy.getState().showToast(how === 'replaced' ? 'To-do list replaced' : `Added ${lines.length} task${lines.length === 1 ? '' : 's'} to your to-do list`);
  }
  useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, tasksAdded: how } : m)) }));
}
