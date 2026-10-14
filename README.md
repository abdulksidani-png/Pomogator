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
| 2 | Supabase: guest and Google/email sign-in, database, sync across devices | Next |
| 3 | Claude API routes for quizzes, plans, day summaries and photo notes, with daily limits | |
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

## Run it on your own computer (optional)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Tests

```bash
npm test            # unit tests for break rules, quiz validation, concepts
npm run test:e2e    # browser tests of the full study → quiz → break loop
```

## How it's built

- **Next.js (App Router) + TypeScript + Tailwind.** The original StudyBuddy styles live in `app/globals.css`.
- **State:** `lib/store.ts` (Zustand). The timer stores an end timestamp and computes time left from it, so it stays accurate across refreshes and sleeping tabs.
- **Pure logic with tests:** `lib/breaks.ts` (break rules), `lib/quiz.ts` (validating AI replies), `lib/context.ts` (topics, missed concepts).
- **Sound:** `lib/sound.ts` synthesizes chimes and ambience with the Web Audio API, so there are no audio files.
- **AI:** the browser calls this site's own `/api/ai/*` routes (`lib/ai-client.ts`). The Claude API key will live only on the server.
- **Fonts** are bundled from npm (`@fontsource`), so nothing loads from Google at runtime.
