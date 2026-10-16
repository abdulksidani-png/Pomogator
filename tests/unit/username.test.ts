import { describe, expect, it } from 'vitest';
import { cleanUsername } from '@/lib/username';

describe('usernames', () => {
  it('keeps real names and handles, tidied up', () => {
    expect(cleanUsername('  Abdul   S ')).toBe('Abdul S');
    expect(cleanUsername("gator_fan.99")).toBe('gator_fan.99');
    expect(cleanUsername("O'Neil-Ruiz")).toBe("O'Neil-Ruiz");
    expect(cleanUsername('José')).toBe('José');
  });
  it('refuses emails, links, too short or too long', () => {
    for (const bad of ['', 'a', 'me@school.edu', 'https://x.y', 'x'.repeat(21), '<b>hi</b>', null, 42]) expect(cleanUsername(bad)).toBe('');
  });
});
