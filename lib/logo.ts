/**
 * PomoGator's mark, in the same 2-bit pixel style as the study buddies: a pixel Pomodoro timer ring with
 * Albert the gator, in his study glasses, peeking out of the water inside it.
 * `t` is the ring's track (it follows the theme), `o` the orange progress arc.
 * Pure data, so scripts can turn it into app/icon.svg (`node --experimental-strip-types scripts/icon.mts`).
 */
export const ROWS = [
  '.........tttooo.........',
  '......ttttttoooooo......',
  '.....tttt......oooo.....',
  '....ttt..........ooo....',
  '...tt..............oo...',
  '..tt................oo..',
  '.ttt................ooo.',
  '.tt...kkkkk..........oo.',
  '.tt..kKKKKKk.........oo.',
  'tt..kKwwwwwKk.........oo',
  'tt..kKwwwkwKkkkkkkk...oo',
  'tt.kgKwwwkwKggggggggk.oo',
  'tt.kggKKKKKgggggggkgk.oo',
  'tt.kgggggggggggggggk..oo',
  'tt.kggggkwkwkwkwkwk...oo',
  '.ttuuvvvuuvvvuuvvvuuvoo.',
  '.ttuuuuuuuuuuuuuuuuuuoo.',
  '.tttuuuuuuuuuuuuuuuuooo.',
  '..ttuuuuuuuuuuuuuuuuoo..',
  '...ttuuuuuuuuuuuuuutt...',
  '....tttuuuuuuuuuuttt....',
  '.....ttttuuuuuutttt.....',
  '......tttttttttttt......',
  '.........tttttt.........',
];
export const N = ROWS.length;
export const PAL: Record<string, string> = {
  k: '#0D2418', K: '#1B1B1B', g: '#3F9B4A', w: '#FFFFFF', o: '#FA4616', u: '#1F3FB5', v: '#7FA6F5',
};
const HEAD = new Set(['k', 'K', 'g', 'w']);

export interface Run { x: number; y: number; w: number; c: string }
export type Part = 'track' | 'head' | 'water' | 'wave';

/** One rect per horizontal run of a color, grouped into parts so they can be animated separately. */
function build() {
  const parts: Record<Part, Run[]> = { track: [], head: [], water: [], wave: [] };
  const arc: { x: number; y: number; a: number }[] = [];
  ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x];
      let e = x + 1;
      while (e < row.length && row[e] === ch) e++;
      if (ch === 't') parts.track.push({ x, y, w: e - x, c: 'var(--rule)' });
      else if (HEAD.has(ch)) parts.head.push({ x, y, w: e - x, c: PAL[ch] });
      else if (ch === 'u') parts.water.push({ x, y, w: e - x, c: PAL.u });
      else if (ch === 'v') parts.wave.push({ x, y, w: e - x, c: PAL.v });
      else if (ch === 'o') {
        for (let i = x; i < e; i++) arc.push({ x: i, y, a: (Math.atan2(i + 0.5 - N / 2, N / 2 - (y + 0.5)) * 180 / Math.PI + 360) % 360 });
      }
      x = e;
    }
  });
  arc.sort((p, q) => p.a - q.a);
  return { parts, arc };
}
export const LOGO = build();

/** The same picture as a standalone SVG file (for app/icon.svg), with fixed colors. */
export function logoSvg(track = '#DCE2EE') {
  const { parts, arc } = LOGO;
  const r = (runs: Run[], c?: string) => runs.map((x) => `<rect x="${x.x}" y="${x.y}" width="${x.w}" height="1" fill="${c ?? x.c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">`
    + r(parts.track, track) + arc.map((p) => `<rect x="${p.x}" y="${p.y}" width="1" height="1" fill="${PAL.o}"/>`).join('')
    + r(parts.head) + r(parts.water) + r(parts.wave) + '</svg>';
}

