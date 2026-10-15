> **About this file:** the original product spec for PomoGator (then called StudyBuddy), written as a build brief
> for an AI pair programmer. Where the finished app deliberately differs (for example Google Gemini instead of Claude,
> and on-device OCR for screen tracking), see [ARCHITECTURE.md](ARCHITECTURE.md) and the project notes in `CLAUDE.md`.

You are a senior full-stack engineer and product designer. Build StudyBuddy as a real website I can deploy and share, with sign-in, cloud sync, document upload, optional screen monitoring, progress stats, weekly reports and streaks.

I've attached studybuddy.html, a working single-file version that runs inside Claude. Use it as the reference for features, layout, wording and behavior. Port it; don't redesign it. It calls Claude through `window.claude.use("sample")`, which only exists inside Claude. Replace every one of those calls with your own server API routes.

## How to work with me
I'm a student, not a professional developer.
- Before writing code:
  - Restate the plan in your own words.
  - Confirm the build phases.
  - List every account or key I need to create.
- Then build one phase at a time. After each phase, give me:
  - the exact commands to run
  - what to click to test it
  - what I should see
- Don't move to the next phase until I say the current one works.
- When something needs setup outside the code (Supabase, Google, Vercel), give me click-by-click steps.

---

## 0. Stack (already decided)
- **App:** Next.js (App Router), TypeScript, Tailwind.
- **Supabase:** sign-in, Postgres database and private file storage.
- **Claude (Anthropic API):** called only from server routes using the official TypeScript SDK. The API key never reaches the browser. Set the models in environment variables:
  - `MODEL_MAIN=claude-sonnet-5-5` for quizzes, plans, outlines and reports
  - `MODEL_FAST=claude-haiku-5-5` for reading screen frames
- **AI replies:** ask Claude for JSON matching a schema (tool use or structured output). Validate every reply with Zod. If a reply doesn't match, retry once on the server, then fail gracefully.
- **Hosting:** Vercel. Its HTTPS is required for screen capture.
- **Tests:** Vitest for unit tests, and one Playwright end-to-end test of the main loop.
- **Environment variables:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server only, only if truly needed)
  - `ANTHROPIC_API_KEY`
  - `MODEL_MAIN`, `MODEL_FAST`
  - `AI_DAILY_LIMIT_USER` (default 80)
  - `AI_DAILY_LIMIT_GUEST` (default 10)

## 1. Sign-in and accounts
- **Guest mode:** the app works without an account. Use Supabase anonymous sign-in for guests, so guest data lives in the same tables as everyone else's.
- **Signing in:** "Sign in to save your progress" offers Google and email magic link (Supabase Auth). Signing in from guest mode links the new login to the anonymous user, so nothing is lost. If anonymous linking isn't workable, keep guest data in IndexedDB and merge it into the account on first sign-in.
- **Header:**
  - Guests see a Sign in button.
  - Signed-in users see an avatar menu: Stats, Weekly reports, Profile & settings, Export my data, Sign out.
- **Profile settings:**
  - display name
  - time zone (auto-detected, editable)
  - week starts Monday or Sunday
  - day rollover at midnight or 4 AM
  - streak freeze on/off
- **Sync:** settings, tasks, sessions, documents, stats and streaks sync across devices for signed-in users.
- **My data:**
  - "Export my data" downloads everything as JSON.
  - "Delete my account" removes all rows and files after a typed confirmation.
- **Security:**
  - Row Level Security on every table, so users can only read and write their own rows.
  - The storage bucket is private, with file paths starting with the user's id.
  - Every API route checks the session.
- **AI cost limits:**
  - Count AI calls per user per day in an `ai_usage` table.
  - When someone hits the limit, show a friendly message that the timer keeps working and AI features come back tomorrow.
  - Guests get the smaller limit and a nudge to sign in.

## 2. Port the existing features (from studybuddy.html)
- **Timer:** 25/30/35/40/45 min or custom.
  - Timestamp-based, so it stays accurate across refreshes and sleeping tabs.
  - Remaining time shows in the tab title.
  - Start, pause, reset, skip, +5 min, and finish now.
  - Loop mode.
  - Long break after N sessions.
- **End-of-session quiz:** 1–3 questions.
  - It's generated when the session starts, so it's ready at the end.
  - Every answer shows an explanation, a memory aid, and why the chosen wrong option was wrong.
  - No repeated questions within a day.
  - Missed concepts get re-tested later.
- **Break by score:** 100% → 15 min, 50–99% → 10, below 50% → 5. The "no quiz" break is 5. Long breaks are 30/22/15/15. All of these are editable.
- **Next-session plan** with an "Apply plan" button, and a "Summarize my day" summary.
- **Study panel:** subject, topic, level, goal and notes, plus text-file and photo-of-notes import.
- **Settings and extras:** synthesized chimes, ambient sounds, themes (Notebook, Chalkboard, Tomato buddy with mascot), to-do list, keyboard shortcuts, browser notifications, keep screen awake.

