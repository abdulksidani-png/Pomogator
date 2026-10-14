# StudyBuddy

A Pomodoro study timer that quizzes you on what you studied, sets your break from your score, and plans your next session.

- Study for 25–45 minutes on a topic you choose (and your notes, if you paste them).
- When the timer ends, answer 1–3 multiple-choice questions. Every answer shows an explanation and a memory aid.
- Your score sets your break: 3/3 → 15 min, 2/3 → 10 min, 1/3 or 0/3 → 5 min. Every 4th session ends in a long break.
- During the break you get a plan for the next session.

## Build status

| Phase | What it adds | Status |
| --- | --- | --- |
| 1 | Next.js app: timer, quiz flow, settings, sounds, themes, tasks, saved on this device | **Done** |
| 2 | Supabase: guest and Google/email sign-in, database, sync across devices | **Done** |
| 3 | Claude API routes for quizzes, plans, day summaries and photo notes, with daily limits | Next |
| 4 | Document upload, outlines, plain-language goals ("up to the Aristotle slide"), resume point | |
| 5 | Optional screen monitoring that tracks which slide you're on | |
| 6 | Stats engine and Stats page | |
| 7 | Weekly report | |
| 8 | Check-in streaks and celebrations | |
| 9 | Polish, export/delete account, full setup guide | |

Until Phase 3, the timer, breaks, tasks and settings all work. Quizzes show "not switched on yet" and you get the no-quiz break.

## Put it online with Vercel (free)

1. Go to **vercel.com/signup** and choose **Continue with GitHub**.
2. Click **Add New… → Project**.
3. Under **Import Git Repository**, find **studybuddy** and click **Import**.
   If it isn't listed, click **Adjust GitHub App Permissions**, give Vercel access to the `studybuddy` repo, and come back.
4. Leave every setting as it is (Vercel detects Next.js) and click **Deploy**.
5. After a minute or two, click the preview image or **Continue to Dashboard → Visit**. Your site is at an address like `studybuddy-xxxx.vercel.app`.

Every time new code is pushed to GitHub, Vercel rebuilds the site automatically.

## Turn on sign-in and sync (Supabase, free)

Without these steps the site still works, saving everything on each device.

### A. Create the Supabase project
1. Go to **supabase.com**, click **Start your project**, and sign in with GitHub.
2. Click **New project**. Name it `studybuddy`, click **Generate a password** (save it somewhere safe), pick the region closest to you, and click **Create new project**. Wait a minute or two.

### B. Create the tables
3. In the left sidebar, open **SQL Editor** and click **+ New query**.
4. Open [`supabase/migrations/20261014000000_core.sql`](supabase/migrations/20261014000000_core.sql) on GitHub, click **Raw**, copy everything, paste it into the editor, and click **Run**. You should see "Success. No rows returned".

### C. Switch on the sign-in options
5. Go to **Authentication → Sign In / Providers**. Under *User Signups*, turn on **Allow anonymous sign-ins** (this is how guests work) and **Allow manual linking** (this is how a guest keeps their data when they sign in). Click **Save**. Email sign-in is on by default.
6. Go to **Authentication → URL Configuration**:
   - **Site URL**: your Vercel address, e.g. `https://studybuddy-xxxx.vercel.app`
   - **Redirect URLs** → **Add URL**: `https://studybuddy-xxxx.vercel.app/**`, then add `http://localhost:3000/**`
   - Click **Save**.

### D. Give Vercel the keys
7. In Supabase, click **Connect** at the top of the project (or **Project Settings → API Keys**). Copy the **Project URL** and the **Publishable key** (starts with `sb_publishable_`; older projects call it the `anon` `public` key).
8. In Vercel, open your project → **Settings → Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the Publishable key
9. Go to **Deployments**, click **⋯** on the newest one, and choose **Redeploy**. (The keys are built into the site, so it needs a fresh build.)

### E. Google sign-in (optional; email links work without it)
10. Go to **console.cloud.google.com**, open the project picker at the top, click **New project**, name it `StudyBuddy`, and select it.
11. Search for **Google Auth Platform** and click **Get started**. App name `StudyBuddy`, your email as support email, Audience **External**, your email as contact, then **Create**.
12. Open **Clients → Create client**. Type **Web application**. Under **Authorized redirect URIs**, add the *Callback URL* shown in Supabase under **Authentication → Sign In / Providers → Google** (it looks like `https://your-project-ref.supabase.co/auth/v1/callback`). Click **Create** and copy the **Client ID** and **Client secret**.
13. Back in Supabase, open **Authentication → Sign In / Providers → Google**, switch it on, paste the Client ID and secret, and **Save**.
14. In Google Auth Platform, open **Audience** and click **Publish app**, so anyone with a Google account can sign in (otherwise only test users you add can).

Good to know: Supabase's built-in email service only sends a few emails per hour, which is fine while testing. Open a sign-in link in the same browser you requested it from.

## Run it on your own computer (optional)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase keys (optional)
npm run dev
```

Then open http://localhost:3000.

## Tests

```bash
npm test            # unit tests: break rules, quiz validation, dates, sync merging
npm run test:e2e    # browser tests of the full study → quiz → break loop
npm run test:sync   # two-device sync tests (needs PostgreSQL and PostgREST, see below)
```

The sync tests run the real migrations on a local PostgreSQL, serve them with
[PostgREST](https://postgrest.org) (what Supabase uses), and fake Supabase's sign-in service
(`tests/fake-supabase/server.mjs`). Set `PGHOST`, `PGPORT`, `PGUSER` and `POSTGREST_BIN`.
`tests/db/rls-check.sql` checks that no user can read or change another user's rows.

## How it's built

- **Next.js (App Router) + TypeScript + Tailwind.** The original StudyBuddy styles live in `app/globals.css`.
- **State:** `lib/store.ts` (Zustand). The timer stores an end timestamp and computes time left from it, so it stays accurate across refreshes and sleeping tabs.
- **Pure logic with tests:** `lib/breaks.ts` (break rules), `lib/quiz.ts` (validating AI replies), `lib/context.ts` (topics, missed concepts).
- **Sound:** `lib/sound.ts` synthesizes chimes and ambience with the Web Audio API, so there are no audio files.
- **Accounts and sync:** `lib/sync.ts`. Guests are anonymous Supabase users; signing in links Google or an email to the same user, so nothing moves. Settings, the study panel, the running timer and tasks sync as versioned slices (newest wins); finished sessions merge by id. Every table has Row Level Security (`supabase/migrations`).
- **AI:** the browser calls this site's own `/api/ai/*` routes (`lib/ai-client.ts`). The Claude API key will live only on the server.
- **Fonts** are bundled from npm (`@fontsource`), so nothing loads from Google at runtime.
