'use client';
import dynamic from 'next/dynamic';

// The timer lives entirely in the browser (it reads saved state from this device),
// so it renders on the client only.
const PomoGatorApp = dynamic(() => import('./PomoGatorApp'), {
  ssr: false,
  loading: () => <div className="boot-shell">Loading PomoGator…</div>,
});

export default function ClientApp({ view = 'timer' }: { view?: 'timer' | 'stats' }) {
  return <PomoGatorApp initialView={view} />;
}