## 3. Documents and goals
- **Upload:** PDF, PPTX, DOCX or images, up to 50 MB.
  - Upload files straight from the browser to Supabase Storage, not through API routes (Vercel limits request size).
  - Extract text in the browser:
    - PDF: pdf.js, plus page thumbnails
    - PPTX: JSZip, reading the slide XML
    - DOCX: mammoth.js
  - Scanned pages or images: render to an image and send it to `/api/ai/read-image`.
- **Outline:** `/api/ai/outline` builds it once, in chunks for long files. For each page or slide it stores a title, a one-line summary, 2–5 key concepts and a section name.
  - Show the outline as a list with thumbnails.
  - Documents live in a library, and each session can pick one.
- **Goals in plain words:** e.g. "study up until the Aristotle slide." `/api/ai/goal` maps the goal to page numbers and asks me to confirm: "Goal: slides 12–18, ending at 'Aristotle: Virtue Ethics' (slide 18). Correct?" A slide picker lets me adjust it.
- **Goal types:**
  - reach slide X
  - cover a range
  - study N minutes
  - score at least X% on the quiz
- **End of session:** ask "How far did you get?" with a slide picker. Pre-fill it with the furthest slide detected on screen, or with my goal.
  - Record the start page, furthest page, whether the goal was met, and how progress was measured (screen or manual).
- **Next session:** "Resume at slide 19: Plato vs. Aristotle on the Forms."
- **Quizzes and plans:** questions come only from pages covered this session. Feedback cites the page ("See slide 14"). Plans start from where I stopped.

## 4. Screen monitoring (opt-in, desktop browsers only)
- **Off by default.** The first time I turn it on, show a short plain explanation:
  - what is captured
  - how often
  - that frames are never saved
  - how to stop
- **Capture:** `navigator.mediaDevices.getDisplayMedia`, started from a button click. Suggest sharing only the window or tab with my slides.
  - Capture only while a study session runs. Pause with the timer, and stop during breaks and when the session ends.
  - Default: one frame every 20 seconds (adjustable 10–60).
  - Downscale to about 1280px wide JPEG.
  - Skip frames that barely changed, using a small perceptual-hash check.
- **Identifying the slide:**
  - With a document: match the frame to a page with local OCR (Tesseract.js) against the extracted page text. Call `/api/ai/frame` with `MODEL_FAST` only when the match is unclear.
  - Without a document: `/api/ai/frame` returns the slide title, the slide number if visible, and key terms. Build a "slides seen" log from that.
- **Privacy:** frames stay in memory and are discarded after analysis. They are never written to storage or the database. Only page index, title, key terms, time and confidence are saved in `progress_events`.
  - A persistent indicator shows "Watching: Lecture 3", with a Stop button.
  - I can view and delete the log.
- **Live progress bar:** "Slide 14 of 40 · Goal: Aristotle (slide 18) · 4 to go." Show a small celebration when I reach the goal.
- **Fallback:** if permission is denied, sharing stops, or the browser doesn't support screen capture (phones), fall back to manual progress quietly.
- **Cost:** at most one AI frame call every 30 seconds.

## 5. Stats (pure, tested functions over the session history)
Show each definition in a tooltip.
- **Overall quiz accuracy** = correct ÷ answered (skipped excluded). Also show it per topic and per document.
- **Study time and sessions:** a session counts only if it reached at least half its planned time. Show average session length too.
- **Goals met %** = sessions with the goal met ÷ sessions with a goal.
- **Best study days:**
  - the weekday with the highest average minutes
  - the weekday with the best accuracy
  - the best time of day (morning/afternoon/evening/night) by accuracy
- **Study streak:** consecutive days with at least one counted session. Show current and longest.
- **Check-in streak:** see section 7. Show current and longest.
- **Document progress:** % of pages reached, with a coverage map of which pages were studied and quizzed.
- **Concepts:** most-missed, and "mastered" (missed before, then right twice in a row).
- **Breaks:** total break minutes earned.
- Every "day" uses the user's time zone and rollover setting. Store a `local_date` on sessions and check-ins.
- Unit-test every metric, including:
  - an empty week
  - skipped quizzes
  - sessions crossing midnight
  - the 4 AM rollover
  - a time zone change
  - streak freezes

## 6. Weekly report
- The week runs Monday–Sunday by default. On my first visit of a new week, show "Your week in review." Save it in `weekly_reports` so I can browse past weeks. "This week so far" is always available.
- Sections:
  1. A headline and a 2–3 sentence AI summary (`/api/ai/weekly`): specific, encouraging, never shaming.
  2. Key numbers, each with ▲/▼ vs. last week: study time, sessions, accuracy, goals met %, study streak, check-in streak.
  3. Charts:
     - minutes per day (bars)
     - accuracy per day (line)
     - a 12-week calendar heatmap
  4. Best day and best time of day.
  5. Progress bars for each document, and pages covered this week.
  6. Accuracy per topic, most-missed concepts, concepts mastered.
  7. Three concrete focus steps for next week.
