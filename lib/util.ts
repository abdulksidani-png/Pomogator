export const MIN = 60_000;

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const todayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Small stable string hash (djb2), used to tell whether the study context changed. */
export function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function shuffle<T>(a: readonly T[], rand: () => number = Math.random): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** mm:ss, rounding up so the display never shows 00:00 while time is left. */
export function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fill `over` into the shape of `base`, keeping base values where `over` is missing or the wrong type. */
export function mergeDeep<T>(base: T, over: unknown): T {
  if (isPlain(base)) {
    const out: Plain = {};
    const o = isPlain(over) ? over : {};
    for (const k of Object.keys(base)) out[k] = mergeDeep((base as Plain)[k], o[k]);
    return out as T;
  }
  return over === undefined || over === null || typeof over !== typeof base ? base : (over as T);
}
