/**
 * Saved timers: a named snapshot of how the timer looks and runs (theme, colors, clock font, timer style,
 * study buddy, background, session and break lengths). They live in settings, so they sync like the rest.
 * Pure functions only, so they can be tested without the store.
 */
import { DEFAULT_SETTINGS } from './defaults';
import { CLOCK_FONTS, MASCOTS, THEMES, TIMER_STYLES } from './appearance';
import { mergeDeep, uid } from './util';
import type { Settings, TimerPreset } from './types';

/** What a saved timer remembers. Everything else (sounds, quiz, account) stays as it is. */
export const PRESET_KEYS = [
  'studyMin', 'longEvery', 'tiers',
  'skin', 'accent', 'clockFont', 'timerStyle', 'mascot', 'mascotKind',
  'background', 'bgPhoto', 'bgDim', 'bgDaily', 'cardStyle', 'corners', 'density',
] as const satisfies readonly (keyof Settings)[];

export type PresetKey = (typeof PRESET_KEYS)[number];
export type PresetValues = Pick<Settings, PresetKey>;

export const MAX_PRESETS = 12;
export const MAX_NAME = 40;

export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** The current setup, ready to save. */
export function snapshot(s: Settings): PresetValues {
  const out = {} as Record<PresetKey, unknown>;
  for (const k of PRESET_KEYS) out[k] = structuredClone(s[k]);
  return out as PresetValues;
}

/** A saved timer's values in the right shape, whatever came back from storage or another device. */
export function presetValues(p: TimerPreset): PresetValues {
  const v = (p.values ?? {}) as Record<string, unknown>;
  const out = {} as Record<PresetKey, unknown>;
  for (const k of PRESET_KEYS) out[k] = mergeDeep(DEFAULT_SETTINGS[k], v[k] ?? DEFAULT_SETTINGS[k]);
  return out as PresetValues;
}

/** Put a saved timer's values into settings (an immer draft or a plain copy). */
export function applyPreset(s: Settings, p: TimerPreset) {
  Object.assign(s, structuredClone(presetValues(p)));
}

/** Save the current setup under a name. The same name (any case) replaces the older one; the list stays short. */
export function savePreset(list: TimerPreset[], name: string, s: Settings): { list: TimerPreset[]; preset: TimerPreset } {
  const n = cleanName(name);
  const same = list.find((p) => p.name.toLowerCase() === n.toLowerCase());
  const preset: TimerPreset = { id: same?.id ?? uid(), name: n, values: snapshot(s) };
  const rest = list.filter((p) => p !== same);
  return { list: [...rest, preset].slice(-MAX_PRESETS), preset };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The saved timer that matches the current setup exactly, if any. */
export function activePreset(list: TimerPreset[], s: Settings): TimerPreset | undefined {
  return list.find((p) => {
    const v = presetValues(p);
    return PRESET_KEYS.every((k) => same(v[k], s[k]));
  });
}

/** "45 min · Panther · Mono · Panfer": what a saved timer holds, in a few words. */
export function describePreset(v: PresetValues): string {
  const theme = THEMES.find((t) => t.id === v.skin)?.name ?? 'Theme';
  const font = v.clockFont === 'theme' ? '' : CLOCK_FONTS.find((f) => f.id === v.clockFont)?.name ?? '';
  const style = v.timerStyle === 'classic' ? '' : TIMER_STYLES.find((t) => t.id === v.timerStyle)?.name ?? '';
  const hidden = v.mascot === 'off' || (v.mascot === 'auto' && v.mascotKind === 'tomato' && v.skin !== 'tomato');
  const buddy = hidden ? 'No buddy' : MASCOTS.find((m) => m.id === v.mascotKind)?.name ?? '';
  const photo = v.background === 'unsplash' || v.background === 'image' ? 'Photo' : '';
  return [`${v.studyMin} min`, theme, font, style, photo, buddy].filter(Boolean).join(' · ');
}
