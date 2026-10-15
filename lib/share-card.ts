'use client';
/**
 * "Save as image" for the weekly report: draws a 1080×1350 card (the size social apps like) on a canvas,
 * in the current theme's colors, with the headline, the key numbers, minutes per day and the pixel logo.
 * Everything is drawn here, so nothing is sent anywhere.
 */
import { LOGO, N, PAL } from './logo';
import { WEEKDAYS, addDays } from './stats';
import type { WeekReport } from './weekly';
import { SITE } from './site';

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Wrap text to a width; returns the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawShareCard(r: WeekReport, text: { headline: string; summary: string }): HTMLCanvasElement {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = v('--bg', '#F3F5FA'), card = v('--card', '#FFFFFF'), fg = v('--fg', '#1B2622'), fg2 = v('--fg-2', '#4A5560'), fg3 = v('--fg-3', '#7A8590');
  const accent = v('--accent', '#2F4BC8'), rule = v('--rule', '#DCE2EE');
  const display = v('--f-display', 'system-ui, sans-serif'), body = v('--f-body', 'system-ui, sans-serif');

  const W = 1080, H = 1350, P = 72;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Logo and name
  const s = 4.2, lx = P, ly = P;
  for (const part of ['track', 'head', 'water', 'wave'] as const) {
    for (const run of LOGO.parts[part]) { ctx.fillStyle = part === 'track' ? rule : run.c; ctx.fillRect(lx + run.x * s, ly + run.y * s, run.w * s + 0.5, s + 0.5); }
  }
  ctx.fillStyle = PAL.o;
  for (const p of LOGO.arc) ctx.fillRect(lx + p.x * s, ly + p.y * s, s + 0.5, s + 0.5);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fg; ctx.font = `800 52px ${display}`;
  ctx.fillText('Pomo', lx + N * s + 26, ly + 66);
  const pw = ctx.measureText('Pomo').width;
  ctx.fillStyle = accent; ctx.fillText('Gator', lx + N * s + 26 + pw, ly + 66);
  ctx.fillStyle = fg3; ctx.font = `600 26px ${body}`;
  ctx.fillText(`${r.inProgress ? 'This week so far' : 'Week in review'} · ${day(r.start)} – ${day(addDays(r.start, 6))}`, lx + N * s + 26, ly + 100);

  // Headline and summary
  let y = 300;
  ctx.fillStyle = fg; ctx.font = `800 64px ${display}`;
  for (const line of wrap(ctx, text.headline, W - P * 2).slice(0, 2)) { ctx.fillText(line, P, y); y += 74; }
  y += 6;
  ctx.fillStyle = fg2; ctx.font = `400 32px ${body}`;
  for (const line of wrap(ctx, text.summary, W - P * 2).slice(0, 4)) { ctx.fillText(line, P, y); y += 46; }

  // Key numbers: four tiles
  y = Math.max(y + 30, 640);
  const tiles: [string, string, string][] = [
    ['Study time', hm(r.now.studyMin), r.delta.studyMin ? `${r.delta.studyMin > 0 ? '▲' : '▼'} ${hm(Math.abs(r.delta.studyMin))}` : ''],
    ['Sessions', String(r.now.sessions), r.delta.sessions ? `${r.delta.sessions > 0 ? '▲' : '▼'} ${Math.abs(r.delta.sessions)}` : ''],
    ['Quiz accuracy', r.now.accuracy === null ? '–' : `${r.now.accuracy}%`, r.delta.accuracy ? `${r.delta.accuracy > 0 ? '▲' : '▼'} ${Math.abs(r.delta.accuracy)} pts` : ''],
    ['Study streak', `${r.now.streak}d`, r.delta.streak ? `${r.delta.streak > 0 ? '▲' : '▼'} ${Math.abs(r.delta.streak)}` : ''],
  ];
  const gap = 20, tw = (W - P * 2 - gap) / 2, th = 150;
  tiles.forEach(([label, value, delta], i) => {
    const tx = P + (i % 2) * (tw + gap), ty = y + Math.floor(i / 2) * (th + gap);
    ctx.fillStyle = card; roundRect(ctx, tx, ty, tw, th, 24); ctx.fill();
    ctx.fillStyle = fg3; ctx.font = `600 24px ${body}`; ctx.fillText(label, tx + 28, ty + 44);
    ctx.fillStyle = fg; ctx.font = `800 56px ${display}`; ctx.fillText(value, tx + 28, ty + 110);
    if (delta) { ctx.fillStyle = accent; ctx.font = `700 24px ${body}`; ctx.textAlign = 'right'; ctx.fillText(delta, tx + tw - 28, ty + 110); ctx.textAlign = 'left'; }
  });

  // Minutes per day
  y += th * 2 + gap + 50;
  const chartH = 170, colW = (W - P * 2) / 7;
  const max = Math.max(30, ...r.days.map((d) => d.minutes));
  r.days.forEach((d, i) => {
    const h = Math.round((d.minutes / max) * chartH);
    const x = P + i * colW + colW * 0.28, w = colW * 0.44;
    ctx.fillStyle = rule; roundRect(ctx, x, y, w, chartH, 10); ctx.fill();
    if (h > 0) { ctx.fillStyle = accent; roundRect(ctx, x, y + chartH - h, w, h, 10); ctx.fill(); }
    ctx.fillStyle = fg3; ctx.font = `600 22px ${body}`; ctx.textAlign = 'center';
    ctx.fillText(WEEKDAYS[new Date(`${d.date}T12:00:00Z`).getUTCDay()].slice(0, 3), x + w / 2, y + chartH + 36);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = fg3; ctx.font = `600 22px ${body}`; ctx.textAlign = 'right';
  ctx.fillText(`${SITE.name} · study, quiz yourself, earn your break`, W - P, H - 48);
  ctx.textAlign = 'left';
  return c;
}

/** Draw the card and download it as a PNG. */
export async function saveShareCard(r: WeekReport, text: { headline: string; summary: string }) {
  await document.fonts?.ready;
  const c = drawShareCard(r, text);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('no image');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pomogator-week-${r.start}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
