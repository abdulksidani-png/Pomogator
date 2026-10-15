'use client';
/**
 * Read study material in the browser and split it into pages (PDF pages, PowerPoint
 * slides, document sections). Nothing is sent anywhere to do this.
 */
import type { DocKind, DocPage } from '../types';
import { ocr } from './ocr';

export interface Parsed { kind: DocKind; pages: DocPage[]; scannedPages: number }
export type Progress = (msg: string) => void;

export const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown,.csv,.html,.htm,.rtf,.json,image/png,image/jpeg,image/webp,image/gif,image/bmp';
const MAX_PAGES = 400;
const MAX_OCR_PAGES = 40;

const clean = (s: string) => s.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const firstLine = (s: string) => (s.split('\n').map((l) => l.trim()).find((l) => l.length > 1) ?? '').slice(0, 120);

export function kindOf(file: File): DocKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.pptx')) return 'pptx';
  if (n.endsWith('.docx')) return 'docx';
  if (file.type.startsWith('image/')) return 'image';
  if (/\.(txt|md|markdown|csv|html?|rtf|json)$/.test(n) || file.type.startsWith('text/')) return 'text';
  if (n.endsWith('.ppt') || n.endsWith('.doc')) return null; // old binary formats
  return null;
}

export function unsupportedMessage(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith('.ppt')) return 'Old PowerPoint files (.ppt) can\'t be read. In PowerPoint, choose File → Save As → .pptx or PDF.';
  if (n.endsWith('.doc')) return 'Old Word files (.doc) can\'t be read. In Word, choose File → Save As → .docx or PDF.';
  if (n.endsWith('.key') || n.endsWith('.pages')) return 'Apple Keynote and Pages files can\'t be read. Export them as PDF first.';
  return `PomoGator can't read ${file.name}. Try a PDF, PowerPoint (.pptx), Word (.docx), text file or photo.`;
}

/** Read one or more files into pages. Several images become one document, one page each. */
export async function parseFiles(files: File[], onProgress: Progress = () => {}): Promise<Parsed> {
  const kinds = files.map(kindOf);
  if (files.length > 1) {
    if (kinds.every((k) => k === 'image')) return parseImages(files, onProgress);
    throw new Error('Choose one document at a time (or several photos together).');
  }
  const [file] = files;
  const kind = kinds[0];
  if (!kind) throw new Error(unsupportedMessage(file));
  if (kind === 'pdf') return parsePdf(file, onProgress);
  if (kind === 'pptx') return parsePptx(file);
  if (kind === 'docx') return parseDocx(file);
  if (kind === 'image') return parseImages([file], onProgress);
  return parseText(file);
}

/* ---------------- PDF ---------------- */

interface TextItem { str: string; height: number; transform: number[]; hasEOL?: boolean }

async function parsePdf(file: File, onProgress: Progress): Promise<Parsed> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (/password/i.test(msg)) throw new Error('This PDF is password-protected. Remove the password and try again.');
    throw new Error('That PDF couldn\'t be opened. It may be damaged.');
  }
  const total = Math.min(doc.numPages, MAX_PAGES);
  const pages: DocPage[] = [];
  let scanned = 0;
  for (let i = 1; i <= total; i++) {
    onProgress(`Reading page ${i} of ${total}…`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items = (tc.items as unknown as TextItem[]).filter((it) => typeof it.str === 'string');
    let text = '';
    for (const it of items) text += it.str + (it.hasEOL ? '\n' : ' ');
    text = clean(text);
    // The title is the largest text on the page.
    const sized = items.filter((it) => it.str.trim().length > 1).map((it) => ({ s: it.str.trim(), h: Math.abs(it.height || it.transform?.[3] || 0) }));
    const maxH = Math.max(0, ...sized.map((x) => x.h));
    let title = sized.filter((x) => x.h >= maxH * 0.9).map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);

    if (text.length < 20 && scanned < MAX_OCR_PAGES) { // probably a scan: read the image instead
      scanned++;
      onProgress(`Page ${i} is a scan. Reading the image…`);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const r = await ocr(canvas);
      text = clean(r.text);
      title = r.title || firstLine(text);
    }
    pages.push({ index: i, title: title || firstLine(text) || `Page ${i}`, text });
    page.cleanup();
  }
  await doc.destroy();
  return { kind: 'pdf', pages, scannedPages: scanned };
}

/* ---------------- PowerPoint ---------------- */

