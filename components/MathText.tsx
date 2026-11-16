'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { pieces } from '@/lib/rich';

type Render = (tex: string, display: boolean) => string;
let render: Render | null = null;
let loading: Promise<unknown> | null = null;
const load = () => (loading ??= import('@/lib/katex-bundle').then((m) => { render = m.renderMath; }).catch(() => { loading = null; }));

/**
 * AI-written text with its formulas drawn as formulas and its code in a code font. Math is LaTeX between dollar
 * signs (see lib/rich.ts). The renderer loads the first time a formula shows up; until then (or if it can't load)
 * the LaTeX is shown as typed. KaTeX escapes everything it's given, so its HTML is safe to insert.
 */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => pieces(text), [text]);
  const needs = parts.some((p) => p.kind === 'math' || p.kind === 'display');
  const [ready, setReady] = useState(!!render);
  useEffect(() => {
    if (!needs || ready) return;
    if (render) { setReady(true); return; }
    let live = true;
    void load().then(() => { if (live && render) setReady(true); });
    return () => { live = false; };
  }, [needs, ready]);

  if (parts.length === 1 && parts[0].kind === 'text') return <>{parts[0].value}</>;
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <Fragment key={i}>{p.value}</Fragment>;
        if (p.kind === 'code') return <code key={i} className="q-code">{p.value}</code>;
        if (p.kind === 'pre') return <pre key={i} className="q-pre"><code>{p.value}</code></pre>;
        const display = p.kind === 'display';
        if (!ready || !render) return <span key={i} className="math-raw">{display ? `$$${p.value}$$` : `$${p.value}$`}</span>;
        return <span key={i} className={display ? 'math math-display' : 'math'} dangerouslySetInnerHTML={{ __html: render(p.value, display) }} />;
      })}
    </>
  );
}
