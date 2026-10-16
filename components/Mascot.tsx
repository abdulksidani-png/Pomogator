import { useMemo } from 'react';
import type { MascotKind } from '@/lib/types';
import { COSMETIC_PAL, cosmeticLayers, slotOf } from '@/lib/cosmetics';

export type Mood = 'idle' | 'focus' | 'quiz' | 'happy' | 'rest' | 'cheer' | 'sad';

/** The study buddy beside the timer. Its face follows the timer: focused, quizzing, happy, resting. */
/** `wear`: cosmetics from the shop (sunglasses, hats, a tie) drawn on top, the same on every buddy. */
export function Mascot({ mood, kind = 'gator', wear = NONE }: { mood: Mood; kind?: MascotKind; wear?: readonly string[] }) {
  const k: keyof typeof SPRITES = kind in SPRITES ? kind : 'gator'; // a retired buddy (robot, tomato) shows as Albert
  return <Pixel mood={mood} sprite={SPRITES[k]} name={k} wear={wear} />;
}
const NONE: readonly string[] = [];

/* ---------------- pixel buddies ---------------- */

interface Layer { x: number; y: number; rows: string[]; cls?: string }
interface Sprite {
  w: number; pal: Record<string, string>; base: string[];
  /** The top rows without a built-in hat, swapped in while a shop hat is worn. */
  capless?: string[];
  moods: Partial<Record<Mood, Record<number, [number, string]>>>; study: Layer[] }

/** Colors for the study props (desk, paper, pencil, laptop, typing hands). */
const PROPS: Record<string, string> = { D: '#8A5A3B', d: '#6B4329', P: '#FBF7EE', L: '#BFC6D6', Y: '#F2C14E', R: '#E07A7A', G: '#3A3A3A', S: '#9AD1FF', g: '#3F9B4A' };

/** Rows of pixel letters → one <rect> per horizontal run of the same color. */
function toRuns(rows: string[][] | string[], pal: Record<string, string>, ox = 0, oy = 0) {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((r, y) => {
    const row = typeof r === 'string' ? r.split('') : r;
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let e = x + 1;
      while (e < row.length && row[e] === c) e++;
      if (c !== '.' && pal[c]) out.push({ x: x + ox, y: y + oy, w: e - x, c: pal[c] });
      x = e;
    }
  });
  return out;
}

