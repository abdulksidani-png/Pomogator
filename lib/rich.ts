/**
 * Splits AI-written text into plain text, math and code, so quizzes and the assistant can show a formula as a
 * formula (lib/katex-bundle.ts draws it) and code in a code font. Pure, tested in tests/unit/rich.test.ts.
 *
 * Math is LaTeX between $…$ or \(…\) (in the line), or $$…$$ or \[…\] (on its own line). A dollar sign is only
 * read as math when it hugs what's inside it and isn't followed by a digit, so "$5 and $10" stays money.
 */
export type Piece = { kind: 'text' | 'math' | 'display' | 'code' | 'pre'; value: string };

/**
 * A model that forgets to double a backslash inside JSON turns "\frac" into a form feed + "rac", "\theta" into a
 * tab + "heta", and so on. Put those back. (A real newline or tab before ordinary words is left alone.)
 */
export function fixLatexEscapes(s: string): string {
  return s
    .replace(/\f/g, '\\f')
    .replace(/\x08/g, '\\b')
    .replace(/\x0b/g, '\\v')
    .replace(/\t(?=(?:heta|au|imes|ext|frac|o\b|an|ilde|riangle|op\b|herefore))/g, '\\t')
    .replace(/\r(?=(?:ho|ight|angle|ightarrow|m\b|Rightarrow))/g, '\\r')
    .replace(/\n(?=(?:abla|eq\b|u\b|ot\b|eg\b|i\b|otin|e\b|leq|geq|mid|parallel|subset|ewline))/g, '\\n');
}

const FENCE = '`'.repeat(3);
const TOKEN = new RegExp(
  [
    `${FENCE}[^\\n]*\\n?([\\s\\S]*?)${FENCE}`, // 1: a fenced block of code
    '`([^`\\n]+)`', // 2: code in the line
    '\\$\\$([\\s\\S]+?)\\$\\$', // 3: display math
    '\\\\\\[([\\s\\S]+?)\\\\\\]', // 4: display math, \[ \]
    '\\\\\\(([\\s\\S]+?)\\\\\\)', // 5: math in the line, \( \)
    '\\$((?:\\\\[\\s\\S]|[^$\\\\\\n]){1,400}?)\\$(?!\\d)', // 6: math in the line, $ $
  ].join('|'),
  'g',
);

export function pieces(input: string): Piece[] {
  const text = fixLatexEscapes(input);
  const out: Piece[] = [];
  const push = (kind: Piece['kind'], value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (kind === 'text' && last?.kind === 'text') last.value += value;
    else out.push({ kind, value });
  };
  let at = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const [whole, pre, code, display1, display2, inline1, dollar] = m;
    if (dollar !== undefined && (/^\s|\s$/.test(dollar) || !dollar.trim())) {
      // "$5 and $" is money, not math: keep the dollar sign and look again from just after it.
      push('text', text.slice(at, m.index + 1));
      at = m.index + 1;
      TOKEN.lastIndex = at;
      continue;
    }
    push('text', text.slice(at, m.index));
    if (pre !== undefined) push('pre', pre.replace(/\n$/, ''));
    else if (code !== undefined) push('code', code);
    else if (display1 !== undefined || display2 !== undefined) push('display', (display1 ?? display2)!.trim());
    else push('math', (inline1 ?? dollar)!.trim());
    at = m.index + whole.length;
  }
  push('text', text.slice(at));
  return out;
}

/** Does this text need the math renderer at all? */
export const hasMath = (text: string) => pieces(text).some((p) => p.kind === 'math' || p.kind === 'display');

/** The text without the $ and code marks, for labels read aloud and for search. */
export const plain = (text: string) => pieces(text).map((p) => p.value).join('');
