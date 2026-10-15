import { LOGO, N, PAL, type Run } from '@/lib/logo';

const rects = (runs: Run[]) => runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />);

/** The mark. `animated` (the loading screen) fills the arc pixel by pixel while Albert bobs in the water. */
export function BrandMark({ className = 'brand-mark', animated = false }: { className?: string; animated?: boolean }) {
  const { parts, arc } = LOGO;
  return (
    <svg className={`${className} pixel-logo${animated ? ' logo-live' : ''}`} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" aria-hidden="true">
      <g>{rects(parts.track)}</g>
      {/* While animating, the whole ring shows its track and the arc lights up over it. */}
      {animated && <g>{arc.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill="var(--rule)" />)}</g>}
      <g className="logo-arc">{arc.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill={PAL.o} style={animated ? { ['--i' as string]: i } : undefined} />)}</g>
      <g className="logo-head">{rects(parts.head)}</g>
      <g>{rects(parts.water)}</g>
      <g className="logo-wave">{rects(parts.wave)}</g>
    </svg>
  );
}

/** The name, with "Gator" in the accent color. */
export function BrandName() {
  return <span className="brand-name">Pomo<span className="brand-gator">Gator</span></span>;
}
