/**
 * Cosmetics for the study buddies, bought with study points. Each one is 2-bit pixel art like the buddies,
 * drawn on top of whichever buddy you pick: every buddy has anchor points for a hat, the eyes and the neck.
 * One item per slot can be worn at a time.
 */
import type { MascotKind } from './types';

export type Slot = 'hat' | 'eyes' | 'neck';
/** `code`: one letter, so a whole outfit fits in the 20-character buddy field friends read (see encodeBuddy). */
export interface Cosmetic { id: string; name: string; slot: Slot; price: number; blurb: string; code: string }

export const COSMETICS: Cosmetic[] = [
  { id: 'sunglasses', name: 'Sunglasses', slot: 'eyes', price: 60, blurb: 'Too cool for cramming.', code: 's' },
  { id: 'tie', name: 'Tie', slot: 'neck', price: 80, blurb: 'Dressed for the exam.', code: 't' },
  { id: 'cowboy', name: 'Cowboy hat', slot: 'hat', price: 120, blurb: 'Wrangle those flashcards.', code: 'c' },
  { id: 'propeller', name: 'Propeller hat', slot: 'hat', price: 150, blurb: 'Spins up while you study.', code: 'p' },
];

/** Colors for cosmetics (their own letters, separate from each buddy's palette). */
export const COSMETIC_PAL: Record<string, string> = {
  K: '#1A1A1A', W: '#FFFFFF', A: '#3B4A5A',
  T: '#D93A3A', U: '#A32626',
  B: '#9A6332', O: '#C48A4F', N: '#5A3519',
  // The propeller cap: yellow, red and blue panels, a green brim, navy blades on a yellow hub.
  Y: '#F5C518', R: '#D9262C', L: '#2350C8', G: '#179A5B', V: '#17224F',
};

interface Hat {
  /** Front view; the last row sits on the top of the head. */
  rows: string[];
  /** Side view for the buddies drawn in profile (facing right), if it differs. */
  side?: string[];
  /** Two frames of a spinning propeller, drawn above the first row. */
  blades?: [string, string];
}

/** Hats are centered on the head by their first 14 columns (a side view's brim may stick out to the right). */
const HAT_W = 14;
const HATS: Record<string, Hat> = {
  cowboy: {
    rows: [
      '....KKKKKK....',
      '...KBBOBBBK...',
      '...KBBBBBBK...',
      'K..KNNNNNNK..K',
      'KBBBBBBBBBBBBK',
      '.KKKKKKKKKKKK.',
    ],
  },
  // A ball cap with a propeller on top: yellow and red at the front, blue at the sides, a green brim.
  propeller: {
    blades: ['VVVVVVYYVVVVVV', '.....VYYV.....'],
    rows: [
      '......YY......',
      '....KKKKKK....',
      '..KLYYYRRRLK..',
      '.KLYYYYRRRRLK.',
      'KGGGGGGGGGGGGK',
      '.KKKKKKKKKKKK.',
    ],
    side: [
      '......YY.........',
      '....KKKKKK.......',
      '..KLLYYYRRK......',
      '.KLLYYYYRRRK.....',
      '.KLLYYYYRRRKKKK..',
      '.KKKKKKKKKKGGGGK.',
      '...........KKKK..',
    ],
  },
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
  ibis: { hat: { c: 10.5, y: 4 }, eyes: { row: 6, x: 13, w: 1 }, neck: { c: 10.5, y: 13 } },
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
  const profile = a.eyes.x !== undefined;
  for (const id of Object.keys(HATS)) {
    if (!wear.includes(id)) continue;
    const hat = HATS[id];
    const rows = (profile && hat.side) || hat.rows;
    const x = Math.round(a.hat.c - (HAT_W - 1) / 2), y = a.hat.y - rows.length + 2;
    out.push({ x, y, rows });
    // The propeller spins: long blades, then short ones seen edge-on, back and forth.
    if (hat.blades) out.push({ x, y: y - 1, rows: [hat.blades[0]], cls: 'type-a' }, { x, y: y - 1, rows: [hat.blades[1]], cls: 'type-b' });
  }
  return out;
}

export const slotOf = (id: string): Slot | undefined => COSMETICS.find((c) => c.id === id)?.slot;

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

const KINDS: MascotKind[] = ['gorilla', 'gator', 'panther', 'bulldog', 'ibis'];

/** A buddy and its outfit as one short string for friends to see, e.g. "ibis.ps" (≤ 20 characters, no migration needed). */
export function encodeBuddy(kind: MascotKind, wear: readonly string[]): string {
  const codes = COSMETICS.filter((c) => wear.includes(c.id)).map((c) => c.code).join('');
  return codes ? `${kind}.${codes}` : kind;
}

/** Read a friend's buddy string back: an unknown buddy shows as Albert, unknown letters are ignored. */
export function decodeBuddy(v: unknown): { kind: MascotKind; wear: string[] } {
  const [k, codes = ''] = String(v ?? '').split('.');
  const kind = KINDS.includes(k as MascotKind) ? (k as MascotKind) : 'gator';
  return { kind, wear: cleanWear([...codes].map((ch) => COSMETICS.find((c) => c.code === ch)?.id)) };
}

/** A saved look for the buddy: which buddy, and what it wears. */
export interface Outfit { name: string; kind: MascotKind; wear: string[] }
export const MAX_OUTFITS = 12;

/** Save (or replace, by name) an outfit. The newest is first; past 12, the oldest goes. */
export function saveOutfit(list: readonly Outfit[], name: string, kind: MascotKind, wear: readonly string[]): Outfit[] {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!n) return [...list];
  const rest = list.filter((o) => o.name.toLowerCase() !== n.toLowerCase());
  return [{ name: n, kind, wear: cleanWear(wear) }, ...rest].slice(0, MAX_OUTFITS);
}

export function cleanOutfits(v: unknown): Outfit[] {
  if (!Array.isArray(v)) return [];
  const out: Outfit[] = [];
  for (const o of v) {
    if (!o || typeof o !== 'object' || typeof o.name !== 'string' || !o.name.trim()) continue;
    if (out.some((x) => x.name.toLowerCase() === o.name.trim().toLowerCase())) continue;
    out.push({ name: o.name.trim().slice(0, 24), kind: KINDS.includes(o.kind) ? o.kind : 'gator', wear: cleanWear(o.wear) });
  }
  return out.slice(0, MAX_OUTFITS);
}
