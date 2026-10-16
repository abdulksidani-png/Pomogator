'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { siteConfig } from '@/lib/config';
import { connectSpotify, control, refreshPlayback, useSpotify, type Playback } from '@/lib/spotify';
import { refreshLastfm, useLastfm } from '@/lib/lastfm';
import { cleanLastfmUser } from '@/lib/lastfm-core';
import { Icon } from './Icon';
import { FoldCard } from './Panels';
import { SOFT, SPRING } from './motion';

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The "now playing" card. With Spotify connected on this device: album art, the song, a progress bar and
 * back / play-pause / next. Otherwise with a Last.fm username: the song and art (Last.fm can't control playback),
 * which works for everyone, since Spotify only lets 5 people use a development-mode app.
 */
export function MusicCard() {
  const show = useStudy((s) => s.settings.musicWidget);
  const lastfmUser = useStudy((s) => s.settings.lastfmUser);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastfmOn, setLastfmOn] = useState(false);
  const spotify = useSpotify();
  const lastfm = useLastfm();
  const { linked } = spotify;
  const source = linked ? 'spotify' : lastfmOn && lastfmUser ? 'lastfm' : null;
  const { playback, checked, error } = source === 'lastfm' ? lastfm : spotify;
  const { showToast, updateSettings } = useStudy.getState();

  useEffect(() => { void siteConfig().then((c) => { setClientId(c.spotifyClientId); setLastfmOn(c.lastfm); }); }, []);

  // Last.fm: check every 20 seconds while the page is visible (the server caches each answer for 15).
  useEffect(() => {
    if (source !== 'lastfm' || !show) return;
    void refreshLastfm(lastfmUser);
    const id = setInterval(() => { if (document.visibilityState === 'visible') void refreshLastfm(lastfmUser); }, 20_000);
    return () => clearInterval(id);
  }, [source, show, lastfmUser]);

  // Messages left in the address bar by the Spotify sign-in page.
  useEffect(() => {
    const url = new URL(window.location.href);
    const ok = url.searchParams.get('spotify'), bad = url.searchParams.get('spotify_error');
    if (!ok && !bad) return;
    url.searchParams.delete('spotify'); url.searchParams.delete('spotify_error');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    showToast(bad || 'Spotify connected');
  }, [showToast]);

  // Check what's playing every few seconds while the page is visible.
  useEffect(() => {
    if (!linked || !show) return;
    void refreshPlayback();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void refreshPlayback(); }, 5000);
    const back = () => { if (document.visibilityState === 'visible') void refreshPlayback(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', back); };
  }, [linked, show]);

  if (!show || (!clientId && !lastfmOn)) return null;

  if (!source) {
    return (
      <section className="card side-card music music-off" id="musicCard" aria-label="Music">
        <span className="music-badge" aria-hidden="true"><Icon name="music" /></span>
        <div className="music-off-text">
          <strong>Study with your music</strong>
          <span>{clientId ? 'See what\'s playing and skip songs without leaving the timer.' : 'Show what you\'re playing here and to your friends.'}</span>
        </div>
        <div className="music-off-actions">
          {clientId && <button className="btn btn-primary" type="button" onClick={() => { void connectSpotify(); }}>Connect Spotify</button>}
          <button className="btn-quiet" type="button" onClick={() => updateSettings((x) => { x.musicWidget = false; })}>Hide</button>
        </div>
        {lastfmOn && <LastfmForm primary={!clientId} />}
      </section>
    );
  }

  return (
    <FoldCard id="musicCard" fold="music" className="music" title="Music" label="Now playing"
      summary={playback ? `${playback.title.slice(0, 28)}${playback.title.length > 28 ? '…' : ''}` : undefined}>
      {playback?.art && <div className="music-glow" style={{ backgroundImage: `url("${playback.art}")` }} aria-hidden="true" />}
      <div className="music-row">
        <Disc p={playback} />
        <div className="music-info">
          <span className="music-label">{playback ? (playback.isPlaying ? <><Bars />Now playing</> : source === 'lastfm' ? 'Last played' : 'Paused') : source === 'lastfm' ? 'Last.fm' : 'Spotify'}</span>
          {playback ? (
            <>
              <motion.strong key={playback.title} className="music-title" title={playback.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>{playback.title}</motion.strong>
              <span className="music-artist" title={playback.artist}>{playback.artist}</span>
            </>
          ) : (
            <span className="music-artist">{!checked ? 'Checking…' : source === 'lastfm' ? 'Nothing yet. Songs show up once your music app is linked to Last.fm.' : 'Nothing playing. Start a song in Spotify on any device.'}</span>
          )}
        </div>
      </div>
      {playback && playback.durationMs > 0 && <Progress p={playback} />}
      {source === 'lastfm' ? (
        <p className="music-device music-lastfm">
          via Last.fm · {lastfmUser}
          {playback?.url && <a className="music-open" href={playback.url} target="_blank" rel="noreferrer" aria-label="Open on Last.fm" title="Open on Last.fm"><Icon name="external" /></a>}
        </p>
      ) : (<>
      <div className="music-controls">
        <motion.button className="icon-btn" type="button" aria-label="Previous song" onClick={() => void control('previous')} whileTap={{ scale: 0.88 }} transition={SPRING}><Icon name="prev" /></motion.button>
        <motion.button className="music-play" type="button" aria-label={playback?.isPlaying ? 'Pause music' : 'Play music'}
          onClick={() => void control(playback?.isPlaying ? 'pause' : 'play')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }} transition={SPRING}>
          <Icon name={playback?.isPlaying ? 'pause' : 'play'} />
        </motion.button>
        <motion.button className="icon-btn" type="button" aria-label="Next song" onClick={() => void control('next')} whileTap={{ scale: 0.88 }} transition={SPRING}><Icon name="next" /></motion.button>
        {playback?.url && <a className="music-open" href={playback.url} target="_blank" rel="noreferrer" aria-label="Open in Spotify" title="Open in Spotify"><Icon name="external" /></a>}
      </div>
      {playback?.device && <p className="music-device">Playing on {playback.device} · via Spotify</p>}
      </>)}
      {error && <p className="hint warn music-error" role="status">{error}</p>}
    </FoldCard>
  );
}

