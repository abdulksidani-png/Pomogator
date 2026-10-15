import { useMemo } from 'react';
import type { MascotKind } from '@/lib/types';

export type Mood = 'idle' | 'focus' | 'quiz' | 'happy' | 'rest' | 'cheer';

const INK = '#3A1D22';

/** The study buddy beside the timer. Its face follows the timer: focused, quizzing, happy, resting. */
export function Mascot({ mood, kind = 'tomato' }: { mood: Mood; kind?: MascotKind }) {
  if (kind === 'robot') return <Robot mood={mood} />;
  if (kind === 'gorilla' || kind === 'gator') return <Pixel mood={mood} sprite={SPRITES[kind]} name={kind} />;
  return <Tomato mood={mood} />;
}

/** Tomato buddy, the original (and the Tomato theme's own). */
function Tomato({ mood }: { mood: Mood }) {
  return (
    <svg className="mascot" viewBox="0 0 120 124" data-mood={mood}>
      <ellipse cx="60" cy="117" rx="32" ry="5" fill="var(--sunk)" />
      <g className="m-bob">
        <path d="M60 30C90 29 108 50 106 75c-2 24-21 37-46 37S16 99 14 75C12 50 30 31 60 30z" fill="var(--accent)" />
        <path d="M28 58c3-11 12-19 23-21" fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 33c-6-6-15-8-22-6 5 3 10 6 14 9-7 0-14 3-17 8 7-1 15-1 23-4 8 3 16 3 23 4-3-5-10-8-17-8 4-3 9-6 14-9-7-2-16 0-22 6z" fill="var(--margin)" />
        <rect x="57.5" y="14" width="5" height="18" rx="2.5" fill="var(--margin)" />
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
      </g>
    </svg>
  );
}

/** A friendly robot whose face is a little screen. Its body takes the accent color. */
function Robot({ mood }: { mood: Mood }) {
  const glow = '#5CF2C9', metal = '#D7DDE7', shade = '#A9B3C4', screen = '#18202F';
  return (
    <svg className="mascot robot" viewBox="0 0 120 124" data-mood={mood}>
      <ellipse cx="60" cy="117" rx="30" ry="5" fill="var(--sunk)" />
      <g className="m-bob">
        <path d="M60 24V11" stroke={shade} strokeWidth="4" strokeLinecap="round" />
        <circle className="r-bulb" cx="60" cy="9" r="6" fill="var(--accent)" />
        <rect x="14" y="42" width="10" height="20" rx="4" fill={shade} />
        <rect x="96" y="42" width="10" height="20" rx="4" fill={shade} />
        <rect x="21" y="23" width="78" height="60" rx="18" fill={metal} />
        <rect x="21" y="23" width="78" height="60" rx="18" fill="none" stroke={shade} strokeWidth="3" />
        <rect x="31" y="33" width="58" height="40" rx="11" fill={screen} />
        <g fill={glow} stroke={glow} strokeLinecap="round" strokeLinejoin="round">
          <g className="v v-idle v-cheer" stroke="none"><rect x="43" y="43" width="9" height="13" rx="4.5" /><rect x="68" y="43" width="9" height="13" rx="4.5" /></g>
          <g className="v v-focus" stroke="none"><rect x="41" y="48" width="14" height="5" rx="2.5" /><rect x="65" y="48" width="14" height="5" rx="2.5" /></g>
          <g className="v v-quiz" stroke="none"><circle cx="48" cy="50" r="6" /><rect x="67" y="47" width="11" height="6" rx="3" /></g>
          <g className="v v-happy" fill="none" strokeWidth="4"><path d="M42 53l5.5-6 5.5 6M67 53l5.5-6 5.5 6" /></g>
          <g className="v v-rest" fill="none" strokeWidth="4"><path d="M42 50h11M67 50h11" /></g>
          <path className="v v-idle v-focus" d="M53 64q7 4 14 0" fill="none" strokeWidth="3" />
          <path className="v v-happy v-cheer" d="M51 61q9 8 18 0z" strokeWidth="2" />
          <circle className="v v-quiz" cx="60" cy="64" r="3" stroke="none" />
          <path className="v v-rest" d="M56 64h8" fill="none" strokeWidth="3" />
        </g>
        <rect x="36" y="86" width="48" height="24" rx="9" fill={metal} stroke={shade} strokeWidth="3" />
        <circle className="r-chest" cx="60" cy="98" r="5" fill="var(--accent)" />
        <rect x="26" y="88" width="9" height="16" rx="4.5" fill={shade} />
        <rect x="85" y="88" width="9" height="16" rx="4.5" fill={shade} />
        <g className="v v-rest" fill="var(--fg-3)"><text x="98" y="26" fontSize="14">z</text><text x="108" y="14" fontSize="10">z</text></g>
      </g>
    </svg>
  );
}

