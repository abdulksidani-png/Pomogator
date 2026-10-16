import { useMemo } from 'react';
import type { MascotKind } from '@/lib/types';

export type Mood = 'idle' | 'focus' | 'quiz' | 'happy' | 'rest' | 'cheer' | 'sad';

const INK = '#3A1D22';

/** The study buddy beside the timer. Its face follows the timer: focused, quizzing, happy, resting. */
export function Mascot({ mood, kind = 'tomato' }: { mood: Mood; kind?: MascotKind }) {
  if (kind === 'gorilla' || kind === 'gator' || kind === 'panther' || kind === 'bulldog') return <Pixel mood={mood} sprite={SPRITES[kind]} name={kind} />;
  return <Tomato mood={mood} />;
}

// A tomato stays red with a green stem in every theme (the Tomato theme's own colors).
const TOMATO_RED = '#D63A43', TOMATO_GREEN = '#3E9A5E';

/** Tomato buddy, the original (and the Tomato theme's own). */
function Tomato({ mood }: { mood: Mood }) {
  return (
    <svg className="mascot tomato" viewBox="0 0 120 124" data-mood={mood}>
      <ellipse cx="60" cy="117" rx="32" ry="5" fill="var(--sunk)" />
      <g className="m-bob">
        <path d="M60 30C90 29 108 50 106 75c-2 24-21 37-46 37S16 99 14 75C12 50 30 31 60 30z" fill={TOMATO_RED} />
        <path d="M28 58c3-11 12-19 23-21" fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 33c-6-6-15-8-22-6 5 3 10 6 14 9-7 0-14 3-17 8 7-1 15-1 23-4 8 3 16 3 23 4-3-5-10-8-17-8 4-3 9-6 14-9-7-2-16 0-22 6z" fill={TOMATO_GREEN} />
        <rect x="57.5" y="14" width="5" height="18" rx="2.5" fill={TOMATO_GREEN} />
        <ellipse cx="37" cy="83" rx="7" ry="4.5" fill="#FF9AA6" opacity=".75" />
        <ellipse cx="83" cy="83" rx="7" ry="4.5" fill="#FF9AA6" opacity=".75" />
        <g className="v v-idle v-quiz v-cheer" fill={INK}>
          <ellipse cx="46" cy="71" rx="4.5" ry="6" /><ellipse cx="74" cy="71" rx="4.5" ry="6" />
          <circle cx="47.5" cy="68.5" r="1.6" fill="#FFFFFF" /><circle cx="75.5" cy="68.5" r="1.6" fill="#FFFFFF" />
        </g>
        <g className="v v-focus" fill={INK}>
          <ellipse cx="46" cy="72" rx="4.5" ry="5" /><ellipse cx="74" cy="72" rx="4.5" ry="5" />
          <path d="M39 62l13 3M81 62l-13 3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className="v v-happy" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round"><path d="M40 72q6-7 12 0M68 72q6-7 12 0" /></g>
        <g className="v v-rest" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round"><path d="M40 70q6 6 12 0M68 70q6 6 12 0" /></g>
        <path className="v v-idle v-cheer" d="M52 85q8 8 16 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path className="v v-focus" d="M54 88h12" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <ellipse className="v v-quiz" cx="60" cy="88" rx="4" ry="5" fill={INK} />
        <path className="v v-happy" d="M49 83q11 15 22 0z" fill={INK} />
        <path className="v v-rest" d="M55 87q5 3 10 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <g className="v v-rest" fill="var(--fg-3)"><text x="96" y="30" fontSize="14">z</text><text x="106" y="18" fontSize="10">z</text></g>
        <g className="v v-sad">
          <ellipse cx="46" cy="73" rx="4.2" ry="4.8" fill={INK} /><ellipse cx="74" cy="73" rx="4.2" ry="4.8" fill={INK} />
          <path d="M38 64l12-4M82 64l-12-4" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M51 91q9-8 18 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path className="tear" d="M80 79q-3 5 0 7q3-2 0-7z" fill="#7FC4FF" />
        </g>
        <g className="v v-focus" fill="#FFFFFF" fillOpacity=".28" stroke={INK} strokeWidth="3"><circle cx="46" cy="72" r="9.5" /><circle cx="74" cy="72" r="9.5" /><path d="M55.5 71q4.5-3 9 0" fill="none" /></g>
      </g>
      <g className="v v-focus">
        <rect x="4" y="104" width="112" height="7" rx="2" fill="#8A5A3B" /><rect x="10" y="111" width="5" height="12" fill="#6B4329" /><rect x="105" y="111" width="5" height="12" fill="#6B4329" />
        <rect x="34" y="94" width="44" height="11" rx="1.5" fill="#FBF7EE" stroke="#D8D2C2" /><path d="M39 98.5h30M39 101.5h22" stroke="#BFC6D6" strokeWidth="1.5" />
        <g className="pencil"><path d="M76 99l14-17 4 3.4-14 17z" fill="#F2C14E" /><path d="M90 82l4 3.4 2-2.6-4-3.4z" fill="#E07A7A" /><path d="M76 99l4 3.4-5 1.6z" fill="#3A3A3A" /></g>
      </g>
    </svg>
  );
}

/* ---------------- pixel buddies ---------------- */

interface Layer { x: number; y: number; rows: string[]; cls?: string }
interface Sprite { w: number; pal: Record<string, string>; base: string[]; moods: Partial<Record<Mood, Record<number, [number, string]>>>; study: Layer[] }

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
const SPRITES: Record<'gorilla' | 'gator' | 'panther' | 'bulldog', Sprite> = {
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
};

/** Draw a sprite as rows of pixel runs (one <rect> per run), crisp at any size. */
function Pixel({ mood, sprite, name }: { mood: Mood; sprite: Sprite; name: string }) {
  const runs = useMemo(() => {
    const rows = sprite.base.map((r) => r.split(''));
    for (const [y, [x, s]] of Object.entries(sprite.moods[mood] ?? {})) {
      [...s].forEach((c, i) => { if (c !== '.') rows[Number(y)][x + i] = c; });
    }
    return toRuns(rows, sprite.pal);
  }, [mood, sprite]);
  // While studying: a desk, paper or a laptop, and a pencil or typing hands that move.
  const props = useMemo(() => (mood === 'focus' ? sprite.study.map((l) => ({ cls: l.cls ?? '', runs: toRuns(l.rows, { ...PROPS, ...sprite.pal }, l.x, l.y) })) : []), [mood, sprite]);
  const h = sprite.base.length;
  return (
    <svg className={`mascot pixel ${name}`} viewBox={`-2 -2 ${sprite.w + 4} ${h + 5}`} data-mood={mood} shapeRendering="crispEdges">
      <rect x={sprite.w / 2 - 8} y={h + 1} width="16" height="1" fill="var(--sunk)" />
      <g className="m-bob">{runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}</g>
      {props.map((l, j) => <g key={j} className={l.cls || undefined}>{l.runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}</g>)}
    </svg>
  );
}
