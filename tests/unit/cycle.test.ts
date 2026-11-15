import { describe, expect, it } from 'vitest';
import { awayLong, cleanCycleHours, cycleDoneFor, lastActiveAt } from '@/lib/cycle';
import { tierChips, tierGroups, tierRows } from '@/lib/breaks';
import type { Tier } from '@/lib/types';

const H = 3_600_000;
const tier: Tier = { max: 15, mid: 10, min: 5, none: 5 };

describe('the study cycle starts over after time away', () => {
  const now = 100 * H;

  it('resets after the chosen number of hours, not before', () => {
    expect(awayLong({ last: now - 3 * H, hours: 4, now, hasState: true })).toBe(false);
    expect(awayLong({ last: now - 4 * H, hours: 4, now, hasState: true })).toBe(true);
    expect(awayLong({ last: now - 20 * H, hours: 8, now, hasState: true })).toBe(true); // yesterday evening
  });

  it('never resets when set to never, or when there is nothing to start over from', () => {
    expect(awayLong({ last: now - 99 * H, hours: 0, now, hasState: true })).toBe(false);
    expect(awayLong({ last: now - 99 * H, hours: 4, now, hasState: false })).toBe(false);
  });

  it('with no record of when they were last here, a counted cycle is treated as old', () => {
    expect(awayLong({ last: 0, hours: 4, now, hasState: true })).toBe(true);
  });

  it('the last activity is the later of the timer stamp and the newest finished session', () => {
    expect(lastActiveAt(50, [{ endedAt: 10 }, { endedAt: 70 }, {}])).toBe(70);
    expect(lastActiveAt(90, [{ endedAt: 70 }])).toBe(90);
    expect(lastActiveAt(undefined, [])).toBe(0);
  });

  it('keeps the setting to the offered choices', () => {
    expect(cleanCycleHours(8)).toBe(8);
    expect(cleanCycleHours(0)).toBe(0);
    expect(cleanCycleHours(5)).toBe(4);
    expect(cleanCycleHours('x')).toBe(4);
  });

  it('turns a picked session into a count, inside the cycle', () => {
    expect(cycleDoneFor(1, 4)).toBe(0);
    expect(cycleDoneFor(3, 4)).toBe(2);
    expect(cycleDoneFor(4, 4)).toBe(3); // the last session of the cycle: a long break comes next
    expect(cycleDoneFor(9, 4)).toBe(3);
    expect(cycleDoneFor(0, 4)).toBe(0);
  });
});

describe('breaks for a longer quiz', () => {
  it('earn the same share-based break whatever the length', () => {
    expect(tierRows(10, tier).map((r) => r.mins)).toEqual([15, 10, 10, 10, 10, 10, 5, 5, 5, 5, 5]);
    expect(tierRows(6, tier).map((r) => r.mins)).toEqual([15, 10, 10, 10, 5, 5, 5]);
  });

  it('are grouped so the chips stay short', () => {
    expect(tierGroups(10, tier)).toEqual([{ label: '10/10', mins: 15 }, { label: '5–9/10', mins: 10 }, { label: '0–4/10', mins: 5 }]);
    expect(tierGroups(6, tier)).toEqual([{ label: '6/6', mins: 15 }, { label: '3–5/6', mins: 10 }, { label: '0–2/6', mins: 5 }]);
  });

  it('keep every score for a short quiz', () => {
    expect(tierChips(3, tier)).toEqual([{ label: '3/3', mins: 15 }, { label: '2/3', mins: 10 }, { label: '1/3', mins: 5 }, { label: '0/3', mins: 5 }]);
    expect(tierChips(1, tier)).toEqual([{ label: '1/1', mins: 15 }, { label: '0/1', mins: 5 }]);
  });
});