/** 2-bit-style arcade sprites: the base picture plus the pixels that change for each mood. */
const SPRITES: Record<'gorilla' | 'gator' | 'panther' | 'bulldog' | 'ibis', Sprite> = {
  gorilla: {
    w: 24,
    pal: {"k": "#1E1410", "b": "#5B3A29", "f": "#C9946A", "w": "#F4E9DC", "t": "#7FC4FF"},
    base: [
      '........kkkkkkkk........',
      '......kkbbbbbbbbkk......',
      '.....kbbbbbbbbbbbbk.....',
      '....kbbbbbbbbbbbbbbk....',
      '....kbbkkkkkkkkkkbbk....',
      '...kbbkffffffffffkbbk...',
      '...kbkffffffffffffkbk...',
      '...kbkffffffffffffkbk...',
      '...kbkfffffkkfffffkbk...',
      '..kkbbkffffffffffkbbkk..',
      '.kbbbbkffffffffffkbbbbk.',
      'kbbbbbbkffffffffkbbbbbbk',
      'kbbbbbbbkkkkkkkkbbbbbbbk',
      'kbbbbbbffffffffffbbbbbbk',
      'kbbbbbffffffffffffbbbbbk',
      'kbbbkbffffffffffffbkbbbk',
      'kbbbkbbffffffffffbbkbbbk',
      'kfffkbbbffffffffbbbkfffk',
      'kfffkbbbbbbbbbbbbbbkfffk',
      '.kkkkbbbbbbbbbbbbbbkkkk.',
      '....kbbbbbkkkkbbbbbk....',
      '....kbbbbk....kbbbbk....',
      '...kffffk......kffffk...',
      '...kkkkkk......kkkkkk...',
    ],
    moods: {
      idle: { 6: [7, "ww....ww"], 7: [7, "wk....kw"], 10: [9, "k....k"], 11: [10, "kkkk"] },
      focus: { 5: [6, "kkkkk..kkkkk"], 6: [6, "kwwk.kk.kwwk"], 7: [6, "kwkkk..kkwkk"], 8: [6, "kkkk....kkkk"], 10: [10, "kkkk"] },
      quiz: { 6: [7, "ww....ww"], 7: [7, "kk....kk"], 10: [11, "kk"], 11: [11, "kk"] },
      happy: { 6: [7, ".k....k."], 7: [7, "k.k..k.k"], 10: [9, "kwwwwk"], 11: [10, "kkkk"] },
      rest: { 7: [7, "kk....kk"], 10: [11, "kk"], 0: [20, "kkkk"], 1: [22, "k"], 2: [21, "k"], 3: [20, "kkkk"] },
      cheer: { 6: [7, "ww....ww"], 7: [7, "kw....wk"], 10: [9, "kwwwwk"], 11: [10, "kkkk"] },
      sad: { 5: [8, "k....k"], 6: [7, "kk....kk"], 7: [7, "wk....kw"], 8: [8, "t"], 10: [10, "kkkk"], 11: [9, "k....k"] },
    },
    study: [
      { x: 0, y: 19, rows: ["DDDDDDDDDDDDDDDDDDDDDDDD", "dddddddddddddddddddddddd", "d......................d", "d......................d", "d......................d"] },
      { x: 7, y: 17, rows: ["PPPPPPPPPP", "PLLLLLPPPP"] },
      { x: 15, y: 14, rows: ["..R", "..Y", ".Y.", "Y..", "G.."], cls: "pencil" },
    ],
  },
  gator: {
    w: 28,
    pal: {"k": "#0D2418", "g": "#3F9B4A", "l": "#B6E07A", "w": "#FFFFFF", "o": "#FA4616", "u": "#1F3FB5", "t": "#7FC4FF"},
    base: [
      '............................',
      '.......kkkk.................',
      '......kggggk................',
      '.....kggggggk...............',
      '.....kggggggkkkkkkkkkkkk....',
      '....kggggggggggggggggggggk..',
      '....kgggggggggggggggggggggk.',
      '....kgggggggggggggggggggkgk.',
      '....kgggggggggggggggggggggk.',
      '....kgggkwkwkwkwkwkwkwkwkgk.',
      '....kgggklllllllllllllllkkk.',
      '....kggggkllllllllllllkk....',
      '...kkgggggkkkkkkkkkkkk......',
      '..kuuuuuuuuuuk..............',
      '.kuooouuuuooouk.............',
      '.kuuuuuuuuuuuuk.............',
      '.kuooouuuuooouk.............',
      '.kuuuuuuuuuuuuk.............',
      'kgkuuuuuuuuuuukgk...........',
      'kgkkuuuuuuuuukkgk...........',
      '.kkkgggggggggkkk............',
      '...kggk...kggk..............',
      '..kgggk...kgggk.............',
      '..kkkkk...kkkkk.............',
    ],
    moods: {
      idle: { 3: [7, "ww"], 4: [7, "wk"] },
      focus: { 2: [6, "kkkk"], 3: [6, "kwwkkkk"], 4: [6, "kwkk"], 5: [6, "kkkk"] },
      quiz: { 3: [7, "wk"], 4: [7, "ww"] },
      happy: { 3: [7, "k."], 4: [6, "k.k"] },
      rest: { 4: [7, "kk"], 0: [15, "kkkk"], 1: [17, "k"], 2: [16, "k"], 3: [15, "kkkk"] },
      cheer: { 3: [7, "ww"], 4: [7, "wk"], 10: [9, "lwwwwwwwwwwwl"] },
      sad: { 2: [8, "k"], 3: [7, "kk"], 4: [7, "wk"], 5: [8, "t"], 6: [8, "t"], 9: [9, "kkkkkkkkkkkkkkkk"] },
    },
    study: [
      { x: 0, y: 19, rows: ["DDDDDDDDDDDDDDDDDDDDDDDDDDDD", "dddddddddddddddddddddddddddd", "d..........................d", "d..........................d", "d..........................d"] },
      { x: 15, y: 13, rows: ["GGGGGGGGG", "GLLLLLLLG", "GLLLSLLLG", "GLLLLLLLG", "GLLLLLLLG", "GGGGGGGGGGG"] },
      { x: 15, y: 17, rows: ["..g...g.."], cls: "type-a" },
      { x: 15, y: 17, rows: ["...g.g..."], cls: "type-b" },
    ],
  },
  panther: {
    w: 24,
    pal: {"k": "#3A230F", "y": "#D9A13B", "c": "#F7E2B0", "p": "#E58BA0", "n": "#0B2A63", "o": "#E3B23C", "w": "#FFFFFF", "t": "#7FC4FF"},
    base: [
      '....kk..........kk......',
      '...kyyk........kyyk.....',
      '...kypyk......kypyk.....',
      '...kyyyykkkkkkyyyyk.....',
      '...kyyyyyyyyyyyyyyk.....',
      '..kyyyyyyyyyyyyyyyyk....',
      '..kyyyyyyyyyyyyyyyyk....',
      '..kyyyyyyyyyyyyyyyyk....',
      '..kyyyccccccccccyyyk....',
      '..kyycccccppcccccyyk....',
      '...kyccccckkcccccyk.....',
      '....kyyccccccccyyk......',
      '.....kkyyyyyyyykk.......',
      '....knnnnnnnnnnnnk......',
      '...knnnnnnoonnnnnnk.....',
      '..kynnnnnnoonnnnnnyk.kk.',
      '..kynnnnnnoonnnnnnykkyk.',
      '..kyknnnnnnnnnnnnkykyk..',
      '...kknnnnnnnnnnnnkkyk...',
      '....koooooooooooookyk...',
      '....kyyyyk..kyyyyk.k....',
      '....kyyyyk..kyyyyk......',
      '...kccccck..kccccck.....',
      '...kkkkkkk..kkkkkkk.....',
    ],
    moods: {
      idle: { 6: [6, "ww......ww"], 7: [6, "wk......kw"] },
      focus: { 5: [5, "kkkkk..kkkkk"], 6: [5, "kwwk.kk.kwwk"], 7: [5, "kwkkk..kkwkk"], 8: [5, "kkkk....kkkk"] },
      quiz: { 6: [6, "ww......ww"], 7: [6, "kk......kk"], 10: [10, "kk"], 11: [10, "kk"] },
      happy: { 6: [5, ".k........k."], 7: [5, "k.k......k.k"], 11: [9, "kccccc"] },
      rest: { 7: [6, "kk......kk"], 0: [19, "kkkk"], 1: [21, "k"], 2: [20, "k"], 3: [19, "kkkk"] },
      cheer: { 6: [6, "ww......ww"], 7: [6, "kw......wk"], 11: [9, "kkkkkk"] },
      sad: { 5: [7, "k......k"], 6: [6, "kk......kk"], 7: [6, "wk......kw"], 8: [6, "t"], 11: [10, "kkkk"], 12: [9, "k....k"] },
    },
    study: [
      { x: 0, y: 19, rows: ["DDDDDDDDDDDDDDDDDDDDDDDD", "dddddddddddddddddddddddd", "d......................d", "d......................d", "d......................d"] },
      { x: 6, y: 17, rows: ["PPPPPPPPPPPP", "PLLLLLLLLPPP"] },
      { x: 15, y: 14, rows: ["..R", "..Y", ".Y.", "Y..", "G.."], cls: "pencil" },
    ],
  },
  bulldog: {
    w: 24,
    pal: {"k": "#2A1A12", "f": "#D9A066", "s": "#B07A45", "e": "#F6EDE0", "r": "#7A4A28", "p": "#E27A8C", "w": "#FFFFFF", "c": "#2E2A30", "m": "#C9CED6", "u": "#123E6B", "b": "#5C8DC4", "v": "#0A2C4F", "n": "#1E1414", "t": "#7FC4FF"},
    base: [
      '........................',
      '..kkk..kkkkkkkkkk..kkk..',
      '.krrrkkffffffffffkkrrrk.',
      'krrrkfffffeeeefffffkrrrk',
      '.kkfffffsfeeeefsfffffkk.',
      '..kkkffffseeeesffffkkk..',
      '.kffkkkfffeeeefffkkkffk.',
      '.kffffffffeeeeffffffffk.',
      '.kfffffffeeeeeefffffffk.',
      'kfffffffeeeeeeeefffffffk',
      'kffsffeeekkkkkkeeeffsffk',
      'kfsseeeeknknnknkeeeessfk',
      'kfsseeeeeeekkeeeeeeessfk',
      'kfssekwkkkkkkkkkkwkessfk',
      'kfsssekwwwwwwwwwwkesssfk',
      '.kfsssekkkkkkkkkkesssfk.',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.mkcmcmcmcmccmcmcmcmckm.',
      '..kkuuuuubbbbbbuuuuukk..',
      '.kfkuuuuubwvvwbuuuuukfk.',
      'kffkuuuuubvwwvbuuuuukffk',
      '.kkkuuuuuubwwbuuuuuukkk.',
      '...kffffk..bb..kffffk...',
      '...kkkkkk......kkkkkk...',
    ],
    moods: {
      idle: { 7: [6, "ww........ww"], 8: [6, "wk........kw"] },
      focus: { 6: [5, "kkkk......kkkk"], 7: [5, "kwwkkkkkkkkwwk"], 8: [5, "kwkk......kkwk"], 9: [5, "kkkk......kkkk"] },
      quiz: { 7: [6, "wk........kw"], 8: [6, "ww........ww"] },
      happy: { 7: [6, "k..........k"], 8: [5, "k.k........k.k"], 13: [8, "kppppppk"] },
      rest: { 8: [6, "kk........kk"], 13: [8, "kkkppkkk"] },
      cheer: { 7: [6, "ww........ww"], 8: [6, "kw........wk"], 13: [8, "kppppppk"] },
      sad: { 5: [3, "ffkkk........kkkff"], 6: [3, "kkff..........ffkk"], 7: [6, "kk........kk"], 8: [6, "wk........kw"], 9: [6, "t"], 10: [6, "t"], 13: [6, "kkkkkkkkkkkk"], 14: [7, "eeeeeeeeee"] },
    },
    study: [
      { x: 0, y: 19, rows: ["DDDDDDDDDDDDDDDDDDDDDDDD", "dddddddddddddddddddddddd", "d......................d", "d......................d", "d......................d"] },
      { x: 7, y: 17, rows: ["PPPPPPPPPP", "PLLLLLPPPP"] },
      { x: 16, y: 13, rows: ["..R", "..Y", ".Y.", "Y..", "G.."], cls: "pencil" },
    ],
  },
  // Sugarcane: an upright, cartoon ibis in a sailor cap and a green jersey with orange stripes, fists up (original art).
  ibis: {
    w: 26,
    pal: {"k": "#1B2A22", "w": "#FFFFFF", "s": "#D5DDE0", "o": "#F47321", "e": "#C2541A", "g": "#00704A", "h": "#004A31", "x": "#1B2A22", "t": "#7FC4FF"},
    base: [
      '........kkkkkk............',
      '.......kwwwwwwk...........',
      '......kwwwwwwwwk..........',
      '......kssssssssk..........',
      '.......kkkkkkkk...........',
      '.......kswwwwwk...........',
      '......kswwwwwwkk..........',
      '......kswwwwwxwkkkkkk.....',
      '......kswwwwwwwooooooook..',
      '.......kswwwwwkeeeeeoooook',
      '........kswwwk.kkkkkkkeook',
      '........kswwk.........keok',
      '........kswwk..........kok',
      '.......kkswwkk..........k.',
      '.....kkggoowoogkk.........',
      '....kggggggoggggkkk.......',
      '...kgoggggggggggooogk.kk..',
      '..kgogggggggggggkkkkgkwwk.',
      '.kwkoggggggggggk...kkwwwwk',
      '.kwwkgggggggggk.....kkkkk.',
      '.kwwk.kggggggggk..........',
      '..kk..khhhhhhhhk..........',
      '.......kwk...kwk..........',
      '......kwk.....kwk.........',
      '.....kook.....kook........',
      '....kooook...kooooook.....',
      '....kkkkkk...kkkkkkkk.....',
    ],
    // His head without the sailor cap, used while he wears a hat from the shop.
    capless: [
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '........kkkkkk............',
    ],
    moods: {
      idle: {},
      focus: { 6: [12, "kkkk"], 7: [11, "kkxk"], 8: [12, "kkk"] },
      quiz: { 6: [13, "x"], 7: [13, "w"] },
      happy: { 6: [13, "k"], 7: [12, "kwk"] },
      rest: { 7: [12, "kkw"], 0: [1, "kkkk"], 1: [3, "k"], 2: [2, "k"], 3: [1, "kkkk"] },
      cheer: { 6: [11, "kkk"], 7: [13, "kx"] },
      sad: { 6: [13, "kk"], 8: [13, "t"], 9: [13, "t"] },
    },
    study: [
      { x: 0, y: 22, rows: ["DDDDDDDDDDDDDDDDDDDDDDDDDD", "dddddddddddddddddddddddddd", "d........................d", "d........................d", "d........................d"] },
      { x: 15, y: 16, rows: ["GGGGGGGGG", "GLLLLLLLG", "GLLLSLLLG", "GLLLLLLLG", "GLLLLLLLG", "GGGGGGGGGGG"] },
      { x: 15, y: 20, rows: ["..w...w.."], cls: "type-a" },
      { x: 15, y: 20, rows: ["...w.w..."], cls: "type-b" },
    ],
  },
};

