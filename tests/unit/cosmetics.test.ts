import { describe, expect, it } from 'vitest';
import { ANCHORS, COSMETICS, COSMETIC_PAL, cleanOutfits, cleanOwned, cleanWear, cosmeticLayers, decodeBuddy, encodeBuddy, saveOutfit, wearing } from '@/lib/cosmetics';
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
    expect(l.map((x) => x.cls ?? '')).toEqual(['', 'type-a', 'type-b']);
    expect(l[1].y).toBeLessThan(l[0].y); // the blades sit on top of the cap
    expect(l[0].y).toBeLessThan(ANCHORS.gator.hat.y);
    // Buddies drawn in profile get the side view, with the brim sticking out in front.
    expect(cosmeticLayers('gator', ['propeller'])[0].rows).not.toEqual(cosmeticLayers('bulldog', ['propeller'])[0].rows);
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

  it('packs a buddy and its outfit into the short field friends read', () => {
    expect(encodeBuddy('gator', [])).toBe('gator');
    expect(encodeBuddy('ibis', ['tie', 'propeller', 'sunglasses'])).toBe('ibis.stp');
    expect(encodeBuddy('bulldog', ['cowboy', 'sunglasses', 'tie']).length).toBeLessThanOrEqual(20);
    expect(decodeBuddy('ibis.stp')).toEqual({ kind: 'ibis', wear: ['sunglasses', 'tie', 'propeller'] });
    expect(decodeBuddy('gator')).toEqual({ kind: 'gator', wear: [] });
    expect(decodeBuddy('tomato.zz')).toEqual({ kind: 'gator', wear: [] }); // retired buddy, unknown letters
    expect(decodeBuddy(null)).toEqual({ kind: 'gator', wear: [] });
  });

  it('saves outfits by name: same name replaces, newest first, at most 12', () => {
    let list = saveOutfit([], '  Game day ', 'ibis', ['propeller', 'tie']);
    list = saveOutfit(list, 'Cowboy', 'bulldog', ['cowboy']);
    list = saveOutfit(list, 'game DAY', 'gator', ['sunglasses']);
    expect(list.map((o) => o.name)).toEqual(['game DAY', 'Cowboy']);
    expect(list[0]).toEqual({ name: 'game DAY', kind: 'gator', wear: ['sunglasses'] });
    expect(saveOutfit(list, '   ', 'gator', [])).toEqual(list);
    for (let i = 0; i < 20; i++) list = saveOutfit(list, `Look ${i}`, 'gator', []);
    expect(list).toHaveLength(12);
    expect(list[0].name).toBe('Look 19');
    expect(cleanOutfits([{ name: 'A', kind: 'robot', wear: ['tie', 'x'] }, { name: 'a' }, 'junk', { name: '' }])).toEqual([{ name: 'A', kind: 'gator', wear: ['tie'] }]);
  });
});