async function parsePptx(file: File): Promise<Parsed> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
  catch { throw new Error('That PowerPoint file couldn\'t be opened. It may be damaged.'); }
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

  // Slide order comes from presentation.xml, not file names.
  let order: string[] = [];
  const pres = zip.file('ppt/presentation.xml');
  const rels = zip.file('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const relMap = new Map<string, string>();
    for (const r of Array.from(xml(await rels.async('string')).getElementsByTagName('Relationship'))) {
      relMap.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '');
    }
    for (const s of Array.from(xml(await pres.async('string')).getElementsByTagName('p:sldId'))) {
      const target = relMap.get(s.getAttribute('r:id') ?? '');
      if (target) order.push('ppt/' + target.replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));
    }
  }
  if (!order.length) {
    order = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  }

  const pages: DocPage[] = [];
  for (const [i, path] of order.slice(0, MAX_PAGES).entries()) {
    const f = zip.file(path);
    if (!f) continue;
    const doc = xml(await f.async('string'));
    let title = '';
    const parts: string[] = [];
    for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
      const ph = sp.getElementsByTagName('p:ph')[0];
      const isTitle = !!ph && /title/i.test(ph.getAttribute('type') ?? '');
      const paras = Array.from(sp.getElementsByTagName('a:p'))
        .map((p) => Array.from(p.getElementsByTagName('a:t')).map((t) => t.textContent ?? '').join(''))
        .filter((t) => t.trim());
      if (!paras.length) continue;
      if (isTitle && !title) title = paras.join(' ');
      parts.push(...paras);
    }
    // Tables and grouped shapes keep their text in a:t too.
    if (!parts.length) parts.push(...Array.from(doc.getElementsByTagName('a:t')).map((t) => t.textContent ?? '').filter(Boolean));
    const text = clean(parts.join('\n'));
    pages.push({ index: i + 1, title: (title || firstLine(text) || `Slide ${i + 1}`).slice(0, 120), text });
  }
  if (!pages.length) throw new Error('No slides were found in that file.');
  return { kind: 'pptx', pages, scannedPages: 0 };
}

/* ---------------- Word ---------------- */

/** Split long text into ~1,500-character sections at paragraph breaks. */
function chunk(paragraphs: string[], size = 1500): DocPage[] {
  const pages: DocPage[] = [];
  let buf: string[] = [];
  let len = 0;
  const flush = () => {
    if (!buf.length) return;
    const text = clean(buf.join('\n'));
    pages.push({ index: pages.length + 1, title: firstLine(text).slice(0, 80) || `Section ${pages.length + 1}`, text });
    buf = []; len = 0;
  };
  for (const p of paragraphs) {
    if (len + p.length > size && len > 0) flush();
    buf.push(p); len += p.length;
  }
  flush();
  return pages;
}

async function parseDocx(file: File): Promise<Parsed> {
  const mammoth = await import('mammoth');
  let html: string;
  try { html = (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value; }
  catch { throw new Error('That Word file couldn\'t be opened. It may be damaged.'); }
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const sections: { title: string; parts: string[] }[] = [];
  for (const el of Array.from(body.children)) {
    const t = (el.textContent ?? '').trim();
    if (!t) continue;
    if (/^H[1-3]$/.test(el.tagName)) sections.push({ title: t.slice(0, 120), parts: [] });
    else {
      if (!sections.length) sections.push({ title: '', parts: [] });
      sections[sections.length - 1].parts.push(t);
    }
  }
  const hasHeadings = sections.some((s) => s.title);
  const pages = hasHeadings
    ? sections.map((s, i) => ({ index: i + 1, title: s.title || firstLine(s.parts.join('\n')) || `Section ${i + 1}`, text: clean([s.title, ...s.parts].join('\n')) }))
    : chunk(sections.flatMap((s) => s.parts));
  if (!pages.length) throw new Error('That Word file has no text in it.');
  return { kind: 'docx', pages: pages.slice(0, MAX_PAGES), scannedPages: 0 };
}

/* ---------------- text, Markdown, HTML ---------------- */

async function parseText(file: File): Promise<Parsed> {
  if (file.size > 5_000_000) throw new Error('That text file is over 5 MB. Split it into smaller files.');
  let raw = await file.text();
  const n = file.name.toLowerCase();
  if (/\.html?$/.test(n)) raw = new DOMParser().parseFromString(raw, 'text/html').body.innerText || '';
  if (n.endsWith('.rtf')) raw = raw.replace(/\\par[d]?/g, '\n').replace(/\{\\[^}]*\}|\\[a-z]+-?\d* ?|[{}]/g, '');
  raw = raw.replace(/\r\n?/g, '\n');
  let pages: DocPage[];
  if (/^#{1,3}\s+\S/m.test(raw)) {
    const parts = raw.split(/^(?=#{1,3}\s+\S)/m).map((s) => s.trim()).filter(Boolean);
    pages = parts.map((p, i) => ({ index: i + 1, title: firstLine(p).replace(/^#+\s*/, ''), text: clean(p.replace(/^#+\s*/gm, '')) }));
  } else {
    pages = chunk(raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
  }
  if (!pages.length) throw new Error('That file has no text in it.');
  return { kind: 'text', pages: pages.slice(0, MAX_PAGES), scannedPages: 0 };
}

/* ---------------- photos ---------------- */

async function parseImages(files: File[], onProgress: Progress): Promise<Parsed> {
  const pages: DocPage[] = [];
  for (const [i, f] of files.slice(0, MAX_OCR_PAGES).entries()) {
    if (f.size > 20_000_000) throw new Error(`${f.name} is over 20 MB.`);
    onProgress(files.length > 1 ? `Reading photo ${i + 1} of ${files.length}…` : 'Reading the photo…');
    const r = await ocr(f);
    const text = clean(r.text);
    pages.push({ index: i + 1, title: r.title || firstLine(text) || `Photo ${i + 1}`, text });
  }
  if (!pages.some((p) => p.text.length > 3)) throw new Error('No readable text was found in that photo. Try a sharper, well-lit picture.');
  return { kind: 'image', pages, scannedPages: pages.length };
}
