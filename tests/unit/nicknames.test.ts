import { describe, expect, it } from 'vitest';
import { cleanNickname, cleanNicknames, shownName } from '@/lib/nicknames';

describe('friend nicknames', () => {
  it('tidies a nickname and keeps it short', () => {
    expect(cleanNickname('  Alex   (bio lab) ')).toBe('Alex (bio lab)');
    expect(cleanNickname('<b>x</b>')).toBe('bx/b');
    expect(cleanNickname('y'.repeat(40))).toHaveLength(24);
    expect(cleanNickname(5)).toBe('');
  });
  it('cleans the saved map and drops empty ones', () => {
    expect(cleanNicknames({ 'a1-b2': ' Sam ', bad$id: 'x', c3: '   ', d4: 7 })).toEqual({ 'a1-b2': 'Sam' });
    expect(cleanNicknames(null)).toEqual({});
  });
  it('shows the nickname when there is one, else their username', () => {
    const nicks = { u1: 'Alex (bio lab)' };
    expect(shownName(nicks, 'u1', 'Alex')).toBe('Alex (bio lab)');
    expect(shownName(nicks, 'u2', 'Alex')).toBe('Alex');
    expect(shownName(nicks, undefined, 'Alex')).toBe('Alex'); // before migration 6, messages have no sender id
  });
});
