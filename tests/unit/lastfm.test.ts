import { describe, expect, it } from 'vitest';
import { cleanLastfmUser, lastfmError, toLastfmPlayback } from '@/lib/lastfm-core';

const track = (extra: Record<string, unknown>) => ({
  name: 'Gator Groove', artist: { '#text': 'The Swamp Band' }, album: { '#text': 'Swamp Sessions' }, url: 'https://www.last.fm/x',
  image: [{ size: 'small', '#text': 's.png' }, { size: 'large', '#text': 'l.png' }, { size: 'extralarge', '#text': 'xl.png' }], ...extra,
});

describe('Last.fm now playing', () => {
  it('reads the newest track and whether it is playing now', () => {
    const p = toLastfmPlayback({ recenttracks: { track: [track({ '@attr': { nowplaying: 'true' } }), track({ name: 'Older' })] } }, 5);
    expect(p).toEqual({ title: 'Gator Groove', artist: 'The Swamp Band', album: 'Swamp Sessions', art: 'xl.png', url: 'https://www.last.fm/x', device: '', isPlaying: true, progressMs: 0, durationMs: 0, at: 5 });
  });

  it('a single track (not a list) and a past play both work; the grey star is not album art', () => {
    const star = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
    const p = toLastfmPlayback({ recenttracks: { track: track({ image: [{ size: 'extralarge', '#text': star }] }) } });
    expect(p?.isPlaying).toBe(false);
    expect(p?.art).toBe('');
  });

  it('nothing played yet or a strange reply gives nothing', () => {
    expect(toLastfmPlayback({ recenttracks: { track: [] } })).toBeNull();
    expect(toLastfmPlayback(null)).toBeNull();
    expect(toLastfmPlayback({ error: 6 })).toBeNull();
  });

  it('checks usernames and maps Last.fm errors', () => {
    expect(cleanLastfmUser(' gatorfan_99 ')).toBe('gatorfan_99');
    for (const bad of ['', 'a', '9lives', 'has space', 'x'.repeat(16), 'a/b', 42]) expect(cleanLastfmUser(bad)).toBe('');
    expect(lastfmError(6)).toEqual({ code: 'no_user', status: 404 });
    expect(lastfmError(17)).toEqual({ code: 'private', status: 403 });
    expect(lastfmError(29).code).toBe('rate_limited');
    expect(lastfmError(10).code).toBe('bad_key');
    expect(lastfmError(undefined).code).toBe('upstream_error');
  });
});
