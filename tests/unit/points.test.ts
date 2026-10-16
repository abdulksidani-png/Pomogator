import { describe, expect, it } from 'vitest';
import { checkinPointsByDay, pointsSummary, sessionPoints, streakMultiplier } from '@/lib/points';

describe('study points', () => {
  it('pays 10 a check-in, with a streak bonus that tops out at +50%', () => {
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(3)).toBeCloseTo(1.2);
    expect(streakMultiplier(30)).toBe(1.5);
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'];
    const p = checkinPointsByDay(days);
    expect([...p.values()]).toEqual([10, 11, 12, 10]); // the gap on the 4th starts the streak over
  });

  it('counts each day once, whatever order or duplicates come in', () => {
    const p = checkinPointsByDay(['2026-10-02', '2026-10-01', '2026-10-02']);
    expect(p.size).toBe(2);
    expect(p.get('2026-10-02')).toBe(11);
  });

  it('lets a streak freeze carry the bonus over a missed day', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`).concat('2026-10-09');
    expect(checkinPointsByDay(days, false).get('2026-10-09')).toBe(10);
    expect(checkinPointsByDay(days, true).get('2026-10-09')).toBe(15); // day 8 of the streak
  });

  it('pays for long sessions studied without skipping', () => {
    expect(sessionPoints({ studiedMin: 25, plannedMin: 25 })).toBe(5);
    expect(sessionPoints({ studiedMin: 45, plannedMin: 45 })).toBe(14); // 9 + 5 bonus
    expect(sessionPoints({ studiedMin: 15, plannedMin: 15 })).toBe(0); // too short
    expect(sessionPoints({ studiedMin: 20, plannedMin: 45 })).toBe(0); // stopped early
    expect(sessionPoints({ studiedMin: undefined, plannedMin: 25 } as never)).toBe(0);
  });

  it('subtracts what was bought and never goes below zero', () => {
    const s = pointsSummary({ checkins: ['2026-10-01'], history: [{ studiedMin: 50, plannedMin: 50 }], owned: ['sunglasses'], bank: 40 });
    expect(s).toEqual({ earned: 10 + 15 + 40, spent: 60, balance: 5, fromCheckins: 10, fromStudy: 55 });
    expect(pointsSummary({ checkins: [], history: [], owned: ['propeller'] }).balance).toBe(0);
  });
});
