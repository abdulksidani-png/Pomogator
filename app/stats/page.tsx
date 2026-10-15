import ClientApp from '@/components/ClientApp';

// The Stats page shares the app with the timer, so a running session keeps going while you look.
export default function StatsPage() {
  return <ClientApp view="stats" />;
}
