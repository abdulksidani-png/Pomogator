import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Privacy · ${SITE.name}`, description: `What ${SITE.name} stores, where it goes, and who can see it.` };

/** A plain-words privacy note: what is kept, where, and which outside services see what. */
export default function Privacy() {
  return (
    <main className="doc-page">
      <p><a href="/">← Back to the timer</a></p>
      <h1>Privacy</h1>
      <p className="lede">{SITE.name} is a study timer, not an ad business. There are no ads, no analytics and no tracking cookies.</p>

      <h2>If you don&apos;t sign in</h2>
      <p>Your settings, tasks, study history and uploaded documents stay in this browser (local storage and IndexedDB).
        A sign-in cookie is the only cookie, and only once sign-in is used.</p>

      <h2>If you sign in, or study as a guest</h2>
      <p>Your study data syncs to a database hosted by <a href="https://supabase.com">Supabase</a>: settings, tasks, study sessions,
        quiz answers, plans, and the text and files of documents you upload. Every table and the file storage use row-level
        security, so each account can only read and change its own rows. Your email address is used only to sign you in.</p>
      <p>Settings → Clear history deletes your study history on every device, and each document can be deleted from your
        documents list. A one-click &ldquo;delete my account&rdquo; is on the roadmap.</p>

      <h2>AI features</h2>
      <p>Quizzes, plans, document summaries and the study assistant are written by Google&apos;s Gemini API. When you use them, this
        site&apos;s server sends Gemini what the request needs: your topic, the pages you covered, your chat messages, any lecture
        notes captured from a shared tab, and your week's study numbers for the weekly report. The site uses Gemini&apos;s free tier, under which Google may use what it receives to improve
        its products, so don&apos;t upload anything private or sensitive. The API key stays on the server.</p>

      <h2>Screen sharing and lecture sound</h2>
      <p>Screen tracking and lecture transcription run entirely on your device. Frames are read on the device and only the slide
        number, title and confidence are kept; the lecture transcript lives only on the current session and is used for its quiz.</p>

      <h2>Photos and music</h2>
      <p>Background photos load directly from <a href="https://unsplash.com">Unsplash</a>. If you connect
        Spotify, your Spotify sign-in stays in this browser and the page talks to Spotify directly; {SITE.name}&apos;s server never sees it.</p>

      <h2>Hosting</h2>
      <p>The site runs on <a href="https://vercel.com">Vercel</a>, which keeps standard server logs.
        The code is open source on <a href={SITE.repo}>GitHub</a>.</p>
    </main>
  );
}
