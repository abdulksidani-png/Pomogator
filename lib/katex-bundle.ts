// KaTeX and its stylesheet and fonts, loaded only when some text on the page actually has a formula in it.
import 'katex/dist/katex.min.css';
import katex from 'katex';

/** LaTeX → HTML (with MathML inside for screen readers). Bad LaTeX is shown in red as typed, never thrown. */
export function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml', maxExpand: 200 });
}
