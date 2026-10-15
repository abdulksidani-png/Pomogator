'use client';
/**
 * Screen tracking (opt-in, desktop browsers). While a study session runs, it looks at the
 * shared window every few seconds, reads it with on-device OCR, and works out which slide
 * is showing. Frames are only ever held in memory and are never saved or uploaded.
 */
import { create } from 'zustand';
import { useStudy } from '../store';
import { clamp } from '../util';
import { buildIndex, changedFraction, confident, matchPage, type PageIndex } from './match';
import { ocr, warmUpOcr } from './ocr';
import { getPages } from './library';

export interface ScreenState {
  status: 'off' | 'starting' | 'watching';
  label: string;
  reading: boolean;
  lastPage: number;
  lastTitle: string;
  lastAt: number;
  error: string;
}

export const useScreen = create<ScreenState>(() => ({ status: 'off', label: '', reading: false, lastPage: 0, lastTitle: '', lastAt: 0, error: '' }));

export function screenSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

let stream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastThumb: Uint8ClampedArray | null = null;
let busy = false;
let index: PageIndex | null = null;
let titles: string[] = [];
let indexFor = '';
const frame = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const thumb = typeof document !== 'undefined' ? document.createElement('canvas') : null;

function niceLabel(raw: string): string {
  // Chrome labels look like "window:1234:0", "screen:0:0" or the window/tab title.
  if (!raw || /^(window|screen|web-contents-media-stream):/i.test(raw)) return 'the window you shared';
  return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
}

/** Ask the browser to share a window. Must be called from a click or key press. */
export async function startWatching(): Promise<boolean> {
  if (stream) return true;
  if (!screenSupported()) { useScreen.setState({ error: 'Screen tracking needs a desktop browser like Chrome, Edge, Firefox or Safari.' }); return false; }
  useScreen.setState({ status: 'starting', error: '' });
  warmUpOcr();
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
      // Hints for Chrome: don't offer this tab, let people switch what they share.
      ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include' } as object),
    } as DisplayMediaStreamOptions);
  } catch (e) {
    stream = null;
    const name = (e as { name?: string })?.name;
    useScreen.setState({
      status: 'off',
      error: name === 'NotAllowedError' ? 'Screen sharing was cancelled. You can set how far you got at the end instead.' : 'This browser couldn\'t share the screen. You can set how far you got at the end instead.',
    });
    return false;
  }
  const track = stream.getVideoTracks()[0];
  track?.addEventListener('ended', () => stopWatching());
  video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try { await video.play(); } catch { /* starts on first frame anyway */ }
  useScreen.setState({ status: 'watching', label: niceLabel(track?.label ?? ''), lastAt: 0 });
  schedule(1500);
  return true;
}

export function stopWatching() {
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) { video.srcObject = null; video = null; }
  lastThumb = null;
  busy = false;
  useScreen.setState({ status: 'off', reading: false, label: '' });
}

export const isWatching = () => !!stream;

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => { void capture(); }, ms);
}

async function ensureIndex(docId: string) {
  if (indexFor === docId) return;
  indexFor = docId;
  index = null; titles = [];
  if (!docId) return;
  const pages = await getPages(docId);
  if (indexFor !== docId) return;
  titles = pages.map((p) => p.title);
  index = pages.length ? buildIndex(pages) : null;
}

/** Draw the current video frame, about 1280 px wide. */
function grab(): HTMLCanvasElement | null {
  if (!video || !frame || video.videoWidth === 0) return null;
  const w = Math.min(1280, video.videoWidth);
  frame.width = w;
  frame.height = Math.round((video.videoHeight / video.videoWidth) * w);
  frame.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0, frame.width, frame.height);
  return frame;
}

/** A 64×36 grayscale thumbnail, for telling whether the screen changed. */
function thumbOf(c: HTMLCanvasElement): Uint8ClampedArray {
  const W = 64, H = 36;
  thumb!.width = W; thumb!.height = H;
  const ctx = thumb!.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(c, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
  return gray;
}

async function capture() {
  if (!stream) return;
  const s = useStudy.getState();
  const every = clamp(s.settings.screenEvery || 20, 10, 60) * 1000;
  const studying = s.timer.phase === 'study' && s.timer.status === 'running' && !!s.timer.session;
  if (!studying || busy) { schedule(studying ? 2000 : every); return; }
  const c = grab();
  if (!c) { schedule(1000); return; }
  const t = thumbOf(c);
  if (changedFraction(t, lastThumb) < 0.004) { schedule(every); return; } // nothing changed on screen
  lastThumb = t;
  busy = true;
  useScreen.setState({ reading: true });
  try {
    const docId = s.timer.session?.docId ?? '';
    await ensureIndex(docId);
    const r = await ocr(c);
    const now = useStudy.getState();
    if (now.timer.session) {
      const guess = index ? matchPage(r.text, index) : null;
      if (guess && confident(guess)) {
        const title = titles[guess.page - 1] ?? '';
        now.recordProgress(guess.page, title, 'screen', guess.score);
        useScreen.setState({ lastPage: guess.page, lastTitle: title, lastAt: Date.now() });
      } else if (r.title) {
        if (!docId) now.recordProgress(0, r.title, 'screen'); // no document: keep a "slides seen" log
        useScreen.setState({ lastPage: 0, lastTitle: r.title, lastAt: Date.now() });
      }
    }
  } catch {
    /* a missed frame is fine; try again next time */
  } finally {
    busy = false;
    useScreen.setState({ reading: false });
    schedule(every);
  }
}

/** Start sharing when a session starts, if the person asked for that. Call from the Start click. */
export function maybeAskOnStart(openConsent: () => void) {
  const s = useStudy.getState();
  if (!s.settings.screenTrack || !s.settings.screenAskOnStart || stream || !screenSupported()) return;
  if (s.timer.phase !== 'study') return;
  let agreed = false;
  try { agreed = localStorage.getItem('studybuddy.screenConsent') === '1'; } catch { /* storage blocked */ }
  if (agreed) void startWatching();
  else openConsent();
}

export function rememberConsent() { try { localStorage.setItem('studybuddy.screenConsent', '1'); } catch { /* storage blocked */ } }
