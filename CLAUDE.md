# PomoGator — notes for Claude Code

A Pomodoro study site: 25–45 min study sessions, then a 1–3 question quiz on what you studied.
The score sets the break (3/3 → 15 min, 1/3 → 5 min), every answer gets a memory tip, and a
next-session plan follows. It adds documents with plain-language goals ("up to the Aristotle slide"),
optional screen tracking, sign-in with cloud sync, and appearance customization.

- **Full spec:** `docs/SPEC.md` (the owner's build prompt; sections 5–7 and 9–11 are still to do)
- **Reference prototype:** `docs/reference/studybuddy.html`, the original single-file version.
  Its `window.claude.use("sample")` calls show the intended AI prompts and JSON shapes. Port; don't redesign.
- **Name:** PomoGator (renamed from StudyBuddy on 2026-10-15; the owner is a UF student). Browser storage keys
  (`studybuddy.v1`, `studybuddy.chat`, `studybuddy.spotify`, IndexedDB `studybuddy`) keep the old name on purpose so
  nobody's saved data is lost. `lib/site.ts` holds the public name, tagline and repo URL.
- **Live site:** https://pomo-gator.vercel.app (Vercel project `pomogator`; deploys every push to `main`). The old
  https://studybuddy-bay.vercel.app still points at it. `pomogator.com` was tried and dropped (not bought) on 2026-10-15.
- **Repo:** github.com/abdulksidani-png/Pomogator (renamed from `studybuddy`; GitHub redirects the old URL)
- **Public-facing docs:** `README.md` (for recruiters/visitors), `docs/SETUP.md` (deploy your own, click by click),
  `docs/ARCHITECTURE.md`, `LICENSE` (MIT). Screenshots in `docs/screenshots/` and the link preview
  `app/opengraph-image.png` come from `scripts/screenshots.mjs` (sample data, stand-in AI replies; see its header).

## Working with the owner

- Give setup instructions step by step, with exact clicks and plain words, no jargon.
- Build **one phase at a time**, end each phase with something he can test, and give him a short test checklist.
  **Don't start the next phase until he says the current one works.**
- For SQL, give the raw GitHub link of the migration: he copies everything, pastes it into Supabase → SQL Editor,
  and clicks Run.
- He views the site on Vercel. The footer shows `v<commit>`; when he reports something missing,
  check that version first (stale tabs have happened).
- The repo is public: never commit keys, personal emails or private data; keep README/SETUP/ARCHITECTURE current.

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Next.js port: timer, quiz flow, settings, sounds, themes, tasks (local) | Done |
| 2 | Supabase: guests, email link + Google sign-in, sync across devices | Done |
| 4 | Documents: PDF/PPTX/DOCX/text/photos, outlines, goals, resume point, library | Done |
| 5 | Screen tracking: opt-in, on-device OCR, slide matching, "slides seen" log | Done |
| + | Appearance: themes, accent, clock fonts, timer styles, backgrounds | Done |
| 3 | AI (Gemini free tier): quiz from covered pages, plan, day summary, study assistant, daily limits | Done (confirmed; migration 3 optional) |
| 6 | Stats engine (pure, tested) + Stats page | Built, waiting on his test |
| **7** | **Weekly report** | **Next** |
| 8 | Check-in streaks + celebrations (MyFitnessPal style) | |
| 9 | Polish, export / delete account, full README guide | |

Phase 3 also added the **study assistant** he asked for (`components/Assistant.tsx`, `lib/assistant.ts`): a corner
"Ask PomoGator" button / `A` key opens a chat panel that sees the study panel, timer, to-do list, the selected
document (whole deck if it fits 60k chars) and any lecture transcript. It answers anything, summarizes the document
("Summarize with AI" under the document), quizzes in chat, and proposes to-do lists sized in study sessions
("Plan with AI" on the To-do card); proposals are added only on a click, as "Task · N sessions" text so tasks sync unchanged.
The chat is local only (`studybuddy.chat`).

**Phase 6 (built):** `lib/stats.ts` is pure (`computeStats`, `streakOf` with freezes, `DEFINITIONS` shown as "?" tooltips),
tested in `tests/unit/stats.test.ts` (empty week, skipped quizzes, midnight, 4 AM rollover, time zone change, freezes).
Days come from each session's stored `date`. The Stats page (`components/Stats.tsx`) is the same app at `/stats`
(`app/stats/page.tsx` → `ClientApp view="stats"`; `PomoGatorApp` switches views with `history.pushState`, so a running
timer keeps going and shows as a pill in the header; timer shortcuts only work on the timer view). Charts follow the
dataviz skill: single-series accent columns with hover/focus tooltips + table view, a 12-week one-hue heatmap, accuracy
bars, per-page document coverage (not yet / studied / studied + quizzed).

**Simpler study panel (his request):** "What you're studying" is one topic box (an old `subject` folds into `topic`
on load), the document picker + Upload + manage icon, Start at / Goal, and a compact Share screen row. Level and exam
moved to Settings → Quiz; the notes box and "Add text from a file" are gone (old notes still count, with a Remove link);
a goal from "Apply plan" shows as a removable tag (`#ctxGoal`). No more "Summarize with AI" buttons: every upload is
read by the AI in the background (`lib/ai/digest.ts`, action `digest`): topic, summary, key concepts, sections, saved in
IndexedDB `digest:<id>` (per device; another device reads it again on first open). The digest replaces a file-name topic,
feeds the quiz (`digest.concepts`) and the assistant (`library` of every read document).

**Setup gotchas he hit:** sign-in landing on an old version = Supabase Auth → URL Configuration "Site URL" pointing at an
old immutable Vercel deployment URL; it must be the main address (`https://pomo-gator.vercel.app`), with `/**` entries for
it and for `https://studybuddy-bay.vercel.app` in Redirect URLs. Spotify "redirect_uri: Not matching configuration" = the
app's Redirect URIs must contain exactly `<address>/spotify` for each address used (Settings → Music shows it with a Copy
button). Removing a domain in Vercel → Domains only removes that address; re-add it with Add Existing.

