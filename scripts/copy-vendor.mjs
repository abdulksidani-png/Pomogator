// Copies the PDF reader's worker and the text-recognition (OCR) engine into public/vendor,
// so the site serves them itself instead of loading them from another website.
// Runs automatically before `npm run dev` and `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public', 'vendor');
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

const copies = [
  [path.join(pkgDir('pdfjs-dist'), 'build', 'pdf.worker.min.mjs'), 'pdfjs/pdf.worker.min.mjs'],
  [path.join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), 'tesseract/worker.min.js'],
  ...['tesseract-core.wasm.js', 'tesseract-core-simd.wasm.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']
    .map((f) => [path.join(pkgDir('tesseract.js-core'), f), `tesseract/core/${f}`]),
  [path.join(pkgDir('@tesseract.js-data/eng'), '4.0.0', 'eng.traineddata.gz'), 'tesseract/lang/eng.traineddata.gz'],
];

for (const [from, to] of copies) {
  const dest = path.join(out, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const fresh = fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(from).size;
  if (!fresh) fs.copyFileSync(from, dest);
}
console.log(`vendor files ready in public/vendor (${copies.length} files)`);