/** Type a Last.fm username to show what you play, with no Spotify sign-in (and no Spotify user limit). */
function LastfmForm({ primary }: { primary: boolean }) {
  const [open, setOpen] = useState(primary);
  const [name, setName] = useState('');
  const valid = !!cleanLastfmUser(name);
  if (!open) return <button className="btn-quiet music-lastfm-btn" type="button" onClick={() => setOpen(true)}>Use Last.fm instead</button>;
  return (
    <form className="music-lastfm-form" onSubmit={(e) => {
      e.preventDefault();
      if (!valid) return;
      useStudy.getState().updateSettings((x) => { x.lastfmUser = name.trim(); });
    }}>
      <label htmlFor="lastfmCardUser">Your Last.fm username<span className="sub">Link Spotify (or another music app) to Last.fm once, at <a href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer">last.fm → Settings → Applications</a>.</span></label>
      <span className="inline">
        <input id="lastfmCardUser" type="text" autoComplete="off" spellCheck={false} maxLength={15} value={name} onChange={(e) => setName(e.target.value)} placeholder="username" />
        <button className="btn" type="submit" disabled={!valid}>Use Last.fm</button>
      </span>
    </form>
  );
}

/** Album art on a little record that spins while the music plays. */
function Disc({ p }: { p: Playback | null }) {
  return (
    <div className={`music-disc${p?.isPlaying ? ' spinning' : ''}`} aria-hidden="true">
      {p?.art ? <img src={p.art} alt="" /> : <span className="music-disc-empty"><Icon name="music" /></span>}
      <span className="music-hole" />
    </div>
  );
}

function Bars() {
  return <span className="eq" aria-hidden="true"><i /><i /><i /></span>;
}

/** A progress bar that keeps moving between checks with Spotify. */
function Progress({ p }: { p: Playback }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!p.isPlaying) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [p.isPlaying]);
  const pos = Math.min(p.durationMs, p.progressMs + (p.isPlaying ? Math.max(0, now - p.at) : 0));
  const pct = p.durationMs ? (pos / p.durationMs) * 100 : 0;
  return (
    <div className="music-progress">
      <div className="music-bar" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="music-times"><span>{mmss(pos)}</span><span>{mmss(p.durationMs)}</span></div>
    </div>
  );
}
