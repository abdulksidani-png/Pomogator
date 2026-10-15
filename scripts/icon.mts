// Writes app/icon.svg (the browser-tab icon) from the pixel logo in lib/logo.ts:
//   node --experimental-strip-types scripts/icon.mts
import fs from 'node:fs';
import { logoSvg } from '../lib/logo.ts';

fs.writeFileSync(new URL('../app/icon.svg', import.meta.url), logoSvg() + '\n');
