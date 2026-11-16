import { describe, expect, it } from 'vitest';
import { fixLatexEscapes, hasMath, pieces, plain } from '@/lib/rich';
import { parseJson } from '@/lib/ai/gemini';
import { renderMath } from '@/lib/katex-bundle';

const BT = '`';

describe('math and code in AI-written text', () => {
  it('finds formulas between dollar signs and leaves the words around them', () => {
    const q = String.raw`Why is $\frac{\partial C_0}{\partial a^{(L)}} = 2(a^{(L)} - y)$, significant?`;
    expect(pieces(q)).toEqual([
      { kind: 'text', value: 'Why is ' },
      { kind: 'math', value: String.raw`\frac{\partial C_0}{\partial a^{(L)}} = 2(a^{(L)} - y)` },
      { kind: 'text', value: ', significant?' },
    ]);
    expect(hasMath(q)).toBe(true);
  });

  it('reads the other math marks too, and display math', () => {
    expect(pieces(String.raw`Solve \(x^2 = 4\) then $$\int_0^1 x\,dx$$ and \[a+b\]`).map((p) => p.kind)).toEqual(['text', 'math', 'text', 'display', 'text', 'display']);
  });

  it('keeps money as money', () => {
    for (const s of ['It costs $5 and $10 more.', 'From $20,000 to $30,000 a year', 'Pay $5/$10 per unit', 'Just $ alone', 'A $ b $ c']) {
      expect(pieces(s)).toEqual([{ kind: 'text', value: s }]);
      expect(hasMath(s)).toBe(false);
    }
    // Money and a formula in one sentence.
    expect(pieces('At $5 each, the cost is $5n$ dollars.').map((p) => [p.kind, p.value])).toEqual([['text', 'At $5 each, the cost is '], ['math', '5n'], ['text', ' dollars.']]);
  });

  it('marks code in the line and code blocks', () => {
    expect(pieces(`What does ${BT}x += 1${BT} do?`)).toEqual([{ kind: 'text', value: 'What does ' }, { kind: 'code', value: 'x += 1' }, { kind: 'text', value: ' do?' }]);
    const fence = BT.repeat(3);
    expect(pieces(`What prints?\n${fence}python\nfor i in range(2):\n    print(i)\n${fence}`)).toEqual([
      { kind: 'text', value: 'What prints?\n' }, { kind: 'pre', value: 'for i in range(2):\n    print(i)' },
    ]);
    // A dollar sign inside code is not math.
    expect(pieces(`Run ${BT}echo $HOME${BT} now`).map((p) => p.kind)).toEqual(['text', 'code', 'text']);
  });

  it('gives the plain words for labels', () => {
    expect(plain('The answer is $x^2$')).toBe('The answer is x^2');
    expect(plain('Nothing special')).toBe('Nothing special');
  });

  it('repairs LaTeX whose backslashes were eaten by JSON', () => {
    // "\frac" → form feed + "rac", "\theta" → tab + "heta", "\beta" → backspace + "eta", "\rho", "\nabla".
    expect(fixLatexEscapes('$\frac{a}{b}$')).toBe(String.raw`$\frac{a}{b}$`);
    expect(fixLatexEscapes('$\theta + \beta$')).toBe(String.raw`$\theta + \beta$`);
    expect(fixLatexEscapes('$\rho \nabla f$')).toBe(String.raw`$\rho \nabla f$`);
    expect(fixLatexEscapes('Line one\nLine two\twith a tab')).toBe('Line one\nLine two\twith a tab'); // ordinary text untouched
    expect(pieces('$\frac{1}{2}$')).toEqual([{ kind: 'math', value: String.raw`\frac{1}{2}` }]);
  });

  it('reads JSON whose LaTeX has single backslashes', () => {
    const bad = String.raw`{"q":"What is $\partial C / \partial a$ and $\sigma(z)$?","ok":"a\nb \"x\" \\alpha"}`;
    expect(() => JSON.parse(bad)).toThrow();
    expect(parseJson(bad)).toEqual({ q: String.raw`What is $\partial C / \partial a$ and $\sigma(z)$?`, ok: 'a\nb "x" \\alpha' });
    expect(parseJson('{"a":1}')).toEqual({ a: 1 }); // good JSON is untouched
  });

  it('draws a formula as HTML with MathML for screen readers, and never throws on bad LaTeX', () => {
    const html = renderMath(String.raw`\frac{\partial C_0}{\partial a^{(L)}}`, false);
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toContain('mfrac');
    expect(() => renderMath(String.raw`\frac{1}{`, false)).not.toThrow();
    // Anything that looks like HTML in the LaTeX is escaped, not inserted.
    expect(renderMath(String.raw`\text{<img src=x onerror=alert(1)>}`, false)).not.toContain('<img');
  });
});
