# Run your own PomoGator

Everything here uses free tiers. Each service is optional: without any keys the site still works and saves
everything in the visitor's browser. Steps are written click by click.

- [1. Put it online with Vercel](#1-put-it-online-with-vercel)
- [2. Accounts and sync with Supabase](#2-accounts-and-sync-with-supabase)
- [3. AI quizzes with Gemini](#3-ai-quizzes-with-gemini)
- [4. Photo backgrounds with Unsplash](#4-photo-backgrounds-with-unsplash)
- [5. The Spotify widget](#5-the-spotify-widget)
- [What it costs](#what-it-costs)
- [Run it on your own computer](#run-it-on-your-own-computer)
- [Troubleshooting](#troubleshooting)

Throughout, `https://YOUR-SITE.vercel.app` means your site's address.

## 1. Put it online with Vercel

1. Fork this repository on GitHub (or push your own copy).
2. Go to **vercel.com/signup** and choose **Continue with GitHub**.
3. Click **Add New… → Project**, find the repository under **Import Git Repository** and click **Import**.
   If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to it.
4. Leave every setting as it is (Vercel detects Next.js) and click **Deploy**.
5. To pick a nicer address, open the project → **Settings → Domains**, click **Add**, type for example
   `yourname-pomogator.vercel.app`, and save.

Every push to the main branch redeploys the site. After adding or changing an environment variable, open
**Deployments**, click **⋯** on the newest one and choose **Redeploy**.

## 2. Accounts and sync with Supabase

### Create the project and tables
1. Go to **supabase.com** → **Start your project** → sign in with GitHub → **New project**. Name it, click
   **Generate a password** (keep it somewhere safe), pick the closest region, and click **Create new project**.
2. Open **SQL Editor → + New query**. For each file below, open it on GitHub, click **Raw**, copy everything, paste it
   into the editor and click **Run** (you should see "Success. No rows returned"):
   1. [`supabase/migrations/20261014000000_core.sql`](../supabase/migrations/20261014000000_core.sql): profiles, tasks, sessions, quiz answers, plans
   2. [`supabase/migrations/20261014010000_documents.sql`](../supabase/migrations/20261014010000_documents.sql): documents, pages, progress, private file storage
   3. [`supabase/migrations/20261015000000_ai_usage.sql`](../supabase/migrations/20261015000000_ai_usage.sql): the daily AI allowance (strongly recommended on a public site)
   4. [`supabase/migrations/20261016000000_friends.sql`](../supabase/migrations/20261016000000_friends.sql): "Delete my account", friends, support messages and studying together

   Each file is safe to run again. If a feature says it "isn't switched on for this site yet", the file it needs
   hasn't been run.

### Switch on sign-in
3. **Authentication → Sign In / Providers**: under *User Signups*, turn on **Allow anonymous sign-ins** (how guests
   work) and **Allow manual linking** (how a guest keeps their data when they sign in). Click **Save**.
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR-SITE.vercel.app`. Use your main address, not a long deployment address like
     `your-project-abc123.vercel.app`, or sign-in will land on an old version.
   - **Redirect URLs** → **Add URL**: `https://YOUR-SITE.vercel.app/**`, and `http://localhost:3000/**` for local runs.

### Give Vercel the keys
5. In Supabase, click **Connect** (or **Project Settings → API Keys**) and copy the **Project URL** and the
   **Publishable key** (`sb_publishable_…`; older projects call it the `anon` key).
6. In Vercel: **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then redeploy. These two are meant to be public; row-level security is what
   protects each account's data. Never put the `service_role` / secret key anywhere in this project.

### Google sign-in (optional; email links work without it)
7. Go to **console.cloud.google.com**, create a project, search for **Google Auth Platform** and click **Get started**
   (Audience: **External**).
8. **Clients → Create client → Web application.** Under **Authorized redirect URIs**, paste the *Callback URL* shown in
   Supabase under **Authentication → Sign In / Providers → Google**. Click **Create**, then copy the Client ID and secret
   into that Supabase page and **Save**.
9. In Google Auth Platform → **Audience**, click **Publish app** so anyone with a Google account can sign in.

Supabase's built-in email service sends only a few emails per hour, which is fine for a small site. For more, add your
own SMTP server under **Authentication → Emails**.

## 3. AI quizzes with Gemini

1. Go to **aistudio.google.com**, sign in, and click **Get API key → Create API key**. Don't link billing if you want
   to stay free.
2. In Vercel, add `GEMINI_API_KEY` with that key (server only: never prefix it with `NEXT_PUBLIC_`) and redeploy.

The free tier has per-minute and per-day limits. PomoGator falls back to a lighter model when the main one is busy, and
with migration 3 each person gets a daily allowance (`AI_DAILY_LIMIT_GUEST`, default 40; `AI_DAILY_LIMIT_USER`,
default 150). On the free tier Google may use what it receives to improve its products, which the site's privacy page
tells visitors.

## 4. Photo backgrounds with Unsplash

1. Go to **unsplash.com/developers → Your apps → New Application**, accept the guidelines, and name it (for example
   `PomoGator`).
2. Copy the **Access Key** into Vercel as `UNSPLASH_ACCESS_KEY` and redeploy.

New Unsplash apps are in demo mode (50 requests an hour; PomoGator caches results to stay under it). For a public site,
click **Apply for production** on the app page. PomoGator already credits photographers and reports downloads the way
Unsplash requires.

## 5. The Spotify widget

1. Go to **developer.spotify.com/dashboard → Create app**. Under **Redirect URIs**, add exactly
   `https://YOUR-SITE.vercel.app/spotify` (and `http://127.0.0.1:3000/spotify` for local runs). Tick **Web API** and save.
2. Copy the **Client ID** into Vercel as `SPOTIFY_CLIENT_ID` and redeploy. There is no secret: sign-in uses PKCE.

Spotify's development mode allows only accounts added under **User Management** (up to 5), and the app owner needs
Premium. Play, pause and skip also need Premium; showing what's playing works on any plan.

## What it costs

Nothing, on these free plans, for a personal or class-sized site:

| Service | Free plan | Worth knowing |
| --- | --- | --- |
| Vercel (Hobby) | Hosting, a `vercel.app` address, automatic deploys | For personal, non-commercial projects. |
| Supabase (Free) | 500 MB database, 1 GB file storage, 50,000 monthly active users | A project with no activity for 7 days is paused; open the dashboard and click **Restore**. |
| Gemini API (free tier) | A daily number of requests per model, shown in AI Studio → **Usage** | No card needed. Google may use free-tier requests to improve its products. |
| Unsplash | 50 requests an hour (demo), 5,000 after approval | PomoGator caches photo searches. |
| Spotify | Free for developers | Development mode: up to 5 listed accounts. |

**How much AI one study session uses:** about 2–3 Gemini requests: one to write the quiz (sometimes a second, when what
you covered changed near the end), and one for the next-session plan. Other things that use one request each: reading an
uploaded document, each message to the study assistant, "Plan my next session", the end-of-day summary, and the weekly
report (once a week). Divide your daily free requests (AI Studio → **Usage**) by about 3 to see roughly how many
sessions a day the whole site can serve; the per-person allowance from migration 3 stops one visitor from using it all.
When the free limit is reached, quizzes politely skip and the timer keeps working.

## Run it on your own computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env.local   # optional: fill in any keys you want to use
npm run dev                  # http://localhost:3000
```

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Signing in lands on an older version of the site | Supabase → Authentication → URL Configuration → **Site URL** must be your main address. |
| Spotify says "redirect_uri: Not matching configuration" | The Redirect URI in the Spotify app must match `https://YOUR-SITE.vercel.app/spotify` exactly. PomoGator shows the exact address under Settings → Music. |
| "Quizzes aren't switched on yet" | `GEMINI_API_KEY` is missing, or the site wasn't redeployed after adding it. |
| The footer mentions documents not syncing | Run migration 2 (`…010000_documents.sql`). |
| "Deleting accounts isn't switched on" or Friends says it isn't set up | Run migration 4 (`20261016000000_friends.sql`). |
| Sign-in links stop arriving | Supabase's built-in email sends only a few an hour. Wait, or add your own SMTP under Authentication → Emails. |
| The site loads but nothing saves to the account after a quiet week | The free Supabase project was paused. Supabase dashboard → your project → **Restore**. |
| The footer shows a different version than expected | The footer's `v1234abc` is the deployed commit; refresh the tab if it's old. |
