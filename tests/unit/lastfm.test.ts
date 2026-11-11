import { describe, expect, it } from 'vitest';
import { PAUSE_MS, cleanLastfmUser, lastfmError, timeAgo, toLastfmPlayback, withPause } from '@/lib/lastfm-core';

const track = (extra: Record<string, unknown>) => ({
  name: 'Gator Groove', artist: { '#text': 'The Swamp Band' }, album: { '#text': 'Swamp Sessions' }, url: 'https://www.last.fm/x',
  image: [{ size: 'small', '#text': 's.png' }, { size: 'large', '#text': 'l.png' }, { size: 'extralarge', '#text': 'xl.png' }], ...extra,
});

describe('Last.fm now playing', () => {
  it('reads the newest track and whether it is playing now', () => {
    const p = toLastfmPlayback({ recenttracks: { track: [track({ '@attr': { nowplaying: 'true' } }), track({ name: 'Older' })] } }, 5);
    expect(p).toEqual({ title: 'Gator Groove', artist: 'The Swamp Band', album: 'Swamp Sessions', art: 'xl.png', url: 'https://www.last.fm/x', isPlaying: true, at: 5 });
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

describe('pausing a song', () => {
  const song = (title: string, extra: Record<string, unknown> = {}) => toLastfmPlayback({ recenttracks: { track: track({ name: title, ...extra }) } }, 0)!;
  const playing = (title: string) => song(title, { '@attr': { nowplaying: 'true' } });

  it('reads when a past song was played', () => {
    expect(song('Old', { date: { uts: '1760000000' } }).playedAt).toBe(1760000000_000);
    expect(playing('Now').playedAt).toBeUndefined();
  });

  it('keeps showing the song that was playing, as paused, instead of an older scrobble', () => {
    const now = 1_000_000;
    const a = withPause(null, { ...playing('Gator Groove'), at: now }, now);
    expect(a.show?.isPlaying).toBe(true);
    // Paused: Last.fm no longer says "playing", and its newest scrobble is an older song.
    const b = withPause(a.held, { ...song('Older Song'), at: now + 20_000 }, now + 20_000);
    expect(b.show).toMatchObject({ title: 'Gator Groove', isPlaying: false, paused: true });
    expect(b.held?.title).toBe('Gator Groove');
  });

  it('shows Last.fm\'s own answer once the song was saved, after a long pause, or on a fresh page', () => {
    const now = 1_000_000;
    const held = { ...playing('Gator Groove'), at: now };
    const saved = withPause(held, { ...song('Gator Groove'), at: now + 1000 }, now + 1000);
    expect(saved.show?.title).toBe('Gator Groove');
    expect(saved.show?.paused).toBeUndefined();
    expect(saved.held).toBeNull();
    const late = now + PAUSE_MS + 1;
    expect(withPause(held, { ...song('Older Song'), at: late }, late).show?.title).toBe('Older Song');
    expect(withPause(null, song('Older Song'), now).show?.title).toBe('Older Song');
    expect(withPause(null, null, now).show).toBeNull();
  });

  it('says how long ago in plain words', () => {
    const n = 10_000_000_000;
    expect(timeAgo(n - 20_000, n)).toBe('just now');
    expect(timeAgo(n - 5 * 60_000, n)).toBe('5 min ago');
    expect(timeAgo(n - 60 * 60_000, n)).toBe('1 hour ago');
    expect(timeAgo(n - 3 * 3600_000, n)).toBe('3 hours ago');
    expect(timeAgo(n - 2 * 86400_000, n)).toBe('2 days ago');
  });
});
