# StudyBuddy — notes for Claude Code

A Pomodoro study site: 25–45 min study sessions, then a 1–3 question quiz on what you studied.
The score sets the break (3/3 → 15 min, 1/3 → 5 min), every answer gets a memory tip, and a
next-session plan follows. It adds documents with plain-language goals ("up to the Aristotle slide"),
optional screen tracking, sign-in with cloud sync, and appearance customization.

- **Full spec:** `docs/SPEC.md` (the owner's build prompt; sections 5–7 and 9–11 are still to do)
- **Reference prototype:** `docs/reference/studybuddy.html`, the original single-file version.
  Its `window.claude.use("sample")` calls show the intended AI prompts and JSON shapes. Port; don't redesign.
- **Live site:** https://studybuddy-bay.vercel.app (Vercel deploys every push to `main`)
- **Repo:** github.com/abdulksidani-png/studybuddy

## Working with the owner

- He's a beginner. Give step-by-step setup instructions with exact clicks and plain words, with no jargon.
- Build **one phase at a time**, end each phase with something he can test, and give him a short test checklist.
  **Don't start the next phase until he says the current one works.**
- He can't run SQL from a file path: tell him to open the raw GitHub link, copy everything,
  paste it into Supabase → SQL Editor, and click Run.
- He views the site on Vercel. The footer shows `v<commit>`; when he reports something missing,
  check that version first (stale tabs have happened).

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Next.js port: timer, quiz flow, settings, sounds, themes, tasks (local) | Done |
| 2 | Supabase: guests, email link + Google sign-in, sync across devices | Done |
| 4 | Documents: PDF/PPTX/DOCX/text/photos, outlines, goals, resume point, library | Done |
| 5 | Screen tracking: opt-in, on-device OCR, slide matching, "slides seen" log | Done |
| + | Appearance: themes, accent, clock fonts, timer styles, backgrounds | Done |
| 3 | AI (Gemini free tier): quiz from covered pages, plan, day summary, study assistant, daily limits | Done (confirmed; migration 3 optional) |
| **6** | **Stats engine (pure, tested) + Stats page** | **Next** |
| 7 | Weekly report | |
| 8 | Check-in streaks + celebrations (MyFitnessPal style) | |
| 9 | Polish, export / delete account, full README guide | |

Phase 3 also added the **study assistant** he asked for (`components/Assistant.tsx`, `lib/assistant.ts`): a corner
"Ask StudyBuddy" button / `A` key opens a chat panel that sees the study panel, timer, to-do list, the selected
document (whole deck if it fits 60k chars) and any lecture transcript. It answers anything, summarizes the document
("Summarize with AI" under the document), quizzes in chat, and proposes to-do lists sized in study sessions
("Plan with AI" on the To-do card); proposals are added only on a click, as "Task · N sessions" text so tasks sync unchanged.
The chat is local only (`studybuddy.chat`).

Then (he confirmed these work on the live site, 2026-10-15):
- **Unsplash backgrounds** (`UNSPLASH_ACCESS_KEY`): Appearance → Photo backgrounds, by mood chip or search, "New photo every
  day" (`bgDaily`), credit in the footer (`PhotoCredit`, UTM links), download tracking on choose. Server routes
  `/api/unsplash/{search,random,track}` (`lib/unsplash-server.ts`), cached with `s-maxage` (demo keys get 50 calls/hour).
  Photos are `settings.bgPhoto` (synced), always hotlinked from Unsplash, sized with `photoUrl()`.
- **Glass cards** (`cardStyle`), and `--bg-photo-color` while a photo loads.
- **Spotify widget** (`SPOTIFY_CLIENT_ID`, public): `lib/spotify.ts` does PKCE sign-in in the browser (no secret), tokens in
  localStorage `studybuddy.spotify`, return page `app/spotify/page.tsx` (redirect URI `<origin>/spotify`, must be in the
  Spotify app). `components/Music.tsx` polls `/me/player` every 5 s while visible; play/pause/next/previous need Premium
  (403 → plain message); 404 = no active device. Spotify's 2026 dev-mode rules: the app owner needs Premium and only
  accounts added under User Management (max 5) can connect.
- **Study buddies** (`mascotKind`): tomato, robot (vector, accent-colored lights), and 2-bit pixel gorilla and UF-colored
  gator (sprites + per-mood pixel overlays in `components/Mascot.tsx`; original designs, not UF's logo). "Automatic"
  shows the tomato only in its theme but any other picked buddy always.
- `/api/config` tells the browser which services are on (`lib/config.ts`).

Earlier requests, all done and confirmed:
- sign out (Settings → Account, avatar menu), more file types, screen-share button under "Study material", appearance options
- faster screen tracking (checks every 2 s by default, `screenSec` 1–15)
- "Also capture the tab's sound": tab audio → on-device Whisper → `session.heard` (sent to the quiz as `heard`)
- start/pause/resume sounds (`controlSounds`, `Sound.cue`)
- "Finish session now" always goes to the quiz, even early (a skip or an expired short session still doesn't)
- Start never asks to share the screen; sharing only starts from its own button
- Motion animations (`motion` package; he asked for `motion-v`, which is the Vue version)

### Where the build differs from the spec (on purpose)
- **Outlines** come from the file itself (PPTX slide titles, PDF largest text, DOCX headings) rather than `/api/ai/outline`.
  Phase 3 may add AI summaries and key concepts on top.
- **Screen tracking** reads frames with on-device Tesseract OCR and IDF word matching (`lib/docs/match.ts`) rather than
  sending frames to Claude. `/api/ai/frame` could be a fallback when the match isn't confident.
- **Tab sound** is transcribed on the device: `lib/docs/listen.ts` taps the shared stream with an AudioWorklet,
  cuts 12 s clips (silent ones skipped), and `public/asr-worker.js` runs Whisper tiny.en with Transformers.js loaded from
  jsDelivr (the npm package pulls in onnxruntime-node, whose install script downloads binaries). The model (~40 MB) comes
  from Hugging Face once and the browser caches it. The transcript lives only on the live session and is dropped from history.
- **AI provider is Google Gemini, not Claude**: the owner chose Gemini's free tier to pay nothing (key from Google AI Studio,
  stored in Vercel as `GEMINI_API_KEY`, no billing enabled). Keep the reference prototype's prompts and JSON shapes; use
  Gemini's JSON output mode. Free-tier limits are per project and shown only in AI Studio, so handle 429s gracefully
  ("quiz limit reached for today, enjoy a no-quiz break") and keep the app's own daily limits.
- **AI routes**: `app/api/ai/[action]/route.ts` handles `quiz`, `plan`, `day-summary` and `assistant`; prompts in
  `lib/ai/prompts.ts` (ported from the prototype), Gemini REST calls in `lib/ai/gemini.ts` (JSON mode, one retry on bad JSON,
  falls back from `gemini-flash-latest` to `gemini-flash-lite-latest` on 429/404; override with `GEMINI_MODEL(_BACKUP)`),
  replies validated with `lib/quiz.ts` on the server and again in the browser. Daily allowance: `lib/ai/quota.ts` +
  migration 3 (`ai_usage`, `use_ai()`): guests 40 calls/day, accounts 150 (`AI_DAILY_LIMIT_GUEST/USER`); skipped without
  Supabase or before migration 3 is run. Not built yet: `/api/ai/read-image` (photos still use on-device OCR), `/goal`
  (goals map locally), `/outline`, `/frame`, `/weekly`.
- **Quizzes from documents**: `quizPages()` in the store picks start page → furthest slide seen on screen, else the goal
  (else 10 pages); `sourcesKey()` (pages + transcript size) joins `ctxKey` in deciding when a quiz must be rewritten, so
  the end of a session rewrites it if screen tracking or the lecture transcript changed what was covered.

## Stack
- Next.js 15 App Router and React 19. The app is client-only: `components/ClientApp.tsx` loads `StudyBuddyApp` with `ssr:false`.
- TypeScript, Tailwind 4, and hand-written CSS in `app/globals.css`, unlayered.
- Zustand 5 with persist + immer (`lib/store.ts`, localStorage key `studybuddy.v1`). The timer works from timestamps (`endAt`).
- Supabase (`@supabase/ssr`): anonymous guests are upgraded in place with `linkIdentity` / `updateUser(email)`.
  `/auth/callback` route; `middleware.ts` refreshes the session.
- Docs: pdfjs-dist, jszip (PPTX), mammoth (DOCX), Tesseract.js. All are self-hosted and copied to
  `public/vendor` by `scripts/copy-vendor.mjs`, which runs on predev/prebuild. `public/vendor` is gitignored.

## Map
- `lib/store.ts`: all state and actions (sessions, quiz, docs, progress).
- `lib/types.ts`, `lib/defaults.ts`.
- `lib/sync.ts`, `lib/sync-map.ts`: sync engine. Settings, context, app and tasks are versioned slices where the newest wins.
  Version numbers only go up (`next(k)`), so a device with a fast clock can't make other devices' edits look old.
  Sessions, attempts and events merge by id. It falls back gracefully if migration 2 hasn't been run.
- `lib/docs/`:
  - `parse.ts`: file → pages
  - `library.ts`: import, pages cache (memory → IndexedDB → server), delete
  - `match.ts`: goals, screen matching, change detection
  - `ocr.ts`, `screen.ts`, `listen.ts` (tab sound → text)
- `lib/ai/`: `prompts.ts`, `gemini.ts` and `quota.ts` (server), `material.ts` (document excerpts, browser).
- `lib/appearance.ts` + `components/Appearance.tsx`: look settings, applied as data attributes on `<html>`.
- `components/`:
  - `StudyBuddyApp.tsx`: layout, dialogs, Start/consent wiring
  - `Stage.tsx`: timer and quiz
  - `Panels.tsx`: context, tasks, today, plan
  - `Documents.tsx`
  - `Dialogs.tsx`: settings, help
  - `Account.tsx`
  - `Assistant.tsx`: chat panel, corner button, reply formatting
  - `Music.tsx` (Spotify widget), `PhotoPicker.tsx` (Unsplash), `Mascot.tsx` (all buddies)
- `supabase/migrations/`: `…000000_core.sql`, `…010000_documents.sql`, `20261015000000_ai_usage.sql`. RLS restricts every table to
  `user_id = (select auth.uid())`. The owner pastes migrations into the SQL Editor by hand.

## Commands
```bash
npm run dev          # http://localhost:3000 (copies vendor files first)
npm run typecheck
npm test             # Vitest unit tests (55)
npm run test:e2e     # Playwright: loop, documents, goals, screen tracking, tab sound, sounds, appearance
npm run test:ai      # Playwright: AI, Unsplash and Spotify against stand-ins (tests/fake-gemini; Spotify faked in-test)
npm run test:sync    # two-device sync: needs local Postgres + PostgREST (PGHOST/PGPORT/PGUSER, POSTGREST_BIN)
```
`tests/fake-supabase/server.mjs` runs the real migrations on Postgres behind PostgREST, with a fake auth server.
`FAKE_MIGRATIONS=1` applies only migration 1, to test the legacy fallback. `tests/db/rls-check.sql` checks RLS.

## Gotchas
- A Zustand selector must never return a fresh `[]` or `{}`: that re-renders forever (React #185). Use a shared constant like `NO_EVENTS`.
- Custom class names can collide with Tailwind utilities, which already caused trouble with `.ring` and `.outline`.
  Use specific names like `.timer-ring` or `.doc-outline`.
- Screen tracking may start before a session. It stops when a live session ends, and it only reads frames while studying.
- Animations use `motion/react` with shared timings in `components/motion.ts`. Don't put an exit step (`AnimatePresence`)
  in front of something the user must reach, like the quiz face: exits stall when rAF stops (a background tab, or
  Playwright's fake clock), so the next screen never mounts. Enter-only (a keyed `motion.div` with `initial`) is safe.
- Playwright reuses a server already running on its port. Kill stale `next` processes first, and don't `pkill -f`
  a pattern that appears in your own command.
- Commits: write clear messages and push to `main`. Vercel deploys automatically.
