'use client';
import { useState } from 'react';
import { BrandMark } from './Brand';
import { SITE } from '@/lib/site';

/**
 * The loading screen: the pixel logo fills its timer ring while the app loads, then the whole screen fades away.
 * It's part of the first HTML, so it shows before any JavaScript runs. The app sets `data-ready` on <html> when it
 * has mounted (see PomoGatorApp); CSS then fades this out, so no timer is needed and clicks always pass through.
 * Once the fade has finished it leaves the page, so its looping animations stop costing anything.
 */
export function Splash() {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className="splash" role="status" aria-label={`Loading ${SITE.name}`}
      onAnimationEnd={(e) => { if (e.animationName === 'splash-out' && e.target === e.currentTarget) setGone(true); }}>
      <div className="splash-inner">
        <BrandMark className="splash-mark" animated />
        <p className="splash-name">Pomo<span>Gator</span></p>
        <p className="splash-tag">{SITE.tagline}</p>
        <span className="splash-bar" aria-hidden="true"><span /></span>
      </div>
    </div>
  );
}
