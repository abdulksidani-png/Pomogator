import { describe, expect, it } from 'vitest';
import { ANCHORS, COSMETICS, COSMETIC_PAL, cleanOwned, cleanWear, cosmeticLayers, wearing } from '@/lib/cosmetics';
import { MASCOTS } from '@/lib/appearance';

describe('cosmetics', () => {
  it('has the four launch items, each in a slot', () => {
    expect(COSMETICS.map((c) => c.id)).toEqual(['sunglasses', 'tie', 'cowboy', 'propeller']);
  });

  it('fits every buddy (universal)', () => {
    for (const m of MASCOTS) {
      expect(ANCHORS[m.id]).toBeTruthy();
      const layers = cosmeticLayers(m.id, ['cowboy', 'sunglasses', 'tie']);
      expect(layers).toHaveLength(3);
      for (const l of layers) for (const ch of l.rows.join('').replace(/\./g, '')) expect(COSMETIC_PAL[ch], ch).toBeTruthy();
    }
  });

  it('hats sit above the head, and the propeller spins in two frames', () => {
    const l = cosmeticLayers('gator', ['propeller']);
    expect(l.map((x) => x.cls ?? '')).toEqual(['type-a', 'type-b', '']);
    expect(l[0].y).toBeLessThan(ANCHORS.gator.hat.y);
  });

  it('wears one item per slot', () => {
    let w = wearing([], 'cowboy', true);
    w = wearing(w, 'sunglasses', true);
    w = wearing(w, 'propeller', true);
    expect(w.sort()).toEqual(['propeller', 'sunglasses']);
    expect(wearing(w, 'sunglasses', false)).toEqual(['propeller']);
  });

  it('cleans what comes back from storage', () => {
    expect(cleanOwned(['tie', 'crown', 'sunglasses', 'tie'])).toEqual(['sunglasses', 'tie']);
    expect(cleanOwned('tie')).toEqual([]);
    expect(cleanWear(['cowboy', 'propeller', 'tie'], ['propeller'])).toEqual(['propeller']);
    expect(cleanWear(['cowboy', 'propeller'])).toEqual(['propeller']);
  });
});
