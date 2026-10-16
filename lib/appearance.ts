import type { Background, ClockFont, Corners, MascotKind, Settings, Skin, TimerStyle } from './types';
import { photoUrl } from './unsplash';

export interface ThemeInfo { id: Skin; name: string; dark: boolean; colors: [bg: string, card: string, accent: string, second: string]; buddy?: MascotKind }

export const THEMES: ThemeInfo[] = [
  { id: 'auto', name: 'Match system', dark: false, colors: ['#F3F5FA', '#1B2622', '#2F4BC8', '#F0D26A'] },
  { id: 'notebook', name: 'Notebook', dark: false, colors: ['#F3F5FA', '#FFFFFF', '#2F4BC8', '#DB5368'] },
  { id: 'chalkboard', name: 'Chalkboard', dark: true, colors: ['#131C19', '#1B2622', '#F0D26A', '#F2938F'] },
  { id: 'tomato', name: 'Tomato buddy', dark: false, colors: ['#FFF0EC', '#FFFFFF', '#D63A43', '#3E9A5E'], buddy: 'tomato' },
  { id: 'midnight', name: 'Midnight', dark: true, colors: ['#0F1324', '#171C33', '#8EA2FF', '#FF8FB1'] },
  { id: 'sakura', name: 'Sakura', dark: false, colors: ['#FFF5F8', '#FFFFFF', '#B83C7A', '#6E9E7A'] },
  { id: 'matcha', name: 'Matcha', dark: false, colors: ['#F2F5EC', '#FFFFFF', '#3F7D3A', '#C2703D'] },
  { id: 'sunset', name: 'Lofi sunset', dark: true, colors: ['#1E1424', '#2A1C30', '#FF9E6B', '#7FD6C2'] },
  // A theme for each study buddy; picking one brings its buddy along.
  { id: 'jungle', name: 'Jungle', dark: true, colors: ['#0F2418', '#173322', '#F2C14E', '#7BC86C'], buddy: 'gorilla' },
  { id: 'gator', name: 'Gator', dark: true, colors: ['#0021A5', '#0B1F70', '#FA4616', '#FFFFFF'], buddy: 'gator' },
  { id: 'panther', name: 'Panther', dark: true, colors: ['#081E3F', '#0F2A55', '#D9A53A', '#7FA6E8'], buddy: 'panther' },
  { id: 'robotlab', name: 'Robot lab', dark: true, colors: ['#0D1418', '#151F25', '#5CF2C9', '#FF7AB6'] },
];

export const ACCENTS = ['#2F4BC8', '#7C4DDB', '#B83C7A', '#D63A43', '#C2662D', '#A67C00', '#3F7D3A', '#0E7C86', '#3A82F7', '#5C6378'];

export const CLOCK_FONTS: { id: ClockFont; name: string; family?: string }[] = [
  { id: 'theme', name: 'Theme' },
  { id: 'mono', name: 'Mono', family: '"Martian Mono Variable", monospace' },
  { id: 'rounded', name: 'Rounded', family: '"Fredoka Variable", sans-serif' },
  { id: 'serif', name: 'Serif', family: '"DM Serif Display", serif' },
  { id: 'condensed', name: 'Tall', family: '"Bebas Neue", sans-serif' },
  { id: 'digital', name: 'Digital', family: '"Orbitron Variable", sans-serif' },
  { id: 'hand', name: 'Handwritten', family: '"Caveat Variable", cursive' },
];

export const TIMER_STYLES: { id: TimerStyle; name: string; hint: string }[] = [
  { id: 'classic', name: 'Classic', hint: 'Big digits and a minute ruler' },
  { id: 'ring', name: 'Ring', hint: 'Digits inside a progress ring' },
  { id: 'minimal', name: 'Minimal', hint: 'Just the time' },
];

export const BACKGROUNDS: { id: Background; name: string }[] = [
  { id: 'theme', name: 'Theme' },
  { id: 'plain', name: 'Plain' },
  { id: 'dots', name: 'Dots' },
  { id: 'grid', name: 'Grid paper' },
  { id: 'lined', name: 'Lined paper' },
  { id: 'gradient', name: 'Glow' },
  { id: 'image', name: 'Your photo' },
  { id: 'unsplash', name: 'Unsplash photo' },
];

