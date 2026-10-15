import type { Metadata, Viewport } from 'next';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/martian-mono';
import '@fontsource/bebas-neue';
import '@fontsource/dm-serif-display';
import '@fontsource-variable/orbitron';
import '@fontsource-variable/caveat';
import './globals.css';

const description = 'A Pomodoro study timer that quizzes you on what you studied, sets your break from your score, and plans your next session.';

export const metadata: Metadata = {
  title: 'PomoGator',
  applicationName: 'PomoGator',
  description,
  openGraph: { title: 'PomoGator: study, quiz yourself, earn your break', description, type: 'website', siteName: 'PomoGator' },
  twitter: { card: 'summary_large_image', title: 'PomoGator', description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F5FA' },
    { media: '(prefers-color-scheme: dark)', color: '#131C19' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
