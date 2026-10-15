import { describe, expect, it } from 'vitest';
import { effective, pressed } from '@/lib/collab-core';
import type { CollabTimer } from '@/lib/types';

const M = 60_000;
const T0 = 1_000_000;
const idle: CollabTimer = { phase: 'study', status: 'idle', round: 1 };

describe('the shared timer', () => {
  it('a study session runs, then everyone gets the same agreed break, then the next round waits', () => {
    const run = pressed(idle, 'start', T0, 30, 7, 'ana')!;
    expect(run).toEqual({ phase: 'study', status: 'running', endAt: T0 + 30 * M, round: 1, by: 'ana' });
    expect(effective(run, T0 + 10 * M, 7).phase).toBe('study');
    // Study ends: the break starts at that moment for everybody, whatever anyone scored.
    expect(effective(run, T0 + 31 * M, 7)).toMatchObject({ phase: 'break', status: 'running', endAt: T0 + 37 * M, round: 1 });
    // Break over: the next session is ready, round 2.
    expect(effective(run, T0 + 38 * M, 7)).toEqual({ phase: 'study', status: 'idle', round: 2 });
  });

  it('pause and resume keep the time left; +5 min and finish-now work for the whole group', () => {
    const run = pressed(idle, 'start', T0, 25, 5, 'ana')!;
    const paused = pressed(run, 'pause', T0 + 10 * M, 25, 5, 'bo')!;
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 15 * M, by: 'bo' });
    expect(effective(paused, T0 + 60 * M, 5).status).toBe('paused'); // a paused timer doesn't run out
    const resumed = pressed(paused, 'start', T0 + 20 * M, 25, 5, 'ana')!;
    expect(resumed.endAt).toBe(T0 + 35 * M);
    expect(pressed(resumed, 'addFive', T0 + 21 * M, 25, 5, 'ana')!.endAt).toBe(T0 + 40 * M);
    const done = pressed(resumed, 'finish', T0 + 22 * M, 25, 5, 'bo')!;
    expect(done).toMatchObject({ phase: 'break', status: 'running', endAt: T0 + 27 * M });
    expect(pressed(done, 'skipBreak', T0 + 23 * M, 25, 5, 'ana')).toMatchObject({ phase: 'study', status: 'idle', round: 2 });
  });

  it('presses that make no sense do nothing', () => {
    expect(pressed(idle, 'pause', T0, 25, 5, 'a')).toBeNull();
    expect(pressed(idle, 'finish', T0, 25, 5, 'a')).toBeNull();
    expect(pressed(idle, 'skipBreak', T0, 25, 5, 'a')).toBeNull();
    const run = pressed(idle, 'start', T0, 25, 5, 'a')!;
    expect(pressed(run, 'start', T0 + M, 25, 5, 'a')).toBeNull();
    // Pressing start after the session already ran out acts on the break that is now running.
    expect(pressed(run, 'pause', T0 + 26 * M, 25, 5, 'a')).toMatchObject({ phase: 'break', status: 'paused', remainingMs: 4 * M });
  });

  it('a missing or odd state from storage reads as a fresh, idle round', () => {
    expect(effective({} as CollabTimer, T0, 5)).toEqual({ phase: 'study', status: 'idle', round: 1 });
  });
});