/** Draw a sprite as rows of pixel runs (one <rect> per run), crisp at any size. */
function Pixel({ mood, sprite, name, wear }: { mood: Mood; sprite: Sprite; name: keyof typeof SPRITES; wear: readonly string[] }) {
  const hatOn = wear.some((id) => slotOf(id) === 'hat');
  const runs = useMemo(() => {
    const base = sprite.capless && hatOn ? [...sprite.capless, ...sprite.base.slice(sprite.capless.length)] : sprite.base;
    const rows = base.map((r) => r.split(''));
    for (const [y, [x, s]] of Object.entries(sprite.moods[mood] ?? {})) {
      [...s].forEach((c, i) => { if (c !== '.') rows[Number(y)][x + i] = c; });
    }
    return toRuns(rows, sprite.pal);
  }, [mood, sprite, hatOn]);
  // While studying: a desk, paper or a laptop, and a pencil or typing hands that move.
  const props = useMemo(() => (mood === 'focus' ? sprite.study.map((l) => ({ cls: l.cls ?? '', runs: toRuns(l.rows, { ...PROPS, ...sprite.pal }, l.x, l.y) })) : []), [mood, sprite]);
  // Shop cosmetics, on top of the buddy (and moving with it). A tall hat makes the picture taller, not the buddy smaller.
  const extras = useMemo(() => cosmeticLayers(name, wear).map((l) => ({ cls: l.cls ?? '', top: l.y, runs: toRuns(l.rows, COSMETIC_PAL, l.x, l.y) })), [name, wear]);
  const top = Math.min(0, ...extras.map((l) => l.top));
  const h = sprite.base.length;
  return (
    <svg className={`mascot pixel ${name}`} viewBox={`-2 ${top - 2} ${sprite.w + 4} ${h + 5 - top}`} data-mood={mood} data-wear={wear.join(' ') || undefined} shapeRendering="crispEdges">
      <rect x={sprite.w / 2 - 8} y={h + 1} width="16" height="1" fill="var(--sunk)" />
      <g className="m-bob">
        {runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}
        {extras.map((l, j) => <g key={`c${j}`} className={l.cls || undefined}>{l.runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}</g>)}
      </g>
      {props.map((l, j) => <g key={j} className={l.cls || undefined}>{l.runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}</g>)}
    </svg>
  );
}
