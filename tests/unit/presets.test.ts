import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { activePreset, applyPreset, describePreset, presetValues, savePreset, snapshot, MAX_PRESETS } from '@/lib/presets';
import type { Settings, TimerPreset } from '@/lib/types';

const base = (): Settings => structuredClone(DEFAULT_SETTINGS);

describe('saved timers', () => {
  it('saves the look and the lengths, and nothing else', () => {
    const s = { ...base(), skin: 'panther', clockFont: 'mono', mascotKind: 'panther', mascot: 'on', studyMin: 45, chime: 'gong', questions: 1 } as Settings;
    const { list, preset } = savePreset([], '  Late   night  ', s);
    expect(list).toHaveLength(1);
    expect(preset.name).toBe('Late night');
    expect(preset.values).toMatchObject({ skin: 'panther', clockFont: 'mono', mascotKind: 'panther', studyMin: 45 });
    expect(preset.values).not.toHaveProperty('chime');
    expect(preset.values).not.toHaveProperty('questions');
  });

  it('brings a saved timer back and recognizes it', () => {
    const s = { ...base(), skin: 'jungle', timerStyle: 'ring', mascotKind: 'gorilla', studyMin: 30 } as Settings;
    const { list } = savePreset([], 'Jungle', s);
    const now = base();
    expect(activePreset(list, now)).toBeUndefined();
    applyPreset(now, list[0]);
    expect(now).toMatchObject({ skin: 'jungle', timerStyle: 'ring', mascotKind: 'gorilla', studyMin: 30 });
    expect(activePreset(list, now)?.name).toBe('Jungle');
    now.studyMin = 25;
    expect(activePreset(list, now)).toBeUndefined();
  });

  it('replaces a timer saved under the same name and keeps the list short', () => {
    let list: TimerPreset[] = [];
    list = savePreset(list, 'Cram', { ...base(), studyMin: 45 }).list;
    const id = list[0].id;
    list = savePreset(list, 'cram', { ...base(), studyMin: 50 }).list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: 'cram' });
    expect(list[0].values.studyMin).toBe(50);
    for (let i = 0; i < MAX_PRESETS + 3; i++) list = savePreset(list, `T${i}`, base()).list;
    expect(list).toHaveLength(MAX_PRESETS);
    expect(list.at(-1)?.name).toBe(`T${MAX_PRESETS + 2}`);
  });

  it('copes with a saved timer from an older version or a broken sync', () => {
    const odd = { id: 'x', name: 'Odd', values: { studyMin: 'lots', skin: 'gator', tiers: { short: { max: 20 } } } } as unknown as TimerPreset;
    const v = presetValues(odd);
    expect(v.studyMin).toBe(DEFAULT_SETTINGS.studyMin);
    expect(v.skin).toBe('gator');
    expect(v.tiers.short).toEqual({ ...DEFAULT_SETTINGS.tiers.short, max: 20 });
    expect(v.clockFont).toBe(DEFAULT_SETTINGS.clockFont);
  });

  it('describes a saved timer in a few words', () => {
    const v = snapshot({ ...base(), studyMin: 45, skin: 'panther', clockFont: 'mono', timerStyle: 'ring', mascotKind: 'panther', mascot: 'on' } as Settings);
    expect(describePreset(v)).toBe('45 min · Panther · Mono · Ring · Panfer');
    expect(describePreset(snapshot(base()))).toBe('25 min · Match system · Albert');
    expect(describePreset(snapshot({ ...base(), mascot: 'auto', mascotKind: 'tomato' } as Settings))).toBe('25 min · Match system · No buddy');
    expect(describePreset(snapshot({ ...base(), skin: 'tomato', mascotKind: 'tomato' } as Settings))).toBe('25 min · Tomato buddy · Tomato');
  });
});
