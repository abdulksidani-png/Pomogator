import ClientApp from '@/components/ClientApp';

// The weekly report, part of the same app as the timer (a running session keeps going). ?week=YYYY-MM-DD picks a week.
export default function WeeklyPage() {
  return <ClientApp view="weekly" />;
}
