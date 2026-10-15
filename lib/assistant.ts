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
import type { AssistantInput, ChatImage, ChatMessage } from './types';

interface ChatState {
  open: boolean;
  busy: boolean;
  messages: ChatMessage[];
  /** Text to put in the box when the panel opens (e.g. from "Plan with AI"). */
  draft: string;
  /** Photos waiting to go with the next message. */
  pending: ChatImage[];
}

/** Photos per message, and the size they're shrunk to before going to the AI. */
export const MAX_PHOTOS = 4;
const PHOTO_SIDE = 1280;
const THUMB_SIDE = 200;

export const useChat = create<ChatState>()(
  persist((): ChatState => ({ open: false, busy: false, messages: [], draft: '', pending: [] }), {
    name: 'studybuddy.chat',
    storage: createJSONStorage(() => localStorage),
    // Full-size photos would fill localStorage; only their small thumbnails are kept.
    partialize: (s) => ({ messages: s.messages.slice(-60).map((m) => (m.images ? { ...m, images: m.images.map((im) => ({ thumb: im.thumb })) } : m)) }),
  }),
);

let ctl: AbortController | null = null;

export function openAssistant(draft = '') { useChat.setState({ open: true, ...(draft ? { draft } : {}) }); }
export function closeAssistant() { useChat.setState({ open: false }); }
export function clearChat() { ctl?.abort(); useChat.setState({ messages: [], busy: false, pending: [] }); }

/** Draw an image file onto a canvas no bigger than `side` and return it as a JPEG data URL. */
function shrink(img: CanvasImageSource & { width: number; height: number }, side: number, q: number) {
  const k = Math.min(1, side / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; // transparent PNGs get a white page, not black
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function readPhoto(file: File): Promise<ChatImage> {
  const bmp = await createImageBitmap(file);
  try {
    const full = shrink(bmp, PHOTO_SIDE, 0.82);
    return { thumb: shrink(bmp, THUMB_SIDE, 0.72), mimeType: 'image/jpeg', data: full.slice(full.indexOf(',') + 1) };
  } finally { bmp.close(); }
}

/** Attach photos (from the picker, a paste or a drop) to the next message. */
export async function addPhotos(files: Iterable<File>) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  const room = MAX_PHOTOS - useChat.getState().pending.length;
  if (room <= 0 || imgs.length > room) useStudy.getState().showToast(`Up to ${MAX_PHOTOS} photos per message`);
  let bad = 0;
  for (const f of imgs.slice(0, Math.max(0, room))) {
    try {
      const im = await readPhoto(f);
      useChat.setState((s) => (s.pending.length < MAX_PHOTOS ? { pending: [...s.pending, im] } : s));
    } catch { bad++; }
  }
  if (bad) useStudy.getState().showToast('That photo couldn\'t be opened. Try a JPG or PNG.');
}
export function removePhoto(i: number) { useChat.setState((s) => ({ pending: s.pending.filter((_, j) => j !== i) })); }

/** What the AI reads when a message is only photos. */
export const PHOTO_ONLY = 'Here is a photo of what I\'m studying. Tell me what it shows and help me learn it.';

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
  const photos = useChat.getState().pending;
  if ((!t && !photos.length) || useChat.getState().busy) return;
  const mine: ChatMessage = { id: uid(), role: 'user', text: t, at: Date.now(), ...(photos.length ? { images: photos } : {}) };
  useChat.setState((s) => ({ messages: [...s.messages, mine], busy: true, draft: '', pending: [] }));
  ctl?.abort();
  const my = (ctl = new AbortController());
  try {
    await AI.ready();
    if (!AI.available()) throw { code: 'not_configured' };
    const st = useStudy.getState();
    const { materialForChat } = await import('./ai/material');
    const material = st.context.docId ? await materialForChat(st.context.docId, st.context.startPage) : undefined;
    const library = (await import('./ai/digest')).libraryForAssistant();
    // Photos from this visit go along (newest first, the server keeps a few); after a reload only thumbnails remain.
    const history = useChat.getState().messages.filter((m) => !m.error).map((m) => {
      const images = (m.images ?? []).filter((im) => im.data).map((im) => ({ mimeType: im.mimeType!, data: im.data! }));
      const text = m.text || (m.images?.length ? PHOTO_ONLY : '');
      return { role: m.role, text: images.length || !m.images?.length ? text : `${text} (photo no longer attached)`, ...(images.length ? { images } : {}) };
    });
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
    const reply: ChatMessage = { id: uid(), role: 'assistant', text: r.reply, at: Date.now(), ...(r.tasks.length ? { tasks: r.tasks } : {}), ...(r.mood ? { mood: r.mood } : {}) };
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