**Buddies, round 2 (built with Phase 6):** Panfer (FIU-style gold panther in a navy jersey, original pixel art; the owner
shared FIU's loading sprite only as a style reference) and the gator is now named Albert. While studying (`focus` mood)
every buddy wears glasses at a desk: gorilla and Panfer write (pencil layer, class `pencil`), Albert and the robot type
on a laptop (`type-a`/`type-b`), the tomato writes. Pixel props are `study` layers in the sprite data. Buddy themes:
`jungle` (gorilla), `gator` (UF orange/blue), `panther` (FIU navy/gold), `robotlab` (robot, Orbitron clock); picking a
theme with a `buddy` also picks that buddy.

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
  shows the tomato only in its theme but any other buddy always; clicking any buddy card sets `mascot: 'on'`, so a
  picked tomato shows in every theme (it's always red/green now, not accent-colored).
- `/api/config` tells the browser which services are on (`lib/config.ts`).

**Built after Phase 6 (his requests, waiting on his test):**
- **Saved timers** (`settings.savedTimers`, `lib/presets.ts`, `components/TimerMenu.tsx`): "My timers" button at the top
  left of the timer card. Saves theme, accent, clock font, timer style, buddy, background/photo, cards, corners, spacing and
  the lengths (`PRESET_KEYS`) under a name (same name replaces; max 12); one click switches; the button shows the matching
  timer's name. Synced with settings. Tested in `tests/unit/presets.test.ts` and `tests/e2e/timer.spec.ts`.
- **Full-screen timer** (`lib/focus.ts`): button at the top right of the timer card or `F`; asks the browser for real full
  screen and falls back to filling the window. `html[data-focus="on"]` hides everything but `#stage` and `#musicCard`
  (CSS turns the music card into a small corner player); "Hide music" / "Show music" (`settings.focusMusic`,
  `data-focus-music="off"`); Esc, `F` or "Exit full screen" leave. The clock is sized in `cqi` of `.clock-col` so it fits
  beside the buddy with any font (`--clock-ch` per font, like the ring).
- **Fold-away plan card**: click the "Next-session plan" heading; `settings.folded` (ids) remembers it; CSS
  `grid-template-rows` 0fr↔1fr transition (no rAF, so tests with a fake clock aren't affected); the body is `inert` when shut.

**Public launch (2026-10-15):** rename to PomoGator (logo `components/Brand.tsx` + `app/icon.svg`: a gator peeking
out of the water inside the timer ring; "Gator" in the accent color), Albert the gator is the default buddy for new
visitors, `/privacy` page (plain words: what's stored, Gemini free tier may use content, on-device OCR/audio), footer
links (Privacy, Source), security headers in `next.config.ts`, the AI route returns only error codes (Google's text stays
in the server log), visitor-facing AI errors no longer mention env vars, `.github/workflows/ci.yml` (typecheck, unit,
build, both Playwright suites), and the clock sizes itself with container units in every view (`--clock-size`,
`--clock-ch`, `--clock-side`), which fixed the Robot lab digits overflowing on phones.

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
- Next.js 15 App Router and React 19. The app is client-only: `components/ClientApp.tsx` loads `PomoGatorApp` with `ssr:false`.
  `app/privacy/page.tsx` is a plain server-rendered page.
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
  - `PomoGatorApp.tsx`: layout, dialogs, Start/consent wiring, footer
  - `Brand.tsx`: logo mark and name
  - `Stage.tsx`: timer and quiz
  - `Panels.tsx`: context, tasks, today, plan
  - `Documents.tsx`
  - `Dialogs.tsx`: settings, help
  - `Account.tsx`
  - `Assistant.tsx`: chat panel, corner button, reply formatting
  - `Music.tsx` (Spotify widget), `PhotoPicker.tsx` (Unsplash), `Mascot.tsx` (all buddies), `Stats.tsx` (Stats page)
  - `TimerMenu.tsx` (saved timers menu)
- `supabase/migrations/`: `…000000_core.sql`, `…010000_documents.sql`, `20261015000000_ai_usage.sql`. RLS restricts every table to
  `user_id = (select auth.uid())`. The owner pastes migrations into the SQL Editor by hand.

## Commands
```bash
npm run dev          # http://localhost:3000 (copies vendor files first)
npm run typecheck
npm test             # Vitest unit tests (79)
npm run test:e2e     # Playwright: loop, documents, goals, screen tracking, tab sound, sounds, appearance, buddies, stats,
                     # saved timers, full screen, plan fold
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
