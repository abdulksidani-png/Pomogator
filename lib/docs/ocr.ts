'use client';
/**
 * Text recognition (OCR) that runs entirely in the browser with Tesseract.js.
 * Used for photos of notes, scanned PDFs and screen tracking. The engine files are
 * served by this site (public/vendor/tesseract), so images never leave the device.
 */
import type { Worker } from 'tesseract.js';
import { pickTitle } from './match';

let workerP: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function worker(): Promise<Worker> {
  if (!workerP) {
    workerP = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        workerPath: '/vendor/tesseract/worker.min.js',
        corePath: '/vendor/tesseract/core',
        langPath: '/vendor/tesseract/lang',
        workerBlobURL: false,
      }),
    );
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}

export interface OcrResult { text: string; title: string }

interface Line { text: string; bbox: { y0: number; y1: number } }
interface Block { paragraphs?: { lines?: Line[] }[] }

/** Read the text in an image. Jobs run one at a time. */
export function ocr(image: HTMLCanvasElement | Blob | File): Promise<OcrResult> {
  const job = queue.then(async () => {
    const w = await worker();
    const { data } = await w.recognize(image, {}, { text: true, blocks: true });
    const lines = ((data as unknown as { blocks?: Block[] }).blocks ?? [])
      .flatMap((b) => b.paragraphs ?? []).flatMap((p) => p.lines ?? [])
      .map((l) => ({ text: l.text, height: l.bbox.y1 - l.bbox.y0, top: l.bbox.y0 }));
    const height = image instanceof HTMLCanvasElement ? image.height : Math.max(1, ...lines.map((l) => l.top + l.height));
    return { text: (data.text || '').trim(), title: pickTitle(lines, height) };
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Start loading the engine early (about 3 MB, cached by the browser afterwards). */
export function warmUpOcr() { void worker().catch(() => undefined); }
