// StudyBuddy speech reader: turns short clips of a lecture tab's sound into text, on this device.
// Runs Whisper (tiny, English) with Transformers.js. The model (about 40 MB) downloads once and
// is cached by the browser. Clips arrive as 16 kHz mono Float32Arrays.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
const MODEL = 'onnx-community/whisper-tiny.en';

let reader = null;
let queue = Promise.resolve();

function load() {
  if (!reader) {
    reader = (async () => {
      const { pipeline, env } = await import(LIB);
      env.allowLocalModels = false;
      const files = {};
      const asr = await pipeline('automatic-speech-recognition', MODEL, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.file || !p.total) return;
          files[p.file] = [p.loaded || 0, p.total];
          let got = 0, all = 0;
          for (const [l, t] of Object.values(files)) { got += l; all += t; }
          self.postMessage({ type: 'progress', pct: Math.round((got / all) * 100) });
        },
      });
      self.postMessage({ type: 'ready' });
      return asr;
    })();
    reader.catch(() => { reader = null; });
  }
  return reader;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'load') { load().catch((err) => self.postMessage({ type: 'error', message: String(err && err.message || err) })); return; }
  if (m.type !== 'clip') return;
  // One clip at a time, in order.
  queue = queue.then(async () => {
    try {
      const asr = await load();
      const out = await asr(m.audio);
      self.postMessage({ type: 'text', text: (Array.isArray(out) ? out[0] : out).text || '' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  });
};
