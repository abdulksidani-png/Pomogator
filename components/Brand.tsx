import { LOGO, N, PAL, type Run } from '@/lib/logo';

import { pathsByColor } from '@/lib/pixel-paths';
import { Paths } from './Mascot';

const rects = (runs: Run[]) => <Paths parts={pathsByColor(runs)} />;

/** The mark. `animated` (the loading screen) fills the arc pixel by pixel while Albert bobs in the water. */
export function BrandMark({ className = 'brand-mark', animated = false }: { className?: string; animated?: boolean }) {
  const { parts, arc } = LOGO;
  return (
    <svg className={`${className} pixel-logo${animated ? ' logo-live' : ''}`} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" aria-hidden="true">
      <g>{rects(parts.track)}</g>
      {/* While animating, the whole ring shows its track and the arc lights up over it. */}
      {animated && <g>{arc.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill="var(--rule)" />)}</g>}
      {/* The loading screen lights the arc one pixel at a time; everywhere else it's one shape. */}
      <g className="logo-arc">{animated
        ? arc.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill={PAL.o} style={{ ['--i' as string]: i }} />)
        : rects(arc.map((p) => ({ x: p.x, y: p.y, w: 1, c: PAL.o })))}</g>
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
