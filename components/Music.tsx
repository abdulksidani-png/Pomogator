'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useStudy } from '@/lib/store';
import { siteConfig } from '@/lib/config';
import { refreshLastfm, useLastfm } from '@/lib/lastfm';
import { cleanLastfmUser, type Playback } from '@/lib/lastfm-core';
import { Icon } from './Icon';
import { FoldCard } from './Panels';
import { SOFT } from './motion';

/**
 * The "now playing" card: album art and the song, read from Last.fm by username. Last.fm works with any music
 * app that scrobbles (Spotify, Apple Music, YouTube Music, Tidal…) and has no limit on how many people use it.
 * It only reports what's playing, so there are no play / skip buttons.
 */
export function MusicCard() {
  const show = useStudy((s) => s.settings.musicWidget);
  const user = useStudy((s) => s.settings.lastfmUser);
  const [on, setOn] = useState(false);
  const { playback, checked, error } = useLastfm();
  const { updateSettings } = useStudy.getState();

  useEffect(() => { void siteConfig().then((c) => setOn(c.lastfm)); }, []);

  // While a song is playing, check every 8 seconds (the server caches each answer for 5); while nothing is, every 30,
  // so idle tabs don't use up Last.fm's allowance. Only while the page is visible, and at once on coming back.
  const playing = !!playback?.isPlaying;
  useEffect(() => {
    if (!on || !user || !show) return;
    const check = () => { if (document.visibilityState === 'visible') void refreshLastfm(user); };
    const id = setInterval(check, playing ? 8_000 : 30_000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [on, show, user, playing]);
  useEffect(() => { if (on && user && show) void refreshLastfm(user); }, [on, show, user]);

  if (!show || !on) return null;

  if (!user) {
    return (
      <section className="card side-card music music-off" id="musicCard" aria-label="Music">
        <span className="music-badge" aria-hidden="true"><Icon name="music" /></span>
        <div className="music-off-text">
          <strong>Study with your music</strong>
          <span>Show the song you&apos;re playing here and to your friends, from Spotify, Apple Music, YouTube Music or almost any other app.</span>
        </div>
        <LastfmForm />
        <div className="music-off-actions">
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
          <span className="music-label">{playback ? (playback.isPlaying ? <><Bars />Now playing</> : 'Last played') : 'Last.fm'}</span>
          {playback ? (
            <>
              <motion.strong key={playback.title} className="music-title" title={playback.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>{playback.title}</motion.strong>
              <span className="music-artist" title={playback.artist}>{playback.artist}</span>
            </>
          ) : (
            <span className="music-artist">{!checked ? 'Checking…' : 'Nothing yet. Songs show up once your music app is connected to Last.fm.'}</span>
          )}
        </div>
      </div>
      <p className="music-device music-lastfm">
        via Last.fm · {user}
        {playback?.url && <a className="music-open" href={playback.url} target="_blank" rel="noreferrer" aria-label="Open on Last.fm" title="Open on Last.fm"><Icon name="external" /></a>}
      </p>
      {error && <p className="hint warn music-error" role="status">{error}</p>}
    </FoldCard>
  );
}

/** Three plain steps, then the username box. */
function LastfmForm() {
  const [name, setName] = useState('');
  const valid = !!cleanLastfmUser(name);
  return (
    <form className="music-lastfm-form" onSubmit={(e) => {
      e.preventDefault();
      if (!valid) return;
      useStudy.getState().updateSettings((x) => { x.lastfmUser = name.trim(); });
    }}>
      <ol className="music-steps">
        <li>Make a free account at <a href="https://www.last.fm/join" target="_blank" rel="noreferrer">last.fm</a>.</li>
        <li>Connect your music app to it. Spotify: <a href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer">last.fm → Settings → Applications</a>. Other apps: <a href="https://www.last.fm/about/trackmymusic" target="_blank" rel="noreferrer">Track My Music</a>.</li>
        <li>Type your Last.fm username here.</li>
      </ol>
      <label htmlFor="lastfmCardUser">Your Last.fm username</label>
      <span className="inline">
        <input id="lastfmCardUser" type="text" autoComplete="off" spellCheck={false} maxLength={15} value={name} onChange={(e) => setName(e.target.value)} placeholder="username" />
        <button className="btn btn-primary" type="submit" disabled={!valid}>Connect</button>
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
