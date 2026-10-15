'use client';
/**
 * Spotify "now playing" and playback controls, straight from the browser.
 * Sign-in uses Spotify's PKCE flow, so there is no client secret anywhere: only the public client ID
 * (SPOTIFY_CLIENT_ID, served by /api/config). Tokens stay on this device (localStorage).
 * Spotify only lets Premium accounts control playback, and a development-mode app only works for
 * the accounts added to it in the Spotify developer dashboard.
 */
import { create } from 'zustand';
import { siteConfig } from './config';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const TOKENS = 'studybuddy.spotify';
const PENDING = 'studybuddy.spotify.pkce';

export interface Playback {
  title: string;
  artist: string;
  album: string;
  art: string;
  url: string;
  device: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  /** When progressMs was true, so the bar can move between checks. */
  at: number;
}

interface SpotifyState {
  linked: boolean;
  /** null = nothing playing on any device. */
  playback: Playback | null;
  checked: boolean;
  error: string;
  /** 'status' errors clear when a check succeeds; 'control' errors (a refused button) stay a few seconds. */
  errorKind: '' | 'status' | 'control';
}

interface Tokens { access: string; refresh: string; expiresAt: number }

const readTokens = (): Tokens | null => { try { return JSON.parse(localStorage.getItem(TOKENS) || 'null'); } catch { return null; } };
const writeTokens = (t: Tokens | null) => { try { if (t) localStorage.setItem(TOKENS, JSON.stringify(t)); else localStorage.removeItem(TOKENS); } catch { /* storage blocked */ } };

export const useSpotify = create<SpotifyState>(() => ({
  linked: typeof window !== 'undefined' && !!readTokens(), playback: null, checked: false, error: '', errorKind: '',
}));

let errorTimer: ReturnType<typeof setTimeout> | undefined;
function controlError(error: string) {
  clearTimeout(errorTimer);
  useSpotify.setState({ error, errorKind: error ? 'control' : '' });
  if (error) errorTimer = setTimeout(() => { if (useSpotify.getState().errorKind === 'control') useSpotify.setState({ error: '', errorKind: '' }); }, 8000);
}

const redirectUri = () => `${window.location.origin}/spotify`;

function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
async function challengeFor(verifier: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Go to Spotify to sign in. Returns false when this site has no Spotify client ID set. */
export async function connectSpotify(): Promise<boolean> {
  const { spotifyClientId } = await siteConfig();
  if (!spotifyClientId) return false;
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    response_type: 'code', client_id: spotifyClientId, scope: SCOPES, redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: await challengeFor(verifier), state,
  });
  window.location.assign(`${ACCOUNTS}/authorize?${q}`);
  return true;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = (await r.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!r.ok || !j?.access_token) throw { code: j?.error || 'token_failed' };
  return { access: j.access_token, refresh: j.refresh_token || body.refresh_token || '', expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

/** Finish sign-in on /spotify. Returns '' on success, or a message for the student. */
export async function finishSpotifyLogin(params: URLSearchParams): Promise<string> {
  let pending: { verifier: string; state: string } | null = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); } catch { /* ignore */ }
  sessionStorage.removeItem(PENDING);
  if (params.get('error')) return params.get('error') === 'access_denied' ? 'Spotify wasn\'t connected.' : 'Spotify sign-in didn\'t work. Try again.';
  const code = params.get('code');
  if (!code || !pending || params.get('state') !== pending.state) return 'Spotify sign-in expired. Try connecting again.';
  const { spotifyClientId } = await siteConfig();
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: spotifyClientId, code_verifier: pending.verifier });
    writeTokens(t);
    useSpotify.setState({ linked: true, error: '', errorKind: '' });
    return '';
  } catch {
    return 'Spotify sign-in didn\'t work. If you aren\'t on the app\'s user list, ask the site owner to add you.';
  }
}

export function disconnectSpotify() {
  writeTokens(null);
  useSpotify.setState({ linked: false, playback: null, checked: false, error: '', errorKind: '' });
}

