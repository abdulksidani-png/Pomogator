/**
 * The instructions sent to the AI for each job. Ported from the reference prototype
 * (docs/reference/studybuddy.html) plus the study assistant. Pure functions, so they're unit-tested.
 */
import type { AssistantInput, DayInput, Material, PlanInput, QuizInput, StudyContext } from '../types';

const LEVEL_NAMES: Record<string, string> = { hs: 'High school', intro: 'Intro college', advanced: 'Advanced college', exam: 'Exam prep' };
const levelText = (c: StudyContext) => (c.level === 'exam' ? `Exam prep${c.exam ? ` for ${c.exam}` : ''}` : LEVEL_NAMES[c.level] || 'Intro college');
const DIFF_TEXT: Record<string, string> = {
  gentle: 'Gentle. Test core facts and definitions directly.',
  standard: 'Standard. Mix recall with understanding (why, how, cause and effect).',
  challenging: 'Challenging. Test application and close distinctions; wrong options should be near-misses a strong student could fall for.',
};

/** Caps for text sent to the AI, in characters. */
export const LIMITS = { notes: 12_000, material: 60_000, heard: 6_000, chatTurns: 16, chatChars: 4_000 };

/** A document excerpt as numbered pages, e.g. "[Slide 3] Title" then its text. */
export function materialText(m: Material | undefined, cap = LIMITS.material): string {
  if (!m?.pages.length) return '';
  const unit = m.unit[0].toUpperCase() + m.unit.slice(1);
  let out = '';
  for (const p of m.pages) {
    const block = `[${unit} ${p.n}] ${p.title}\n${p.text.trim()}\n\n`;
    if (!out && block.length > cap) { out = block.slice(0, cap) + '…\n\n'; continue; } // always send the first page
    if (out.length + block.length > cap) { out += `[…later ${m.unit}s left out for length]`; break; }
    out += block;
  }
  return out.trim();
}

function contextLines(ctx: StudyContext): string[] {
  return [
    `Subject: ${ctx.subject || '(not given)'}`,
    `Topic: ${ctx.topic || '(not given)'}`,
    `Level: ${levelText(ctx)}`,
    `Session goal: ${ctx.goal || '(not given)'}`,
  ];
}

export function quizPrompt({ ctx, n, difficulty, weak, asked, heard, material }: QuizInput): string {
  const notes = (ctx.notes || '').trim().slice(0, LIMITS.notes);
  const doc = materialText(material);
  const spoken = (heard || '').trim().slice(-LIMITS.heard);
  const sources: string[] = [];
  if (doc) sources.push(`The ${material!.unit}s the student covered this session, from "${material!.name}", are between the markers below.\n<<<MATERIAL\n${doc}\nMATERIAL>>>`);
  if (notes) sources.push(`The student's notes are between the markers below.\n<<<NOTES\n${notes}\nNOTES>>>`);
  if (spoken) sources.push(`What the lecture said (an automatic transcript, so expect small errors) is between the markers below.\n<<<LECTURE\n${spoken}\nLECTURE>>>`);
  return [
    'You write short retrieval-practice quizzes for a student who just finished a focused study session.',
    '',
    'STUDY CONTEXT',
    ...contextLines(ctx),
    `Difficulty: ${DIFF_TEXT[difficulty] || DIFF_TEXT.standard}`,
    sources.length
      ? `${sources.join('\n\n')}\nEvery question must be answerable from this material.${doc ? ` When a question comes from the document, end its "explanation" with "(See ${material!.unit} N.)" using the ${material!.unit} number.` : ''}`
      : 'No notes were given. Write questions from standard material for this topic at this level.',
    '',
    'HISTORY',
    weak.length ? `Concepts this student missed before on this topic. Re-test at least one of them and reuse its exact label as "concept": ${weak.join('; ')}` : 'No earlier misses on this topic.',
    asked.length ? `Questions already asked today. Do not repeat or closely paraphrase any of them:\n- ${asked.join('\n- ')}` : 'No questions asked yet today.',
    '',
    'TASK',
    `Write exactly ${n} multiple-choice question${n === 1 ? '' : 's'}.`,
    '- Exactly 4 options and exactly one correct answer.',
    '- Wrong options must be plausible: common mistakes or near-misses, similar in length and style to the right answer. No "all of the above", "none of the above", trick wording or double negatives.',
    '- Each question tests a different key idea and can be read in about 15 seconds.',
    '- If the topic is vague, pick the core ideas a student at this level is expected to know.',
    '- "concept": a 2-5 word label for the idea tested.',
    '- "explanation": 1-2 sentences on why the correct answer is right.',
    '- "memoryAid": a mnemonic, vivid analogy, visual association or study tip that makes this specific fact stick. Under 40 words. No generic advice.',
    '- "optionFeedback": one sentence per option, in the same order as "options". For the correct option, reinforce why it is right. For each wrong option, name the misconception that leads someone to pick it and how to tell it apart from the right answer.',
    '- Do not put letters such as "A." in front of options.',
    '',
    'Reply with only this JSON and no other text:',
    '{"questions":[{"id":"q1","concept":"...","question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","memoryAid":"...","optionFeedback":["...","...","...","..."]}]}',
  ].join('\n');
}