/* ---------------- pixel buddies ---------------- */

interface Sprite { w: number; pal: Record<string, string>; base: string[]; moods: Partial<Record<Mood, Record<number, [number, string]>>> }

/** 2-bit-style arcade sprites: the base picture plus the pixels that change for each mood. */
const SPRITES: Record<'gorilla' | 'gator', Sprite> = {
  gorilla: {
    w: 24,
    pal: {"k": "#1E1410", "b": "#5B3A29", "f": "#C9946A", "w": "#F4E9DC"},
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
      focus: { 5: [7, "kk....kk"], 6: [7, ".kk..kk."], 7: [7, "wk....kw"], 10: [10, "kkkk"] },
      quiz: { 6: [7, "ww....ww"], 7: [7, "kk....kk"], 10: [11, "kk"], 11: [11, "kk"] },
      happy: { 6: [7, ".k....k."], 7: [7, "k.k..k.k"], 10: [9, "kwwwwk"], 11: [10, "kkkk"] },
      rest: { 7: [7, "kk....kk"], 10: [11, "kk"], 0: [20, "kkkk"], 1: [22, "k"], 2: [21, "k"], 3: [20, "kkkk"] },
      cheer: { 6: [7, "ww....ww"], 7: [7, "kw....wk"], 10: [9, "kwwwwk"], 11: [10, "kkkk"] },
    },
  },
  gator: {
    w: 28,
    pal: {"k": "#0D2418", "g": "#3F9B4A", "l": "#B6E07A", "w": "#FFFFFF", "o": "#FA4616", "u": "#1F3FB5"},
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
      focus: { 2: [6, "kkkk"], 3: [7, "kk"], 4: [7, "wk"] },
      quiz: { 3: [7, "ww"], 4: [7, "kk"], 10: [12, "kkkk"], 11: [12, "kkkk"] },
      happy: { 3: [7, "k."], 4: [6, "k.k"] },
      rest: { 4: [7, "kk"], 0: [15, "kkkk"], 1: [17, "k"], 2: [16, "k"], 3: [15, "kkkk"] },
      cheer: { 3: [7, "ww"], 4: [7, "wk"], 10: [9, "lwwwwwwwwwwwl"] },
    },
  },
};

/** Draw a sprite as rows of pixel runs (one <rect> per run), crisp at any size. */
function Pixel({ mood, sprite, name }: { mood: Mood; sprite: Sprite; name: string }) {
  const runs = useMemo(() => {
    const rows = sprite.base.map((r) => r.split(''));
    for (const [y, [x, s]] of Object.entries(sprite.moods[mood] ?? {})) {
      [...s].forEach((c, i) => { if (c !== '.') rows[Number(y)][x + i] = c; });
    }
    const out: { x: number; y: number; w: number; c: string }[] = [];
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length;) {
        const c = r[x];
        let e = x + 1;
        while (e < r.length && r[e] === c) e++;
        if (c !== '.') out.push({ x, y, w: e - x, c: sprite.pal[c] });
        x = e;
      }
    });
    return out;
  }, [mood, sprite]);
  const h = sprite.base.length;
  return (
    <svg className={`mascot pixel ${name}`} viewBox={`-2 -2 ${sprite.w + 4} ${h + 5}`} data-mood={mood} shapeRendering="crispEdges">
      <rect x={sprite.w / 2 - 8} y={h + 1} width="16" height="1" fill="var(--sunk)" />
      <g className="m-bob">{runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />)}</g>
    </svg>
  );
}
