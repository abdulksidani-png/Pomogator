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
| 7 | Weekly report: summary, ▲/▼ numbers, charts, archive, image/PDF | Built, waiting on his test |
| 8 | Check-in streaks + celebrations (MyFitnessPal style) | Built, waiting on his test |
| 9 | Polish, export / delete account, full guide, first-time tour | Built, waiting on his test |
| 10 | Friends: codes, widget (online, studying time, music, stats), support messages | Built, waiting on his test (needs migration 4) |
| 11 | Study together: synced timers, groups of 4, agreed break | Built, waiting on his test (needs migration 4) |
| + | UF default look, Rocket (robot retired), fold-away cards, Today → Stats, replies to support messages | Built, waiting on his test (replies need migration 5) |
| + | Study points + buddy shop, Sugarcane + Canes theme (tomato retired), "How far did you get?" removed | Built, waiting on his test (no migration) |
| + | Propeller cap, gear everywhere (assistant button too), friends see outfits, saved outfits, cartoon Sugarcane, gifts | Built, waiting on his test (no migration; gift SQL run by him) |
| + | Last.fm music for everyone (gets around Spotify's 5-user cap) | Built, waiting on his test (needs `LASTFM_API_KEY` in Vercel; no migration) |
| + | Pick a username after signing in (what friends see instead of "Study buddy") | Built, waiting on his test (no migration) |

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
`jungle` (gorilla, named Dulie since 2026-10-16), `gator` (UF orange/blue), `panther` (FIU navy/gold), `robotlab` (robot, Orbitron clock); picking a
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

**Phase 7 (built):** `lib/weekly.ts` (pure, `tests/unit/weekly.test.ts`): `weekReport` (from `computeStats`; this week vs.
last; days with `future`; pages covered; missed this week; mastered this week = mastered at week end but not at its start;
week streak = streak as of the week's last study day), `focusSteps`, `plainSummary` (no-AI text, never shaming),
`weeksWithStudy`, `unseenLastWeek`, `reportSig`, `weeklyInput`. AI action `weekly` (`weeklyPrompt`, `cleanWeekly`).
Summaries live in the store as `weekly` (by week start, newest 26) + `weeklySeen`, synced inside profiles.app_state
(deliberately no `weekly_reports` table, so no migration). View `/weekly` (`components/Weekly.tsx`, `?week=`), tabs
Overview | Weekly report shared with Stats (`StatsTabs`), `WeekReviewBanner` on the timer page, "Save as image"
(`lib/share-card.ts`, canvas 1080×1350) and "Save as PDF" (print CSS). Check-in streak tile added in Phase 8.

**Phase 8 (built):** `lib/checkins.ts` (pure, `tests/unit/checkins.test.ts`): `celebrationFor` (streak via `streakOf`, so
freezes work the same as the study streak; `first`, `broken` + `bestBefore`, `saved` by a freeze, `record` for "new personal
best", `newBadges`/`milestone` from `MILESTONES` 3/7/14/30/50/100/365, the 7-day strip), `encouragement` (never guilt),
`weekCheckinStreak`, clean/merge helpers. Store: `checkins` (local dates), `celebrated` (last day shown), `badges`
({days: date}) live in the app slice (profiles.app_state) — deliberately no `check_ins`/`streaks` tables, so no migration.
`checkIn()` runs on `start()`, `answer()`, `addTask(s)` and `addDoc()` (page load alone doesn't count) and sets the transient
`checkinDue`; `CelebrationHost` (`components/Streaks.tsx`) waits for sign-in to settle, calls `pullNow()` from `lib/sync.ts`
(4 s max) and then `celebrate()`, which returns null if any device already celebrated today. Sync pull always unions
check-ins/badges and takes the later `celebrated`, whichever app_state version is newer, and bumps `v.app` + pushes if this
device knew more. The card: buddy, "🔥 N", headline, strip (✓ / ❄ frozen), one line, medal + CSS confetti on milestones
(hidden with reduced motion), "Keep going" / "See my badges". Header `#streakPills` (flame lit once checked in today + study
streak; opens Stats; on phones only the flame, and the Stats chip hides). Stats: "Check-in streak" tile + `BadgeShelf`
(`#badgesCard`). Weekly: "Check-in streak" ▲/▼ tile (`r.now.checkin`). Settings → Extras → "Daily streak celebration" is per
device (localStorage `studybuddy.celebrate`); check-ins and badges count either way. **Tests import `test` from
`tests/pw.ts`**, which turns the card off unless a spec sets `test.use({ celebrate: true })` (`tests/e2e/streaks.spec.ts`;
sync contexts use `quietCelebrations`).

**Phase 9 (built):** Settings → "Your data": Download (`lib/export.ts`, one JSON with docs' pages + AI notes + chat) and
Delete (`DeleteAccount` in Dialogs.tsx, type DELETE; `deleteAccount()` in sync.ts removes Storage files, calls
`delete_my_account()` from migration 4 — every table cascades from auth.users — then signs out locally, which wipes the
device and starts a new guest; without Supabase it only wipes local). First-time tour `components/Tour.tsx`: buddy-guided
spotlight steps (`#ctxCard`, `#startBtn`, `#stage`, `#tasksCard`, `#friendsCard` if present, `.assistant-fab`,
`#streakPills`, Appearance, `#accountBtn` for guests), Skip/Esc/arrow keys, docked card on phones; opens by itself once
for someone brand new (no history, no check-ins) after sign-in settles; `tour` ('done'|'skipped') is synced in app_state
and mirrored in localStorage `studybuddy.tour`; Help dialog → "Take the tour". Polish: axe-core test `tests/e2e/a11y.spec.ts`
(WCAG 2.1 AA, three themes, every view) — fixed `--fg-3` contrast in 8 themes; phones hide the Stats and Loop chips (the
streak button opens Stats; Loop is in Settings). `docs/SETUP.md` has "What it costs" (AI requests per session) and more
troubleshooting. `tests/db/friends-check.sql` checks migration 4 (run on a fresh database after all migrations).

**Phases 10–11 (built, his request):** migration 4 (`20261016000000_friends.sql`, checked by `tests/db/friends-check.sql`).
Friends (`lib/social.ts`, `components/Friends.tsx`): `SocialHost` starts it for `account.status === 'user'` only (guests
see "Sign in to add friends"; no Supabase → card hidden); `social_me` makes the profile + 8-char code (name only set at
creation, from a Google first name, never an email; renamed via `#myName`); `#friendsDlg` (code, invite link
`/?friend=CODE`, add by code, sharing switches `#shareOnline/#shareMusic/#shareStats`); `#friendsCard` rows show the
friend's buddy (mood from what they're doing), online dot, "Studying · N min in", music, and expand to stats
(`myStats()` published to `social_profiles.stats`), a support picker (presets + custom, `send_support`, one per day by a
unique key) and "Study together". `SupportPopup`: the sender's buddy slides in bottom-left with a bubble; "Thanks"
marks it seen. Polling (no Realtime): heartbeat 60 s + on activity change (5 s check), friends/inbox 30 s, invites 10 s.
Study together (`lib/collab-core.ts` pure + `tests/unit/collab.test.ts`, `lib/collab.ts`, `components/Together.tsx`):
`effective()` derives study→break→next round from the stored state + server time; `pressed()` makes the new state;
`set_collab_state` with expected version. The store's `start/pause/reset/addFive/skip/markDone` call `collabCtl.press`
when `collab` is set (`shared()`), and `fromTheRoom` applies the room locally; `align()` (on every 2 s poll) lines the
local timer up (endAt converted with the server clock skew); `startBreak` uses `collab.breakMin` and `lastResult.together`;
mode switching is disabled; "+5" isn't offered in the group quiz. `TogetherDialog` (up to 3 friends, study 25/30/45/50,
break 5/10/15, note), `InviteBanner` (Join is disabled while your own timer is busy), `RoomPanel` (members, terms, Leave).
React #185 bit again here: never `.filter()` inside a Zustand selector.

**2026-10-16 changes (his requests):** default look for new visitors (DEFAULT_SETTINGS + the early-theme script in
`app/layout.tsx`): `skin: 'gator'`, Albert, classic timer, `clockFont: 'hand'`, `background: 'dots'`, `cardStyle: 'glass'`,
`corners: 'soft'`, comfortable. The gator theme (his second ask) is a soft off-white (`--bg #EEEDE7`, cards `#F8F7F3`) with UF blue
(`--accent #0021A5`: buttons, links) and UF orange (`--margin #FA4616` stripe, orange dots, `.brand-gator #E8420F`). **Rocket**
the bulldog (`bulldog` sprite in Mascot.tsx: original 2-bit pixel art from a bulldog logo photo — fawn coat with a white
blaze and muzzle, dark rose ears, spiked collar, underbite, navy sweater with a small original shield-and-tree emblem
(palette letter `v`, not `d`, which the desk prop uses); writes with a pencil while studying). The robot
buddy is gone (`normalizeData` maps a saved `robot` to `gator`, also in saved timers; Robot lab theme has no buddy).
`FoldCard` in Panels.tsx: every side card (study panel `ctx`, To-do `tasks`, Friends `friends`, Music `music`) folds like the
plan card (`settings.folded`), with a `summary` beside the heading while folded; in focus mode the music card's fold is
`display: contents`. The Today card moved to the Stats page (above the tiles). Replies: migration 5
(`20261017000000_support_replies.sql`: `reply_to`, partial unique indexes, `reply_support()`, `support_inbox()` gains
`is_reply`); the popup has Reply → quick replies (`REPLY_LINES`) or your own words; replies can't be replied to.

**Study points + buddy shop (2026-10-16, his request, waiting on his test):** `lib/points.ts` (pure, `tests/unit/points.test.ts`):
points are derived, never stored as a running total — check-in days (`checkinPointsByDay`: 10 × `streakMultiplier`, +10%
per streak day up to ×1.5, freezes as in streaks) + `sessionPoints` (≥20 min and ≥90% of planned: 1 per 5 min, +5 at 45)
+ `pointsBank` (points of sessions spliced off the 400-session history) − prices of `owned`. `pointsOf(state)` in store.ts.
`lib/cosmetics.ts` (`tests/unit/cosmetics.test.ts`): sunglasses (eyes, 60), tie (neck, 80), cowboy hat (hat, 120), rainbow
propeller hat (hat, 150); 2-bit rows in `COSMETIC_PAL` (uppercase + rainbow letters), drawn per buddy at `ANCHORS`
(hat center/top, eye row + columns or one profile eye, neck); hats extend the SVG viewBox upward; propeller blades use
`type-a/type-b`; `wearing()` keeps one per slot. Store: `owned` + `pointsBank` in the app slice (sync pull unions `owned`,
max bank), `settings.wear`; actions `buyCosmetic` (auto-wears) / `setWear`. UI `components/Shop.tsx`: `ShopDialog`
(`#shopDlg`, opened by `openShop()` event), header `#pointsBtn` (hidden on phones; Appearance → "Open the shop" `#shopBtn`),
`MyBuddy` (own buddy + wear) used by Stage, QuizBuddy, Assistant, Celebration, Tour. "+N study points" in the celebration
(`#checkinPoints`) and break banner (`#sessionPoints`); tour step `#pointsBtn` (tour skips hidden targets). Friends see
buddies without cosmetics (not published). **Sugarcane** (`ibis` sprite: original white ibis in a green sweater with
orange stripes, UM-style, not UM's logo) + **Canes** theme (`canes`, light green/orange; buddy ibis). The tomato buddy and
Tomato theme are gone (`normalizeData` maps them to gator); `mascot` 'auto' now always shows the buddy. ReachPicker
("How far did you get?") is removed; `setReached` stays unused.

**Shop round 2 (2026-10-16, his request, waiting on his test):** the propeller hat is a ball cap (yellow/red front panels,
blue sides, green brim, navy blades on a yellow hub) from his photo; `HATS` entries have `rows`, an optional `side` view for
profile buddies (gator, ibis: brim sticks out right) and `blades` (two `type-a/type-b` frames). Sugarcane redrawn as an
upright cartoon ibis like the UM mascot photo he sent (original art: sailor cap without a logo, green jersey with orange
stripes, white fists, long beak, orange feet; 26×27); `Sprite.capless` swaps out his cap under a shop hat. Corner
assistant button shows `MyBuddy` (`.fab-buddy`). Friends: `encodeBuddy(kind, wear)` → `"ibis.ps"` (one-letter
`Cosmetic.code`) in the existing ≤20-char buddy field (`social_me`, `send_support`, `reply_support`; rooms/invites read
it from `social_profiles`); `decodeBuddy` in social.ts/collab.ts gives `wear` on `Friend`, `Support`, `CollabMember`,
`Invite.hostWear`; `SocialHost` re-sends on outfit change. Saved outfits `settings.outfits` (`saveOutfit`, max 12, by
name; store `saveOutfit/wearOutfit/deleteOutfit`; shop `#outfits`). Gifts: app-slice `gifts` (union-merged in sync,
free; `hasItem`), given with the SQL in docs/SETUP.md "Give someone a cosmetic" (the fake Supabase has `/test/gift`
running the same SQL, used in the sync test). He asked for the propeller on his own account: he runs that SQL himself
(his email is never committed).

**Last.fm music (2026-10-16, his request after Spotify's 5-user dev-mode cap):** `settings.lastfmUser` (synced,
`cleanLastfmUser`), `/api/lastfm?user=` (`lib/lastfm-server.ts`, `LASTFM_API_KEY`, `LASTFM_BASE_URL` for tests;
`s-maxage=15`), pure parser `lib/lastfm-core.ts` (`toLastfmPlayback`, grey-star art dropped, `lastfmError`: 6 no_user,
17 private, 29 rate_limited), browser `lib/lastfm.ts` (`useLastfm`, `refreshLastfm`). MusicCard: source = Spotify if
linked on this device, else Last.fm if a username is set and the site has the key (`/api/config` `lastfm`); polls every
20 s; no controls/progress, "via Last.fm · user", "Last played" for a past track; the not-connected card has
`LastfmForm` ("Use Last.fm instead"). Settings → Music `LastfmSetting` (`#lastfmUser`). `myMusic()` in social.ts falls
back to Last.fm, so friends see it through the same heartbeat. Spotify 403/sign-in failures point to Last.fm when it's
on. Stand-in in `tests/fake-gemini/server.mjs` (`/2.0/`: nowplayer / quietone / nobody); test in
`tests/e2e-ai/extras.spec.ts`. SETUP.md section 6 has the click-by-click key steps.

**Username prompt (2026-10-16, his request):** `UsernamePrompt` in Friends.tsx (`#usernameDlg`, `#usernameIn`): once per
account, after sign-in, once that account's data has been pulled (`sync.lastPull`/`ownerId`) and a fresh `pullNow()`,
if the synced app-slice flag `pickedName` is false (sync pull ORs it). Saves with `updateMe({ name })` into
`social_profiles.name` (so it needs the friends profile, i.e. migration 4); "Skip for now" asks again next visit;
`#myName` in the friends dialog also sets `pickedName`. Not unique (friends add by code). Rule `cleanUsername` in
`lib/username.ts` (2–20 letters/numbers/space . _ ' -, no @). Sync tests: `emailSignIn` answers it for new accounts
and checks a second device isn't asked.

**Quizzes from the shared screen (2026-10-15, his report: a Python session got a quiz on yesterday's philosophy deck):**
screen tracking used OCR only to match slides, so off-document work was ignored. Now `capture()` in `lib/docs/screen.ts`
puts every read frame's text on the live session (`addScreenText` → `session.screen`, ≤24k chars, dropped from history like
`heard`) and keeps ≤6 JPEG snapshots in memory (`screenSnapshots()`, one per big change ≥45 s apart, thinned evenly;
`settings.screenAI`, default on, Settings → "Send screen snapshots to the AI"). Store: `quizSources`, `quizPick` (default:
everything, except a document that never appeared on a shared screen that showed other things), `session.quizPick`
via `setQuizPick` (rewrites the quiz; `sourcesKey` includes the pick). `quizPrompt` gets `screen` + `images` (sent as
Gemini inlineData; the route keeps ≤6 jpeg/png). Quiz screen: "Quiz me on" chips + topic field (`QuizPicker` in Stage.tsx).
Plan card: "Plan my next session" (`planFromWork`, action `plan-now`, `workPlanPrompt`: open to-dos, today's uploads +
digests, screen text) and "Clear plan" (`clearPlan`); `plan.kind` 'quiz' | 'work'. Consent dialog + privacy page say the
screen text and snapshots go to the AI.

**Buddy reactions + assistant photos (2026-10-15, his request, waiting on his test):** new `sad` mood for every buddy
(tomato brows + tear, robot frown, pixel `sad` overlays with a tear color `t`). `QuizBuddy` in `components/Stage.tsx`
sits beside the quiz heading/question (`.quiz-buddy[data-mood]`: cheer → quiz → happy/sad with a short line); it shows
whenever the buddy isn't switched off, even in "Automatic". The assistant header (`.assistant-mark`) and the latest reply
(`.bot-avatar`) show the picked buddy: thinking while busy, sad on errors, else the reply's `mood` (AI field, `happy`/`sad`).
Photos: image button `#assistantPhotos`, paste or drop; `addPhotos` in `lib/assistant.ts` shrinks to ≤1280 px JPEG +
200 px thumb; max 4 per message and 4 per request (`LIMITS.chatPhotos`); only thumbs are persisted.

**Logo + loading screen (2026-10-15, his request):** the logo is now 2-bit pixel art like the buddies: Albert in study
glasses peeking out of water inside a pixel timer ring (`lib/logo.ts` rows → `components/Brand.tsx`; `scripts/icon.mts`
regenerates `app/icon.svg`). `components/Splash.tsx` (rendered by `ClientApp` in the first HTML): the ring fills pixel by
pixel; `PomoGatorApp` sets `html[data-ready]` and `--splash-delay` (min ~0.9 s from navigation), CSS fades it; it never
blocks clicks (`pointer-events: none`) and needs no JS timer, so tests with a fake clock still work. `app/layout.tsx` has
an inline script that applies the saved skin/accent before paint.

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
- **Screen tracking** reads frames with on-device Tesseract OCR and IDF word matching (`lib/docs/match.ts`) to follow slides;
  the OCR text and a few snapshots go to Gemini only when the quiz (or a plan) is written, not frame by frame.
- **Tab sound** is transcribed on the device: `lib/docs/listen.ts` taps the shared stream with an AudioWorklet,
  cuts 12 s clips (silent ones skipped), and `public/asr-worker.js` runs Whisper tiny.en with Transformers.js loaded from
  jsDelivr (the npm package pulls in onnxruntime-node, whose install script downloads binaries). The model (~40 MB) comes
  from Hugging Face once and the browser caches it. The transcript lives only on the live session and is dropped from history.
- **AI provider is Google Gemini, not Claude**: the owner chose Gemini's free tier to pay nothing (key from Google AI Studio,
  stored in Vercel as `GEMINI_API_KEY`, no billing enabled). Keep the reference prototype's prompts and JSON shapes; use
  Gemini's JSON output mode. Free-tier limits are per project and shown only in AI Studio, so handle 429s gracefully
  ("quiz limit reached for today, enjoy a no-quiz break") and keep the app's own daily limits.
- **AI routes**: `app/api/ai/[action]/route.ts` handles `quiz`, `plan`, `plan-now`, `day-summary`, `assistant`, `digest` and `weekly`; prompts in
  `lib/ai/prompts.ts` (ported from the prototype), Gemini REST calls in `lib/ai/gemini.ts` (JSON mode, one retry on bad JSON,
  falls back from `gemini-flash-latest` to `gemini-flash-lite-latest` on 429/404; override with `GEMINI_MODEL(_BACKUP)`),
  replies validated with `lib/quiz.ts` on the server and again in the browser. Daily allowance: `lib/ai/quota.ts` +
  migration 3 (`ai_usage`, `use_ai()`): guests 40 calls/day, accounts 150 (`AI_DAILY_LIMIT_GUEST/USER`); skipped without
  Supabase or before migration 3 is run. Not built yet: `/api/ai/read-image` (photos still use on-device OCR), `/goal`
  (goals map locally), `/outline`, `/frame`.
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
- `lib/points.ts` (study points), `lib/cosmetics.ts` (shop items, pixel art, anchors).
- `lib/weekly.ts` (weekly report engine), `lib/share-card.ts` (weekly image), `lib/logo.ts` (pixel logo data).
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
  - `TimerMenu.tsx` (saved timers menu), `Weekly.tsx` (weekly report, review banner), `Splash.tsx` (loading screen)
  - `Shop.tsx` (buddy shop, points chip, `MyBuddy`)
- `supabase/migrations/`: `…000000_core.sql`, `…010000_documents.sql`, `20261015000000_ai_usage.sql`,
  `20261016000000_friends.sql`, `20261017000000_support_replies.sql` (delete account, friends, presence, support messages, study rooms; other people's data only
  through security-definer functions that check the friendship and sharing switches). RLS restricts every table to
  `user_id = (select auth.uid())`. The owner pastes migrations into the SQL Editor by hand.

## Commands
```bash
npm run dev          # http://localhost:3000 (copies vendor files first)
npm run typecheck
npm test             # Vitest unit tests (128)
npm run test:e2e     # Playwright: loop, documents, goals, screen tracking, tab sound, sounds, appearance, buddies, stats,
                     # saved timers, full screen, plan fold, weekly report, loading screen
npm run test:ai      # Playwright: AI, Unsplash and Spotify against stand-ins (tests/fake-gemini; Spotify faked in-test)
npm run test:sync    # two-device sync: needs local Postgres + PostgREST (PGHOST/PGPORT/PGUSER, POSTGREST_BIN)
```
`tests/fake-supabase/server.mjs` runs the real migrations on Postgres behind PostgREST, with a fake auth server.
`FAKE_MIGRATIONS=1` applies only migration 1, to test the legacy fallback. `tests/db/rls-check.sql` checks RLS.

## Gotchas
- **Speed (2026-10-16, his PageSpeed report; mobile 54 → ~65 in local Lighthouse, scrolling 46 → 60 fps on a 4× slowed CPU):**
  pixel art is drawn as one `<path>` per color (`lib/pixel-paths.ts`, `Paths` in Mascot.tsx; the splash arc alone stays
  per-pixel rects for its reveal), never one `<rect>` per run; big dialogs (Settings, Appearance, Shop, Profile) render
  their contents only while open (`useDialogOpen` in `lib/use-dialog-open.ts`), so query their insides only after
  opening; the splash unmounts on its `splash-out` animationend; fixed backgrounds (photo, gradient) live on a
  `body::before` fixed layer, never `background-attachment: fixed`; glass cards don't blur on phones/touch
  (`@media (hover: none), (max-width: 760px)`); CSS is inlined (`experimental.inlineCss`); Stats, Weekly and the
  Tour load with `next/dynamic`. The remaining LCP on a first visit is the tour text (shown on purpose) and the
  client-only app; server-rendering the timer page would be the next big step.
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
