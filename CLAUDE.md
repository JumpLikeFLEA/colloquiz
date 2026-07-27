@AGENTS.md

# Linting

- `npm run check` (`tsc --noEmit && eslint .`) is the static gate; it exits 0 on
  a clean tree. Also `npm run lint` / `npm run lint:fix`.
- **`next lint` does not exist** — Next.js 16 removed it along with the `eslint`
  key in `next.config`. Config is flat (`eslint.config.mjs`), invoked as
  `eslint .`. Do not add a `"lint": "next lint"` script.
- Tier is `eslint-config-next/core-web-vitals` + `/typescript`. Type-aware rules
  (`projectService`) are deliberately NOT enabled — they would roughly triple
  run time for rules we have not needed yet.
- **Prettier is deliberately declined.** A formatter would reflow JSX across the
  whole ported codebase in one commit and destroy the ability to audit the
  Figma-port diff, which the design fidelity rules below depend on. Do not add it.
- ESLint 9 does NOT read `.gitignore`, so `figma-export/`, `authored/`,
  `ds-bundle/` etc. are listed explicitly in `globalIgnores`. Note that
  supplying `globalIgnores` overrides eslint-config-next's own defaults, so
  `.next/**`, `out/**`, `build/**` and `next-env.d.ts` are re-listed by hand.
- `app/components/ui/**` (vendored shadcn/Radix) and `app/components/figma/**`
  (vendored Figma export) are unlinted on purpose — upstream code, re-vendored
  on each add. `ImageWithFallback`'s manual `<img>` handling is the point of the
  component, not a `no-img-element` violation to fix.
- Deliberately-unused bindings use the `_name` convention, honoured via
  `argsIgnorePattern` / `varsIgnorePattern` in the config.
- Two `react-hooks/refs` suppressions exist (`QuizSession.tsx`,
  `DuelRealtime.tsx`), each with a comment explaining why the ref is assigned
  during render. These are known debt, not oversights — read the comment before
  "fixing" them.

# Design fidelity rules

- `/figma-export` is the visual source of truth (Vite + React + Tailwind)
- We are porting it to Next.js, preserving visual output exactly
- Never change, simplify, or substitute Tailwind classes, spacing, colors, or DOM structure
- Only allowed changes: Next.js-specific (`next/link`, `next/image`, app router, `'use client'` directives)
- If a conflict between Figma code and Next.js forces a visual change, stop and ask

## Intentional deviations from /figma-export
- Body font: Geist via next/font (Figma export had no font loaded; 
  this is a deliberate choice, do not remove)
- AuthScreen: the apostrophe in "won't be here" is written `won&apos;t`
  (2026-07-27) to satisfy react/no-unescaped-entities. Rendered output is
  byte-identical; do not revert to a bare `'`