/** Moods for photo backgrounds: a label and the words searched on Unsplash. */
export const PHOTO_MOODS: { name: string; query: string }[] = [
  { name: 'Cozy café', query: 'cozy cafe interior' },
  { name: 'Rainy window', query: 'rain on window' },
  { name: 'Library', query: 'library books' },
  { name: 'Forest', query: 'misty forest' },
  { name: 'Mountains', query: 'mountain landscape' },
  { name: 'Ocean', query: 'calm ocean' },
  { name: 'Night city', query: 'city lights night' },
  { name: 'Lofi desk', query: 'aesthetic desk setup' },
  { name: 'Space', query: 'night sky stars' },
  { name: 'Florida', query: 'florida palm sunset' },
];

export const MASCOTS: { id: MascotKind; name: string }[] = [
  { id: 'tomato', name: 'Tomato' },
  { id: 'gorilla', name: 'Arcade gorilla' },
  { id: 'gator', name: 'Albert' },
  { id: 'panther', name: 'Panfer' },
  { id: 'bulldog', name: 'Rocket' },
];

export const CORNERS: { id: Corners; name: string }[] = [
  { id: 'theme', name: 'Theme' }, { id: 'sharp', name: 'Sharp' }, { id: 'soft', name: 'Soft' }, { id: 'round', name: 'Round' },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Black or white text, whichever reads better on `hex`. */
export function onColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#141414' : '#FFFFFF';
}

const setAttr = (el: HTMLElement, name: string, value: string, fallback: string) => {
  if (value === fallback) delete el.dataset[name]; else el.dataset[name] = value;
};

/** Put the chosen look on the page. `bgUrl` is the photo background, if any. */
export function applyAppearance(s: Settings, bgUrl: string | null) {
  const el = document.documentElement;
  setAttr(el, 'skin', s.skin, 'auto');
  setAttr(el, 'clockfont', s.clockFont, 'theme');
  setAttr(el, 'corners', s.corners, 'theme');
  setAttr(el, 'density', s.density, 'comfortable');
  // "With its theme": the tomato shows in the Tomato theme; a buddy you picked yourself always shows.
  setAttr(el, 'mascot', s.mascot === 'auto' && s.mascotKind !== 'tomato' ? 'on' : s.mascot, 'auto');
  setAttr(el, 'timer', s.timerStyle, 'classic');
  setAttr(el, 'cards', s.cardStyle, 'solid');
  // Your photo and Unsplash photos share one look ("image"); without a photo, fall back to the theme.
  const photo = s.background === 'unsplash' ? (s.bgPhoto ? photoUrl(s.bgPhoto, 2400) : null) : s.background === 'image' ? bgUrl : null;
  const isPhoto = s.background === 'image' || s.background === 'unsplash';
  setAttr(el, 'bg', isPhoto ? (photo ? 'image' : 'theme') : s.background, 'theme');
  if (HEX.test(s.accent)) {
    el.style.setProperty('--accent', s.accent);
    el.style.setProperty('--accent-soft', `color-mix(in srgb, ${s.accent} 18%, var(--card))`);
    el.style.setProperty('--on-accent', onColor(s.accent));
  } else {
    for (const p of ['--accent', '--accent-soft', '--on-accent']) el.style.removeProperty(p);
  }
  if (photo) {
    el.style.setProperty('--bg-image', `url("${photo.replace(/"/g, '%22')}")`);
    el.style.setProperty('--bg-dim', String(Math.min(0.85, Math.max(0, s.bgDim))));
    if (s.background === 'unsplash' && s.bgPhoto) el.style.setProperty('--bg-photo-color', s.bgPhoto.color);
    else el.style.removeProperty('--bg-photo-color');
  } else {
    for (const p of ['--bg-image', '--bg-dim', '--bg-photo-color']) el.style.removeProperty(p);
  }
}
