'use client';
import dynamic from 'next/dynamic';
import { Splash } from './Splash';

// The timer lives entirely in the browser (it reads saved state from this device),
// so it renders on the client only.
const PomoGatorApp = dynamic(() => import('./PomoGatorApp'), {
  ssr: false,
  loading: () => null, // the splash screen covers loading
});

export default function ClientApp({ view = 'timer' }: { view?: 'timer' | 'stats' | 'weekly' }) {
  return <><Splash /><PomoGatorApp initialView={view} /></>;
}