- AuthScreen (app/(auth)/AuthScreen.tsx): stats row ("47 Subjects / 10k+ 
  Learners / 500k+ Quizzes") and the Terms of Service / Privacy Policy 
  line removed at user request (2026-07-06); do not restore
- AuthScreen: "Check your email" confirmation view added (2026-07-08) for 
  the Supabase email-confirmation flow; not in the Figma export (which had 
  no auth logic). Composed entirely from classes already used elsewhere in 
  AuthScreen.tsx; do not remove
- AuthScreen: emerald notice box (2026-07-08) mirroring the error box 
  structure, for "email confirmed, please sign in" after clicking a 
  confirmation link on another device; do not remove
- AuthScreen: left decorative panel width changed (2026-07-08) from the 
  Figma fixed widths (w-[460px] xl:w-[520px]) to w-[40%] so the screen 
  splits roughly 40% panel / 60% form at user request; do not restore the 
  fixed widths
- AuthScreen: `redirectTo` prop added (2026-07-09) for the tutor invite-link 
  flow — after sign-in/sign-up the user lands on the `?next=` destination 
  (validated relative path) instead of always "/". Logic-only, no visual 
  change; do not remove
- SubjectGrid (app/components/SubjectGrid.tsx): the per-card difficulty pills 
  are GONE (2026-07-26), superseding the 2026-07-13 entry that added a 
  preselected "Any difficulty" pill and removed the "Choose a difficulty above 
  to start" warning. Twelve subjects × four pills was ~48 controls for one 
  decision, so difficulty became a single page-level segmented control (Any · 
  Easy · Medium · Hard) in the filter row, right of the search field, driven by 
  `?difficulty=` — allow-listed in lib/difficultyFilter.ts, anything 
  unrecognized falls back to "any", which still sends "mixed" to the quiz API 
  like Random Quiz does. Search stays client-side and instant: difficulty is 
  structural and shareable, search is not — the asymmetry is deliberate. Card 
  counts come from getSubjectStats().byDifficulty (one grouped RPC, migration 
  008) so the number always matches what a quiz at that difficulty would serve. 
  The segmented control uses the --brand / --brand-subtle tokens, not literal 
  hex. Do not restore the per-card pills or the warning
- SubjectGrid: subjects below the 10-question quiz size at the selected 
  difficulty render as unavailable (2026-07-26) — dimmed to opacity-50, 
  `disabled` on the card button (so unclickable and out of the tab order), the 
  affordance omitted, and the count line replaced by the reason with the real 
  number: "Only 3 questions · needs 10". Deliberately DIMMED, NOT HIDDEN: 
  hiding makes the catalogue look smaller than it is, dimming says the subject 
  exists and is worth returning to at another difficulty. The page therefore 
  filters subjects only on their all-difficulty total (a subject with zero 
  questions anywhere is still absent) — difficulty never removes a card. When 
  search + difficulty leaves nothing playable, a notice sits ABOVE the grid 
  (not in place of it) naming the reason and offering "Try any difficulty" / 
  "Clear search". Availability is derived from questionCount, which is already 
  difficulty-aware, so it needs no state of its own
- SubjectGrid: the per-card "Start Quiz" button is GONE (2026-07-26) and the 
  card itself is the start action — twelve identical primary buttons on one 
  screen was the whole problem. The card root is a real `<button type="button">` 
  (not a div with onClick), so keyboard focus, Enter and Space come from the 
  platform; its accessible name is an aria-label naming the subject, count and 
  difficulty. Inner `<p>`/`<div>` became `<span className="block …">` because a 
  button's content model is phrasing content — same rendering, valid HTML, and 
  it keeps the tree free of nested interactives. Hover/focus reveals a "Start →" 
  affordance and shifts the border; focus-visible draws a brand ring. The 
  page-level Random Quiz button and the Deep Dive link are untouched. Do not 
  restore the per-card button
- NotificationBell (app/components/NotificationBell.tsx): the Topbar's 
  decorative Bell button (with its hardcoded unread dot) was replaced 
  (2026-07-17) by a working notification-center popover. No Figma source 
  exists for this surface; it is composed entirely from classes already used 
  in Topbar/cards (like the AuthScreen "Check your email" precedent). The 
  unread dot is unchanged but now rendered only when unread > 0; do not 
  restore the static button
- AuthScreen: inline "forgot" mode added (2026-07-18) behind the formerly 
  decorative "Forgot password?" button — email-only form, Google button / 
  divider / footer-toggle hidden in this mode, reset-specific copy in the 
  "Check your email" view; the left decorative panel was extracted as 
  exported `AuthLeftPanel` and `Field` exported for reuse (JSX/classes 
  unchanged); do not remove
- AuthScreen: Discord OAuth added (2026-07-21). The single full-width 
  "Continue with Google" button became a 2-column row of compact 
  Google / Discord buttons (same button classes, `grid grid-cols-2 gap-3`) 
  so the form height is unchanged; both get a disabled state while any 
  auth request is in flight. Do not restore the single Google button
- ResetPasswordScreen (app/(auth)/reset-password/): set-new-password page 
  added (2026-07-18) for the Supabase password-recovery flow. No Figma 
  source exists; composed entirely from AuthScreen.tsx classes 
  (AuthLeftPanel, Field, header/button/error-box); do not remove
- Groups (app/(main)/groups/**): the whole collaborative-group surface added 
  (2026-07-22) — group list, group detail (invite link, roster, quiz list), 
  peer review queue, per-question quiz builder, and the join-by-link page. 
  No Figma source exists for any of it; composed entirely from classes 
  already used in StudentsView.tsx (invite-link block, roster rows, 
  empty states), MyQuizzesView.tsx (quiz rows, confirm dialogs) and 
  my-quizzes/builder (question editor fields), same precedent as 
  NotificationBell. Do not remove
- ui/button.tsx + ui/dialog.tsx: `cursor-pointer` added (2026-07-22) to the 
  buttonVariants base class and to the dialog's close (X) control. Tailwind v4 
  removed the Preflight rule that gave `<button>` a pointer cursor, so every 
  shadcn button in the Figma export renders with the default arrow — a bug in 
  the port, not a design choice. This is the only change to those two files 
  and it alters no spacing, color or DOM structure. Note buttonVariants 
  already sets `disabled:pointer-events-none`, so no `disabled:cursor-not-allowed` 
  is needed there; hand-rolled buttons elsewhere do pair the two
- Leaderboard (app/(main)/leaderboard/**): the casual XP ranking surface added
  (2026-07-22) — global and per-subject boards over 7-day / 30-day / all-time
  windows, a one-time privacy notice, and a hide-me toggle. A "Standings"
  section was added to groups/[id]/GroupDetailView.tsx (as a section, not a
  tab — that view is a stack of sections, it has no tab bar), and a rank strip
  plus a "Public name" field to dashboard/DashboardView.tsx. No Figma source
  exists for any of it; composed entirely from classes already used in
  AchievementsView.tsx (filter pills), StudentsView.tsx (roster rows, empty
  states) and the Dashboard cards — same precedent as NotificationBell and
  Groups. The sidebar entry uses `Medal` because `Trophy` is Achievements.
  Do not remove
- Duels (app/(main)/leaderboard/ Competitive tab, app/api/duels/**): async
  1v1 duels between group co-members added (2026-07-22), rated with Glicko-2.
  A duel is metadata over an ordinary shared quiz, so both players play it
  through the existing /quiz/[id] flow and it earns XP like any other quiz.
  The challenge dialog lives in GroupDetailView's member rows (Swords icon).
  No Figma source; composed from the existing dialog, pill and row classes.
  The rating number is NEVER rendered — player_ratings has RLS on with no
  policies and no grants, so it is unreadable even by its owner; only the
  tier reaches the client. Do not add a rating display
- Public name (2026-07-22): leaderboards render profiles.display_name and
  never full_name. The app elsewhere resolves `full_name || display_name`, and
  full_name is what the Dashboard form writes — typically a real name — so
  display_name was repurposed as the public handle rather than publishing it.
  Keep leaderboard surfaces on display_name only
- AppSidebar (app/components/AppSidebar.tsx): "Groups" added to navItems and 
  the Author section hidden (2026-07-22) behind the `SHOW_AUTHOR_NAV = false` 
  constant, because the tutor/author flow is dormant while Groups is the 
  active collaboration surface. The authorItems array, the /students and 
  /my-quizzes/builder routes, and all tutor RLS/data code are deliberately 
  left intact — flip the constant to restore the nav. Do not delete the 
  author code
- Identity moved out of Progress (2026-07-27): the Figma profile card that
  opened Progress › Stats (avatar, name, email, location, member-since, level,
  total XP, XP bar, "View Achievements") was split. Identity — avatar, name,
  email, location, member-since and the pencil edit affordance with its
  full_name / public-name / city form — moved verbatim into Settings › Account,
  replacing that section's "Coming soon." placeholder; this supersedes the
  Leaderboard entry's "Public name field in dashboard/DashboardView.tsx", which
  now lives in settings/SettingsView.tsx unchanged. Level and total XP became a
  fifth stat card ("Current Level" / "Level N", XP in the card's footnote slot),
  and the stat row widened to the full page (grid-cols-2 sm:3 lg:5). DELETED,
  do not restore: the XP progress bar (the sidebar profile block already shows
  level and progress to next level), the "View Achievements" button (the
  Achievements tab three lines above does the same thing), and the duplicate
  city line under the email — the MapPin row is the one that survived, and it
  is now rendered only when a city is set. DashboardView no longer takes
  userId/email and holds no profile state
- Duel live UX (2026-07-24, migration 018 + app/components/DuelRealtime.tsx +
  app/(main)/duels/**): made the duel loop live and navigable. The app's FIRST
  realtime usage — a single global channel (DuelRealtime, mounted in the (main)
  layout) subscribes to the user's own notifications INSERTs and, per row, lights
  the bell, fires a sonner toast, and calls router.refresh() so every open server
  surface re-renders. Every duel transition already writes a notification to the
  user who cares, so one channel drives everything; delivery is scoped by the
  notifications owner-read RLS policy. Duels moved to their own surface: a /duels
  list (inbox) and /duels/[id] detail, added to the sidebar (Swords icon) with an
  action-needed count badge fed by isActionableDuel() from the (main) layout. The
  duel inbox was REMOVED from the Leaderboard Competitive tab (now rankings-only,
  with a link to /duels); all four duel notifications now deep-link to /duels/[id]
  instead of /leaderboard?tab=competitive. A lapsed pending challenge now emits a
  duel_expired notification, and declined/expired duels render explicit pills
  instead of silent dead rows. The quiz page shows a "Duel vs X" banner + a
  server-anchored countdown while playing a duel leg (start_duel_leg_for_quiz now
  returns the leg context as JSONB) and auto-submits at zero; the results screen
  links back to the duel. No Figma source for any of it; composed from existing
  classes — same precedent as Groups/Leaderboard. The rating number is still
  NEVER rendered. Do not remove