- Let me save the report as an image or PDF.
- Charts need to be readable in light and dark themes, with a friendly empty state.

## 7. Check-in streak and celebrations (like MyFitnessPal)
- A check-in is the first real action of the day: start a session, upload, add a task, or answer a quiz. Just loading the page doesn't count. Store one row per `local_date`.
- **First check-in of the day:** show a celebration card with:
  - the streak count, e.g. "🔥 12-day streak!"
  - a strip of the last 7 days with checkmarks
  - one line of encouragement
- **Milestones:** 3, 7, 14, 30, 50, 100 and 365 days get confetti and a badge saved to my profile. Respect reduced motion.
- **Broken streak:** "Welcome back. New streak starts today. Your best is 23 days." No guilt.
- **Streak freeze (optional):** earn 1 per 7-day streak, hold at most 2, used automatically on a missed day.
- The header shows both the check-in streak and the study streak.
- The celebration shows once per day per account, even across devices.

## 8. Database (Supabase migrations in `supabase/migrations`)
Every table has `user_id` and RLS.
- `profiles`: display_name, timezone, week_start, rollover_hour, streak_freeze, settings (jsonb)
- `tasks`
- `documents`: name, file_type, storage_path, page_count
- `document_pages`: document_id, page_index, title, summary, text, concepts, section
- `study_sessions`: started_at, ended_at, local_date, planned_min, studied_min, counted, subject, topic, level, document_id, start_page, end_page, progress_source, break_min, break_kind
- `goals`: session_id, type, target (jsonb), text, met, met_at, method
- `quiz_attempts`: session_id, question, options, correct_index, chosen_index, correct, concept, source_page
- `progress_events`: session_id, at, page_index, source, confidence
- `plans`: session_id, data (jsonb), applied
- `check_ins`: local_date (unique per user)
- `streaks`: cached current and longest values, freezes, milestones
- `weekly_reports`: week_start (unique per user), stats, ai_summary
- `ai_usage`: day, calls
- `concept_stats` can be a database view over `quiz_attempts`.

## 9. API routes
All routes check the session and the AI quota, call Claude, validate with Zod, and return clean JSON:
- `/api/ai/quiz`
- `/api/ai/plan`
- `/api/ai/day-summary`
- `/api/ai/outline`
- `/api/ai/goal`
- `/api/ai/frame`
- `/api/ai/read-image`
- `/api/ai/weekly`

## 10. Build phases
1. Next.js project and the ported timer, settings, sounds, themes and tasks, working as a guest with local storage. Deploy to Vercel.
2. Supabase: schema, RLS, guest (anonymous) and Google/email sign-in, upgrade without data loss, profile, sync.
3. AI routes for quiz, plan, day summary and photo notes, with quotas.
4. Documents: upload, parse, outline, library. Goals with mapping, confirmation, end-of-session progress and resume. Quizzes from covered pages.
5. Screen monitoring with consent screen, change detection, OCR matching, frame route, live progress and fallback.
6. Stats engine with unit tests, and a Stats page.
7. Weekly report: charts, AI summary, archive, save as image/PDF.
8. Check-in streaks, celebrations, milestones and freezes.
9. Polish: responsive layout, accessibility, loading/empty/error states, export and delete account, a Playwright end-to-end test, and the README.

## 11. README setup guide (written for a beginner)
Click-by-click steps for:
1. Creating the Supabase project, running the migrations, turning on anonymous sign-ins, the Google provider (including the Google Cloud OAuth client) and email magic links, and adding site and redirect URLs.
2. Getting an Anthropic API key at console.anthropic.com and setting a monthly spending limit.
3. Filling in `.env.local` and running the app locally.
4. Deploying to Vercel, adding the environment variables, and adding the Vercel URL to Supabase's redirect URLs.
5. Which services have free tiers and what costs money. Be specific about Claude API usage per study session.

## Done means
- Live on Vercel. A guest can study, take a quiz and earn a break, then sign in with Google and keep all their data.
- The same account shows the same stats and streak on a second device.
- I can upload a philosophy lecture, say "study up until the Aristotle slide," confirm the mapped goal, and study. The app tracks my slide progress from the screen on desktop, or by asking me at the end. The quiz covers only the slides I reached, and goal met/missed is recorded correctly.
- The weekly report's numbers match the unit tests.
- The streak celebration appears once per day, survives refreshes and works across devices.
- No API key or other secret is visible in the browser, and one user can never read another user's data.