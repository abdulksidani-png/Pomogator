/** Shared motion settings, so every animation on the site moves the same way. */
import type { Transition } from 'motion/react';

/** A quick ease-out that settles softly. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const SOFT: Transition = { duration: 0.32, ease: EASE };
