'use client';
import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether a <dialog> is open, following showModal()/close() wherever they're called. Big dialogs render their
 * contents only while open, so the page doesn't build (and keep) thousands of hidden elements at startup.
 */
export function useDialogOpen(ref: RefObject<HTMLDialogElement | null>): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const sync = () => setOpen(d.open);
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(d, { attributes: true, attributeFilter: ['open'] });
    return () => mo.disconnect();
  }, [ref]);
  return open;
}
