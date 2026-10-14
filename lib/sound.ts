/**
 * Synthesized chimes and ambience with the Web Audio API — nothing to download.
 * Browsers only allow audio after a user gesture, so call `ensure()` from a click or key press.
 */

type Dest = AudioNode;
interface ChimeDef { label: string; play: (d: Dest, t: number) => void }
interface AmbDef { label: string; build?: (out: GainNode) => () => void }

let ctx: AudioContext | null = null;
let ambOut: GainNode | null = null;
let current: { name: string; stop: (() => void) | null; out?: GainNode } = { name: 'none', stop: null };
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewing = false;
let onResume: (() => void) | null = null;
const buffers: Record<string, AudioBuffer> = {};

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().then(() => onResume?.()).catch(() => {});
  return ctx;
}
const unlocked = () => !!ctx && ctx.state === 'running';

function tone(dest: Dest, f: number, t0: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.3, attack = 0.006 } = {}) {
  const c = ctx!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}

export const CHIMES: Record<string, ChimeDef> = {
  bell: { label: 'Desk bell', play: (d, t) => {
    ([[880, 1, 1.8], [1769, 0.45, 1.2], [2429, 0.22, 0.8], [4752, 0.1, 0.4]] as const).forEach(([f, a, du]) => tone(d, f, t, du, { gain: 0.3 * a }));
    ([[880, 1, 1.6], [1769, 0.4, 1]] as const).forEach(([f, a, du]) => tone(d, f, t + 0.5, du, { gain: 0.2 * a }));
  } },
  marimba: { label: 'Marimba', play: (d, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(d, f, t + i * 0.14, 0.55, { gain: 0.34 }); tone(d, f * 4, t + i * 0.14, 0.1, { gain: 0.04 }); });
  } },
  digital: { label: 'Digital beeps', play: (d, t) => { for (let i = 0; i < 3; i++) tone(d, 1320, t + i * 0.22, 0.12, { type: 'square', gain: 0.07, attack: 0.002 }); } },
  gong: { label: 'Soft gong', play: (d, t) => {
    ([[196, 1, 3.4], [294, 0.4, 2.6], [470, 0.22, 2], [764, 0.1, 1.3]] as const).forEach(([f, a, du]) => tone(d, f, t, du, { gain: 0.36 * a, attack: 0.03 }));
  } },
  wood: { label: 'Wood block', play: (d, t) => {
    [0, 0.17, 0.5].forEach((o) => { tone(d, 1750, t + o, 0.08, { type: 'triangle', gain: 0.3, attack: 0.001 }); tone(d, 880, t + o, 0.1, { gain: 0.14, attack: 0.001 }); });
  } },
  rise: { label: 'Rising chord', play: (d, t) => {
    [392, 493.88, 587.33, 783.99].forEach((f, i) => tone(d, f, t + i * 0.09, 1.7 - i * 0.1, { type: 'triangle', gain: 0.15 }));
  } },
};

function noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  if (buffers[kind]) return buffers[kind];
  const c = ctx!;
  const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  if (kind === 'white') { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
  else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else { let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } }
  return (buffers[kind] = buf);
}
function loopSrc(kind: 'white' | 'pink' | 'brown') { const s = ctx!.createBufferSource(); s.buffer = noise(kind); s.loop = true; s.loopStart = Math.random(); return s; }
function filt(type: BiquadFilterType, f: number, q = 0.7) { const b = ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function gainN(v: number) { const g = ctx!.createGain(); g.gain.value = v; return g; }
function chain(...nodes: AudioNode[]) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
function lfo(param: AudioParam, rate: number, depth: number) { const o = ctx!.createOscillator(), g = gainN(depth); o.frequency.value = rate; o.connect(g); g.connect(param); o.start(); return o; }
function sprinkle(fn: () => void, minMs: number, maxMs: number) {
  let alive = true; let t: ReturnType<typeof setTimeout>;
  const go = () => { if (!alive) return; fn(); t = setTimeout(go, minMs + Math.random() * (maxMs - minMs)); };
  t = setTimeout(go, minMs);
  return () => { alive = false; clearTimeout(t); };
}
function burst(out: AudioNode, f: number, dur: number, g: number, type: BiquadFilterType = 'bandpass', q = 1.4) {
  const c = ctx!;
  const s = c.createBufferSource(); s.buffer = noise('white');
  const b = filt(type, f, q), v = c.createGain(), t0 = c.currentTime;
  v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  chain(s, b, v, out); s.start(t0, Math.random() * 3); s.stop(t0 + dur + 0.05);
}

export const AMBIENCE: Record<string, AmbDef> = {
  none: { label: 'Off' },
  rain: { label: 'Rain on the window', build(out) {
    const s = loopSrc('pink'), g = gainN(0.9); chain(s, filt('highpass', 500), filt('lowpass', 7500), g, out); s.start();
    const s2 = loopSrc('white'), g2 = gainN(0.06); chain(s2, filt('bandpass', 2600, 0.6), g2, out); s2.start();
    const l = lfo(g.gain, 0.13, 0.12);
    const stopDrops = sprinkle(() => burst(out, 3000 + Math.random() * 3000, 0.05, 0.05 + Math.random() * 0.05), 40, 220);
    return () => { stopDrops(); [s, s2, l].forEach((n) => n.stop()); };
  } },
  cafe: { label: 'Busy café', build(out) {
    const s = loopSrc('pink'), g = gainN(0.75); chain(s, filt('bandpass', 700, 0.5), filt('lowpass', 2400), g, out); s.start();
    const l = lfo(g.gain, 0.21, 0.18), l2 = lfo(g.gain, 0.07, 0.12);
    const stopClinks = sprinkle(() => { const t = ctx!.currentTime; const f = 2400 + Math.random() * 1800; tone(out, f, t, 0.5, { gain: 0.03 }); tone(out, f * 1.5, t, 0.3, { gain: 0.012 }); }, 1800, 6000);
    return () => { stopClinks(); [s, l, l2].forEach((n) => n.stop()); };
  } },
  fire: { label: 'Campfire', build(out) {
    const s = loopSrc('brown'), g = gainN(1.1); chain(s, filt('lowpass', 420), g, out); s.start();
    const l = lfo(g.gain, 0.3, 0.25);
    const stopCrackle = sprinkle(() => {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => burst(out, 1500 + Math.random() * 2500, 0.03 + Math.random() * 0.04, 0.12 + Math.random() * 0.2, 'highpass', 0.8), i * 40);
    }, 120, 900);
    return () => { stopCrackle(); [s, l].forEach((n) => n.stop()); };
  } },
  ocean: { label: 'Ocean waves', build(out) {
    const s = loopSrc('brown'), g = gainN(0.55), lp = filt('lowpass', 700); chain(s, lp, g, out); s.start();
    const l = lfo(g.gain, 0.085, 0.48), lf = lfo(lp.frequency, 0.085, 380);
    const s2 = loopSrc('pink'), g2 = gainN(0.08); chain(s2, filt('highpass', 2000), g2, out); s2.start(); const l2 = lfo(g2.gain, 0.085, 0.07);
    return () => [s, l, lf, s2, l2].forEach((n) => n.stop());
  } },
  white: { label: 'White noise', build(out) { const s = loopSrc('white'), g = gainN(0.25); chain(s, filt('lowpass', 9000), g, out); s.start(); return () => s.stop(); } },
  brown: { label: 'Brown noise', build(out) { const s = loopSrc('brown'), g = gainN(0.9); chain(s, filt('lowpass', 900), g, out); s.start(); return () => s.stop(); } },
};

function play(name: string, vol: number) {
  if (name === current.name || !ctx) return;
  if (!ambOut) { ambOut = ctx.createGain(); ambOut.gain.value = vol; ambOut.connect(ctx.destination); }
  if (current.stop && current.out) {
    const old = current;
    old.out!.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    setTimeout(() => { try { old.stop!(); old.out!.disconnect(); } catch { /* already stopped */ } }, 1200);
  }
  const def = AMBIENCE[name];
  if (!def?.build) { current = { name: 'none', stop: null }; return; }
  const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(ambOut);
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
  let stop: () => void = () => {};
  try { stop = def.build(out); } catch { /* keep silent */ }
  current = { name, stop, out };
}

export const Sound = {
  ensure,
  unlocked,
  setOnResume(fn: () => void) { onResume = fn; },
  chime(name: string, vol: number) {
    const c = ensure(); if (!c) return;
    const g = c.createGain(); g.gain.value = vol; g.connect(c.destination);
    (CHIMES[name] || CHIMES.bell).play(g, c.currentTime + 0.03);
  },
  /** Play the ambience that should be on right now (or silence). */
  sync(desired: string, vol: number) {
    if (previewing) return;
    if (!unlocked()) { if (desired === 'none') play('none', vol); return; }
    play(desired, vol);
  },
  setAmbVol(v: number) { if (ambOut && ctx) ambOut.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
  preview(name: string, vol: number, onEnd: () => void) {
    if (!ensure()) return;
    clearTimeout(previewTimer);
    previewing = true;
    play(name === 'none' ? 'rain' : name, vol);
    previewTimer = setTimeout(() => { previewing = false; play('none', vol); onEnd(); }, 6000);
  },
};
