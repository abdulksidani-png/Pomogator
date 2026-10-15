'use client';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { clearChat, closeAssistant, openAssistant, resolveTasks, sendToAssistant, useChat } from '@/lib/assistant';
import { hasTopic, topicLabel } from '@/lib/context';
import type { ChatMessage } from '@/lib/types';
import { Icon } from './Icon';
import { EASE, SOFT, SPRING } from './motion';

export const TODO_PROMPT = 'Make me a to-do list and plan it around my study timer. Here\'s everything I need to do: ';

/** The round "Ask PomoGator" button in the corner. */
export function AssistantButton() {
  const open = useChat((s) => s.open);
  return (
    <motion.button className="assistant-fab" type="button" aria-label="Ask the study assistant (A)" title="Ask the study assistant (A)"
      aria-expanded={open} onClick={() => (open ? closeAssistant() : openAssistant())}
      initial={false} animate={{ scale: open ? 0.86 : 1, opacity: open ? 0 : 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }} transition={SPRING}
      style={{ pointerEvents: open ? 'none' : 'auto' }}>
      <Icon name="sparkle" /><span>Ask PomoGator</span>
    </motion.button>
  );
}

/** The chat panel. Always mounted, so opening and closing never wait on an exit animation. */
export function AssistantPanel() {
  const { open, busy, messages, draft } = useChat();
  const aiStatus = useStudy((s) => s.aiStatus);
  const docName = useStudy((s) => s.docs.find((d) => d.id === s.context.docId)?.name ?? '');
  const ctx = useStudy((s) => s.context);
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) requestAnimationFrame(() => box.current?.focus()); }, [open]);
  useEffect(() => {
    if (!draft || !box.current) return;
    box.current.value = draft;
    box.current.setSelectionRange(draft.length, draft.length);
    autosize(box.current);
  }, [draft]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, busy]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeAssistant(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const send = (text?: string) => {
    const t = (text ?? box.current?.value ?? '').trim();
    if (!t || busy) return;
    void sendToAssistant(t);
    if (box.current && text === undefined) { box.current.value = ''; autosize(box.current); }
  };
  const prefill = (t: string) => { if (box.current) { box.current.value = t; box.current.focus(); autosize(box.current); } };

  const topic = hasTopic(ctx) ? topicLabel(ctx) : '';
  const chips: { label: string; run: () => void }[] = [
    ...(docName ? [{ label: `Summarize ${shortName(docName)}`, run: () => send(`Summarize "${docName}": the main ideas section by section, then the 5 concepts most likely to be tested.`) }] : []),
    { label: 'Make my to-do list', run: () => prefill(TODO_PROMPT) },
    ...(topic ? [{ label: `Explain ${shortName(topic)} simply`, run: () => send(`Explain ${topic} simply, like I'm new to it, with one example.`) }] : []),
    ...(docName || topic ? [{ label: 'Quiz me', run: () => send('Ask me one quick question on what I\'m studying. Wait for my answer, then tell me if I\'m right and ask the next one.') }] : []),
  ];

  return (
    <motion.aside className="assistant" aria-label="Study assistant" aria-hidden={!open} inert={!open}
      initial={false} animate={open ? { x: 0, opacity: 1 } : { x: '104%', opacity: 0.6 }} transition={{ duration: 0.34, ease: EASE }}>
      <header className="assistant-head">
        <span className="assistant-mark" aria-hidden="true"><Icon name="sparkle" /></span>
        <div className="assistant-title">
          <h2>Study assistant</h2>
          <span>{docName ? `Reading ${shortName(docName, 34)}` : topic ? `Studying ${shortName(topic, 34)}` : 'Ask anything'}</span>
        </div>
        {messages.length > 0 && <button className="btn-quiet" type="button" onClick={clearChat}>Clear</button>}
        <button className="icon-btn" type="button" aria-label="Close the assistant" onClick={closeAssistant}><Icon name="x" /></button>
      </header>

      <div className="assistant-list" ref={list} aria-live="polite">
        {messages.length === 0 && (
          <motion.div className="assistant-hello" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
            <p><strong>Hi! I&apos;m your study assistant.</strong> I can read your document, explain things, answer any question, quiz you, and turn everything you need to do into a to-do list planned around your timer.</p>
            {aiStatus === 'off' && <p className="hint warn">The AI isn&apos;t switched on for this site yet.</p>}
          </motion.div>
        )}
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {busy && <div className="bubble bot typing" aria-label="The assistant is writing"><span /><span /><span /></div>}
      </div>

      {messages.length === 0 && (
        <div className="assistant-chips">
          {chips.map((c) => <button key={c.label} className="chip" type="button" onClick={c.run} disabled={busy}>{c.label}</button>)}
        </div>
      )}

      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="assistantBox">Message the study assistant</label>
        <textarea id="assistantBox" ref={box} rows={1} placeholder="Ask anything, or list your to-dos…" maxLength={4000}
          onInput={(e) => autosize(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn btn-primary send-btn" type="submit" aria-label="Send" disabled={busy}><Icon name="send" /></button>
      </form>
    </motion.aside>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const studyMin = useStudy((s) => s.settings.studyMin);
  const mine = m.role === 'user';
  return (
    <motion.div className={`bubble ${mine ? 'me' : 'bot'}${m.error ? ' err' : ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SOFT}>
      {mine ? m.text : <Rich text={m.text} />}
      {m.tasks && m.tasks.length > 0 && (
        <div className="proposal">
          <div className="proposal-head">
            <span>To-do list · {m.tasks.length} task{m.tasks.length === 1 ? '' : 's'}</span>
            <span className="muted">{sessionsText(m.tasks.reduce((n, t) => n + t.sessions, 0), studyMin)}</span>
          </div>
          <ol>{m.tasks.map((t, i) => <li key={i}><span>{t.text}</span><span className="sess">{t.sessions}×</span></li>)}</ol>
          {m.tasksAdded
            ? <p className="proposal-done"><Icon name="check" />{m.tasksAdded === 'dismissed' ? 'Not added' : m.tasksAdded === 'replaced' ? 'Your to-do list was replaced' : 'Added to your to-do list'}</p>
            : (
              <div className="btn-row">
                <button className="btn btn-primary" type="button" onClick={() => resolveTasks(m.id, 'added')}><Icon name="plus" />Add to my to-do list</button>
                <button className="btn" type="button" onClick={() => resolveTasks(m.id, 'replaced')}>Replace my list</button>
                <button className="btn-quiet" type="button" onClick={() => resolveTasks(m.id, 'dismissed')}>No thanks</button>
              </div>
            )}
        </div>
      )}
    </motion.div>
  );
}

/** Light formatting for replies: paragraphs, "- " lists, numbered lists and **bold**. Never raw HTML. */
export function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!items.length) return;
    const lis = items.map((t, i) => <li key={i}>{inline(t)}</li>);
    blocks.push(ordered ? <ol key={blocks.length}>{lis}</ol> : <ul key={blocks.length}>{lis}</ul>);
    items = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      if (items.length && ordered !== !!num) flush();
      ordered = !!num;
      items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="rich">{blocks}</div>;
}

function inline(t: string): ReactNode {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

function autosize(el: HTMLTextAreaElement) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
const shortName = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function sessionsText(n: number, studyMin: number) {
  const mins = n * studyMin;
  const time = mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`;
  return `${n} session${n === 1 ? '' : 's'} · about ${time} of focus`;
}
