/**
 * Pixel art as one SVG path per color instead of one <rect> per run: the same pixels with a fraction of the
 * elements (a buddy drops from ~150 nodes to ~10), so pages with several buddies stay light and smooth.
 */
export interface PixelRun { x: number; y: number; w: number; c: string }

export function pathsByColor(runs: readonly PixelRun[]): { c: string; d: string }[] {
  const by = new Map<string, string[]>();
  for (const r of runs) {
    const list = by.get(r.c) ?? [];
    list.push(`M${r.x} ${r.y}h${r.w}v1h${-r.w}z`);
    by.set(r.c, list);
  }
  return [...by].map(([c, parts]) => ({ c, d: parts.join('') }));
}
