/**
 * Cosmetics for the study buddies, bought with study points. Each one is 2-bit pixel art like the buddies,
 * drawn on top of whichever buddy you pick: every buddy has anchor points for a hat, the eyes and the neck.
 * One item per slot can be worn at a time.
 */
import type { MascotKind } from './types';

export type Slot = 'hat' | 'eyes' | 'neck';
export interface Cosmetic { id: string; name: string; slot: Slot; price: number; blurb: string }

export const COSMETICS: Cosmetic[] = [
  { id: 'sunglasses', name: 'Sunglasses', slot: 'eyes', price: 60, blurb: 'Too cool for cramming.' },
  { id: 'tie', name: 'Tie', slot: 'neck', price: 80, blurb: 'Dressed for the exam.' },
  { id: 'cowboy', name: 'Cowboy hat', slot: 'hat', price: 120, blurb: 'Wrangle those flashcards.' },
  { id: 'propeller', name: 'Rainbow propeller hat', slot: 'hat', price: 150, blurb: 'Spins up while you study.' },
];

/** Colors for cosmetics (their own letters, separate from each buddy's palette). */
export const COSMETIC_PAL: Record<string, string> = {
  K: '#1A1A1A', W: '#FFFFFF', A: '#3B4A5A',
  T: '#D93A3A', U: '#A32626',
  B: '#9A6332', O: '#C48A4F', N: '#5A3519',
  r: '#E53935', o: '#FB8C00', y: '#FDD835', g: '#43A047', b: '#1E88E5', v: '#8E24AA', Q: '#E53935', J: '#1E88E5',
};

const HATS: Record<string, string[]> = {
  // The last row sits on the top of the head.
  cowboy: [
    '....KKKKKK....',
    '...KBBOBBBK...',
    '...KBBBBBBK...',
    'K..KNNNNNNK..K',
    'KBBBBBBBBBBBBK',
    '.KKKKKKKKKKKK.',
  ],
  propeller: [
    'QQQQKKJJJJ',
    '....KK....',
    '...KrrK...',
    '..KooooK..',
    '.KyyyyyyK.',
    '.KggggggK.',
    'KbbbbbbbbK',
    'KvvvvvvvvK',
  ],
};

const TIE = ['.KK.', 'KTTK', '.KK.', 'KTTK', 'KTUK', 'KTTK', '.KK.'];

interface Anchor {
  /** Hat: the column its center lines up with (a .5 means between two columns) and the head's top row. */
  hat: { c: number; y: number };
  /** Eyes: the top eye row; `l`/`r` are each eye's first column (front-facing), or `x` and `w` for one eye in profile. */
  eyes: { row: number; l?: number; r?: number; x?: number; w?: number };
  neck: { c: number; y: number };
}

export const ANCHORS: Record<MascotKind, Anchor> = {
  gorilla: { hat: { c: 11.5, y: 0 }, eyes: { row: 6, l: 7, r: 13 }, neck: { c: 11.5, y: 13 } },
  gator: { hat: { c: 8.5, y: 1 }, eyes: { row: 3, x: 7, w: 2 }, neck: { c: 7.5, y: 13 } },
  panther: { hat: { c: 11.5, y: 3 }, eyes: { row: 6, l: 6, r: 14 }, neck: { c: 11.5, y: 13 } },
  bulldog: { hat: { c: 11.5, y: 1 }, eyes: { row: 7, l: 6, r: 16 }, neck: { c: 11.5, y: 18 } },
  ibis: { hat: { c: 11.5, y: 1 }, eyes: { row: 3, x: 11, w: 1 }, neck: { c: 12.5, y: 12 } },
};

export interface CosmeticLayer { x: number; y: number; rows: string[]; cls?: string }

function shades(a: Anchor['eyes']): CosmeticLayer {
  if (a.l !== undefined && a.r !== undefined) {
    // Two lenses joined by a bridge: a bar across, then each lens with a glint.
    const x0 = a.l - 1, x1 = a.r + 2, n = x1 - x0 + 1;
    const lens = (glint: boolean) => (glint ? 'KWKK' : 'KKKK');
    const gap = '.'.repeat(Math.max(0, a.r - a.l - 4));
    return { x: x0, y: a.row, rows: ['K'.repeat(n), lens(true) + gap + lens(true), '.KK.' + gap + '.KK.'] };
  }
  // One lens in profile, with the arm going back over the head (the buddies in profile face right).
  const w = a.w ?? 2, x = a.x ?? 0;
  const lensW = w + 2;
  return { x: x - 4, y: a.row, rows: ['KKK' + 'K'.repeat(lensW), '...' + 'KW' + 'K'.repeat(lensW - 2), '....' + 'K'.repeat(lensW - 2)] };
}

/** The pixel layers for what a buddy is wearing, drawn in COSMETIC_PAL. Rows can start above the buddy (negative y). */
export function cosmeticLayers(kind: MascotKind, wear: readonly string[]): CosmeticLayer[] {
  const a = ANCHORS[kind];
  if (!a) return [];
  const out: CosmeticLayer[] = [];
  if (wear.includes('tie')) out.push({ x: Math.round(a.neck.c - 1.5), y: a.neck.y, rows: TIE });
  if (wear.includes('sunglasses')) out.push(shades(a.eyes));
  for (const id of ['cowboy', 'propeller']) {
    if (!wear.includes(id)) continue;
    const rows = HATS[id];
    const x = Math.round(a.hat.c - (rows[0].length - 1) / 2), y = a.hat.y - rows.length + 2;
    if (id === 'propeller') {
      // The propeller spins: its two blades swap colors, back and forth.
      out.push({ x, y, rows: [rows[0]], cls: 'type-a' }, { x, y, rows: [rows[0].split('').reverse().join('')], cls: 'type-b' }, { x, y: y + 1, rows: rows.slice(1) });
    } else out.push({ x, y, rows });
  }
  return out;
}

/** Wearing `id` takes off whatever else was in its slot. */
export function wearing(wear: readonly string[], id: string, on: boolean): string[] {
  const item = COSMETICS.find((c) => c.id === id);
  if (!item) return [...wear];
  const rest = wear.filter((w) => w !== id && COSMETICS.find((c) => c.id === w)?.slot !== item.slot);
  return on ? [...rest, id] : wear.filter((w) => w !== id);
}

/** Bought cosmetics, as known ids in shop order, whatever came back from storage or another device. */
export function cleanOwned(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return COSMETICS.map((c) => c.id).filter((id) => v.includes(id));
}

/** What's worn: owned items only (when `owned` is given), one per slot. */
export function cleanWear(v: unknown, owned?: readonly string[]): string[] {
  if (!Array.isArray(v)) return [];
  let out: string[] = [];
  for (const id of v) if (typeof id === 'string' && (!owned || owned.includes(id))) out = wearing(out, id, true);
  return out;
}