async function accessToken(): Promise<string | null> {
  const t = readTokens();
  if (!t) return null;
  if (t.expiresAt - 60_000 > Date.now()) return t.access;
  try {
    const { spotifyClientId } = await siteConfig();
    const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: spotifyClientId });
    writeTokens(fresh);
    return fresh.access;
  } catch {
    disconnectSpotify();
    useSpotify.setState({ error: 'Spotify signed you out. Connect again to see your music.', errorKind: 'status' });
    return null;
  }
}

async function api(path: string, method = 'GET'): Promise<Response | null> {
  const token = await accessToken();
  if (!token) return null;
  let r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) { // expired early: refresh once and retry
    const t = readTokens();
    if (t) writeTokens({ ...t, expiresAt: 0 });
    const again = await accessToken();
    if (!again) return null;
    r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${again}` } });
  }
  return r;
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Turn Spotify's playback state into what the widget shows. Songs and podcast episodes both work. */
export function toPlayback(j: unknown, now = Date.now()): Playback | null {
  const b = o(j), item = o(b.item);
  if (!str(item.name)) return null;
  const album = o(item.album), show = o(item.show);
  const images = (Array.isArray(album.images) ? album.images : Array.isArray(item.images) ? item.images : []) as Obj[];
  const art = str(images.find((i) => Number(i.width) <= 320 && Number(i.width) >= 200)?.url) || str(images[0]?.url);
  const artists = Array.isArray(item.artists) ? (item.artists as Obj[]).map((a) => str(a.name)).filter(Boolean).join(', ') : str(show.name);
  return {
    title: str(item.name), artist: artists, album: str(album.name) || str(show.name), art,
    url: str(o(item.external_urls).spotify), device: str(o(b.device).name),
    isPlaying: !!b.is_playing, progressMs: Number(b.progress_ms) || 0, durationMs: Number(item.duration_ms) || 0, at: now,
  };
}

/** Ask Spotify what's playing. */
export async function refreshPlayback() {
  if (!useSpotify.getState().linked) return;
  try {
    const r = await api('/me/player?additional_types=track,episode');
    if (!r) return;
    if (r.status === 204) { useSpotify.setState({ playback: null, checked: true }); return; }
    if (r.status === 429) return; // busy: try again on the next check
    if (r.status === 403) { useSpotify.setState({ checked: true, errorKind: 'status', error: 'This Spotify account isn\'t on the app\'s user list yet. The site owner can add it in the Spotify developer dashboard.' }); return; }
    if (!r.ok) return;
    const playback = toPlayback(await r.json());
    useSpotify.setState((st) => ({ playback, checked: true, ...(st.errorKind === 'status' ? { error: '', errorKind: '' as const } : {}) }));
  } catch { /* offline: keep the last state */ }
}

/** Play, pause, next or previous on whatever device is playing. */
export async function control(action: 'play' | 'pause' | 'next' | 'previous') {
  const before = useSpotify.getState().playback;
  if (before && (action === 'play' || action === 'pause')) {
    // Show the change at once; the next check corrects it if Spotify disagrees.
    const now = Date.now();
    const progress = before.isPlaying ? before.progressMs + (now - before.at) : before.progressMs;
    useSpotify.setState({ playback: { ...before, isPlaying: action === 'play', progressMs: progress, at: now } });
  }
  const method = action === 'play' || action === 'pause' ? 'PUT' : 'POST';
  const r = await api(`/me/player/${action}`, method).catch(() => null);
  if (r && !r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { reason?: string } } | null;
    const reason = j?.error?.reason;
    useSpotify.setState({ playback: before });
    controlError(r.status === 403 || reason === 'PREMIUM_REQUIRED' ? 'Spotify only lets Premium accounts control playback from other apps.'
      : r.status === 404 || reason === 'NO_ACTIVE_DEVICE' ? 'Open Spotify on any device and start a song first.'
        : 'Spotify didn\'t respond. Try again.');
    return;
  }
  controlError('');
  setTimeout(() => void refreshPlayback(), action === 'next' || action === 'previous' ? 700 : 400);
}
