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

const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://pomo-gator.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'PomoGator',
  applicationName: 'PomoGator',
  description,
  openGraph: { title: 'PomoGator: study, quiz yourself, earn your break', description, type: 'website', siteName: 'PomoGator' },
  twitter: { card: 'summary_large_image', title: 'PomoGator', description },
};

// New visitors start on the gator theme (the default look), so the loading screen is blue and orange for them too.
const EARLY_THEME = `try{var e=document.documentElement;var s=JSON.parse(localStorage.getItem('studybuddy.v1')||'{}').state;s=s&&s.settings;var k=s&&s.skin?s.skin:'gator';if(k!=='auto')e.dataset.skin=k;if(!s)e.dataset.bg='dots';if(s&&/^#[0-9a-f]{6}$/i.test(s.accent||''))e.style.setProperty('--accent',s.accent)}catch(_){}`;

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
      <head>
        {/* Put the saved theme and accent on the page before it paints, so the loading screen and first frame match it. */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