export function planPrompt({ ctx, result, history, weak, studyMin }: PlanInput): string {
  const notes = (ctx.notes || '').trim().slice(0, 3000);
  const items = result.items.map((x) => `- ${x.correct ? 'CORRECT' : 'MISSED'} · ${x.concept}: "${x.question}" Student chose "${x.chosen}". Correct answer: "${x.answer}".`).join('\n');
  const hist = history.length
    ? history.map((h) => `- ${h.date}: studied ${Math.round(h.studiedMin || 0)} min, quiz ${h.total ? `${h.score}/${h.total}` : 'none'}`).join('\n')
    : '- This is the first recorded session on this topic.';
  return [
    'You are a study coach. Write an actionable plan for this student\'s next study session.',
    '',
    'STUDY CONTEXT',
    ...contextLines(ctx),
    notes ? `Excerpt of the student's notes:\n<<<NOTES\n${notes}\nNOTES>>>` : 'No notes were given.',
    '',
    `THIS QUIZ: ${result.score}/${result.total}`,
    items,
    '',
    'HISTORY ON THIS TOPIC (oldest first)',
    hist,
    weak.length ? `Concepts often missed: ${weak.map((w) => `${w.concept} (missed ${w.missed} of ${w.seen})`).join('; ')}` : 'No concepts missed repeatedly.',
    `Current session length: ${studyMin} minutes.`,
    '',
    'RULES',
    '- Build the plan around what was missed in this quiz and in the history. If everything was right, move to the next layer of the topic or harder practice.',
    '- 2 to 4 actions, in the order to do them. Each names one concrete technique (active recall, practice problems, Feynman technique, flashcards, spaced review, concept mapping, worked examples, teach-back, interleaving) and a specific step that uses the student\'s actual material.',
    '- "suggestedMinutes" is 25, 30, 35, 40 or 45, and the action minutes add up to it.',
    '- "summary": 1-2 specific, encouraging sentences. Never shaming.',
    '- "strong" and "review": short concept labels.',
    '- "nextGoal": one line under 12 words that starts with a verb.',
    '',
    'Reply with only this JSON and no other text:',
    '{"summary":"...","strong":["..."],"review":["..."],"actions":[{"minutes":10,"technique":"Active recall","step":"..."}],"suggestedMinutes":30,"nextGoal":"..."}',
  ].join('\n');
}

export function dayPrompt({ sessions, weak }: DayInput): string {
  return [
    'You are a study coach writing a short end-of-day summary for a student.',
    '',
    'TODAY\'S SESSIONS',
    sessions.map((s) => `- ${s.time} · ${s.topic} · studied ${Math.round(s.studiedMin || 0)} min · quiz ${s.quiz}${s.missed.length ? ` · missed: ${s.missed.join(', ')}` : ''}`).join('\n'),
    weak.length ? `Concepts missed most: ${weak.map((w) => `${w.concept} (missed ${w.missed} of ${w.seen})`).join('; ')}` : 'No repeated misses.',
    '',
    'Keep every line short, specific and encouraging. Never shaming.',
    'Reply with only this JSON and no other text:',
    '{"headline":"one sentence about the day","wins":["1-3 items"],"gaps":["1-3 concepts or skills still shaky"],"tomorrow":["2-3 concrete steps for tomorrow\'s first session"]}',
  ].join('\n');
}

/** The assistant's standing instructions, with everything it knows about the student right now. */
export function assistantSystem(a: AssistantInput): string {
  const { ctx, timer, tasks, material, heard, now } = a;
  const notes = (ctx.notes || '').trim().slice(0, 8000);
  const doc = materialText(material);
  const spoken = (heard || '').trim().slice(-LIMITS.heard);
  return [
    'You are StudyBuddy, the friendly study assistant inside a Pomodoro study website. The student talks to you in a chat panel.',
    '',
    'WHAT YOU DO',
    '- Answer any question, study-related or general, clearly and correctly. Say so when you are unsure.',
    '- Explain ideas from the student\'s document, notes or lecture, and summarize them when asked. Cite page or slide numbers from the material, like "(slide 4)". Never invent what the material says; if it doesn\'t cover something, say so and answer from general knowledge.',
    '- Make and plan to-do lists. When the student lists things to do or asks for a to-do list or a plan, break the work into concrete tasks and fill "tasks". Size each task in study sessions of the student\'s session length, and in "reply" give a short schedule that fits the timer: sessions in order with their breaks, with clock times if the current time is known.',
    '- Only fill "tasks" when the student asks for tasks, a to-do list or a plan. Otherwise leave it empty.',
    '',
    'STYLE',
    '- Short, warm and specific. Plain text. Use "- " for bullet lists and **double asterisks** for the few words that matter most. No headings, no tables, no code blocks unless asked.',
    '- Under about 180 words unless the student asks for more detail or a full summary.',
    '',
    'THE STUDENT RIGHT NOW',
    now ? `Current time: ${now}` : '',
    ...contextLines(ctx),
    `Timer: study sessions are ${timer.studyMin} min, short breaks ${timer.shortBreak} min, a ${timer.longBreak}-min long break after every ${timer.longEvery} sessions. ${timer.state}.`,
    tasks.length ? `Current to-do list:\n${tasks.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')}` : 'The to-do list is empty.',
    doc ? `\nThe document "${material!.name}" (${material!.pageCount} ${material!.unit}s; excerpt below):\n<<<MATERIAL\n${doc}\nMATERIAL>>>` : 'No document is selected.',
    notes ? `\nThe student's notes:\n<<<NOTES\n${notes}\nNOTES>>>` : '',
    spoken ? `\nWhat the lecture said so far (automatic transcript):\n<<<LECTURE\n${spoken}\nLECTURE>>>` : '',
    '',
    'Reply with only this JSON and no other text:',
    '{"reply":"your message to the student","tasks":[{"text":"a concrete task under 80 characters","sessions":1}]}',
  ].filter((l) => l !== '').join('\n');
}
