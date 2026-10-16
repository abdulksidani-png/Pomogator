'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { siteConfig } from '@/lib/config';
import { connectSpotify, control, refreshPlayback, useSpotify, type Playback } from '@/lib/spotify';
import { Icon } from './Icon';
import { FoldCard } from './Panels';
import { SOFT, SPRING } from './motion';

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The "now playing" card: album art, the song, a progress bar and back / play-pause / next. */
export function MusicCard() {
  const show = useStudy((s) => s.settings.musicWidget);
  const [clientId, setClientId] = useState<string | null>(null);
  const { linked, playback, checked, error } = useSpotify();
  const { showToast, updateSettings } = useStudy.getState();

  useEffect(() => { void siteConfig().then((c) => setClientId(c.spotifyClientId)); }, []);

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

  if (!show || !clientId) return null;

  if (!linked) {
    return (
      <section className="card side-card music music-off" id="musicCard" aria-label="Music">
        <span className="music-badge" aria-hidden="true"><Icon name="music" /></span>
        <div className="music-off-text">
          <strong>Study with your music</strong>
          <span>See what&apos;s playing and skip songs without leaving the timer.</span>
        </div>
        <div className="music-off-actions">
          <button className="btn btn-primary" type="button" onClick={() => { void connectSpotify(); }}>Connect Spotify</button>
          <button className="btn-quiet" type="button" onClick={() => updateSettings((x) => { x.musicWidget = false; })}>Hide</button>
        </div>
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
          <span className="music-label">{playback ? (playback.isPlaying ? <><Bars />Now playing</> : 'Paused') : 'Spotify'}</span>
          {playback ? (
            <>
              <motion.strong key={playback.title} className="music-title" title={playback.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>{playback.title}</motion.strong>
              <span className="music-artist" title={playback.artist}>{playback.artist}</span>
            </>
          ) : (
            <span className="music-artist">{checked ? 'Nothing playing. Start a song in Spotify on any device.' : 'Checking…'}</span>
          )}
        </div>
      </div>
      {playback && <Progress p={playback} />}
      <div className="music-controls">
        <motion.button className="icon-btn" type="button" aria-label="Previous song" onClick={() => void control('previous')} whileTap={{ scale: 0.88 }} transition={SPRING}><Icon name="prev" /></motion.button>
        <motion.button className="music-play" type="button" aria-label={playback?.isPlaying ? 'Pause music' : 'Play music'}
          onClick={() => void control(playback?.isPlaying ? 'pause' : 'play')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }} transition={SPRING}>
          <Icon name={playback?.isPlaying ? 'pause' : 'play'} />
        </motion.button>
        <motion.button className="icon-btn" type="button" aria-label="Next song" onClick={() => void control('next')} whileTap={{ scale: 0.88 }} transition={SPRING}><Icon name="next" /></motion.button>
        {playback?.url && <a className="music-open" href={playback.url} target="_blank" rel="noreferrer" aria-label="Open in Spotify" title="Open in Spotify"><Icon name="external" /></a>}
      </div>
      {error && <p className="hint warn music-error" role="status">{error}</p>}
      {playback?.device && <p className="music-device">Playing on {playback.device} · via Spotify</p>}
    </FoldCard>
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
