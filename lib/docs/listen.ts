'use client';
/**
 * Tab sound → notes, for video lectures. The shared tab's audio is collected while a study
 * session runs, cut into short clips, and turned into text by a small speech model (Whisper)
 * running in a background worker on this device. Audio is never saved or uploaded; only the text
 * is kept, on the live session, so the quiz can cover what the lecture said.
 */
import { useStudy } from '../store';
import { useScreen } from './screen';

const RATE = 16_000;      // what the speech model expects
const CLIP_S = 12;        // seconds of sound per clip
const MIN_CLIP_S = 3;     // shorter leftovers aren't worth reading
const QUIET = 0.004;      // below this loudness a clip is treated as silence

// Copies each block of sound out of the audio thread.
const TAP = `registerProcessor('sb-tap', class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;

let ctx: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let tap: AudioWorkletNode | null = null;
let worker: Worker | null = null;
let parts: Float32Array[] = [];
let partsLen = 0;
let pending = 0;
let live = false;

const studying = () => {
  const T = useStudy.getState().timer;
  return T.phase === 'study' && T.status === 'running' && !!T.session;
};

/** Create the audio engine. Call from the click that starts sharing (browsers need a gesture). */
export function prepareListening() {
  if (ctx || typeof window === 'undefined') return;
  try { ctx = new AudioContext(); void ctx.resume(); } catch { ctx = null; }
}

/** Start turning the stream's sound into text. Returns false when the stream carries no sound. */
export function listenTo(stream: MediaStream): boolean {
  const track = stream.getAudioTracks()[0];
  if (!track || !ctx) { stopListening(); return false; }
  live = true;
  void (async () => {
    try {
      const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
      await ctx!.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      if (!live || !ctx) return;
      source = ctx.createMediaStreamSource(new MediaStream([track]));
      tap = new AudioWorkletNode(ctx, 'sb-tap');
      tap.port.onmessage = (e: MessageEvent<Float32Array>) => collect(e.data);
      const mute = ctx.createGain();
      mute.gain.value = 0; // keeps the tap running without playing the sound twice
      source.connect(tap).connect(mute).connect(ctx.destination);
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
      startWorker();
    } catch {
      useScreen.setState({ audio: 'failed', error: 'This browser couldn\'t read the tab\'s sound. Slide tracking still works.' });
    }
  })();
  return true;
}

export function stopListening() {
  live = false;
  flush(true);
  tap?.port.close();
  tap?.disconnect(); source?.disconnect();
  tap = null; source = null;
  void ctx?.close().catch(() => undefined);
  ctx = null;
  parts = []; partsLen = 0;
  // Let clips already sent finish, then let the worker go.
  const w = worker;
  worker = null;
  if (w) setTimeout(() => w.terminate(), pending ? 30_000 : 0);
}

function startWorker() {
  if (worker) return;
  worker = new Worker('/asr-worker.js', { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ type: string; pct?: number; text?: string; message?: string }>) => {
    const m = e.data;
    if (m.type === 'progress') useScreen.setState({ audioLoad: m.pct ?? 0 });
    else if (m.type === 'ready') { if (live) useScreen.setState({ audio: 'listening', audioLoad: 100 }); }
    else if (m.type === 'text') {
      pending = Math.max(0, pending - 1);
      const text = cleanHeard(m.text ?? '');
      if (text) { useStudy.getState().addHeard(text); useScreen.setState({ heardLast: text }); }
    } else if (m.type === 'error') {
      pending = Math.max(0, pending - 1);
      if (live && useScreen.getState().audio === 'loading') {
        useScreen.setState({ audio: 'failed', error: 'The speech reader couldn\'t load. Check your connection; slide tracking still works.' });
      }
    }
  };
  worker.postMessage({ type: 'load' });
}

function collect(block: Float32Array) {
  if (!ctx) return;
  if (!studying()) { flush(true); return; } // paused or on a break: nothing is kept
  parts.push(block);
  partsLen += block.length;
  if (partsLen >= ctx.sampleRate * CLIP_S) flush(false);
}

/** Send what's been collected to the speech model. */
function flush(final: boolean) {
  if (!partsLen || !ctx) { parts = []; partsLen = 0; return; }
  const rate = ctx.sampleRate;
  const enough = partsLen >= rate * (final ? MIN_CLIP_S : CLIP_S);
  const all = new Float32Array(partsLen);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  parts = []; partsLen = 0;
  if (!enough || !worker || loudness(all) < QUIET) return;
  const clip = resample(all, rate, RATE);
  pending++;
  worker.postMessage({ type: 'clip', audio: clip }, [clip.buffer]);
}

/** Average loudness (root mean square). */
export function loudness(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (x.length || 1));
}

/** Change the sample rate by averaging (good enough for speech). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x.slice(0);
  const ratio = from / to;
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.min(x.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += x[j];
    out[i] = b > a ? s / (b - a) : x[a] ?? 0;
  }
  return out;
}

/** Drop the model's sound labels ("[Music]", "(applause)") and filler it makes up over silence. */
export function cleanHeard(raw: string): string {
  const t = raw.replace(/\[[^\]]*\]|\([^)]*\)|♪+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(thank you\.?|thanks for watching!?|you|\.+)$/i.test(t)) return '';
  return t.length < 3 ? '' : t;
}
