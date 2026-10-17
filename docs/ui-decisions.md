# UI decisions

Deliberate UI decisions with standing force. An entry here says "this is the
way it is, and it was chosen" — a future session that finds one of these
surprising should read the entry rather than "fix" it.

Entries dated before 2026-09-20 were written while `/figma-export` was the
visual source of truth, so many are phrased as departures from it. That folder
is gone and the running app is now the reference; the DECISIONS below still
stand, and their reasoning is the reason they are kept. Do not re-derive them.

Appended to in the same commit as the change it records. Referenced from
`CLAUDE.md` via `@docs/ui-decisions.md`.

## Entries
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
- Settings > Account made functional (2026-07-27, migration 022 + lib/avatar.ts +
  lib/profileFields.ts + settings/AccountSection.tsx + settings/ProvidersSection.tsx):
  the pencil-toggle edit form from the identity move became a real labelled form
  with per-field validation, dirty tracking and a Save/Discard pair. REQUIRES
  MIGRATIONS 022 AND 023 (profiles.avatar_url + a public "avatars" storage bucket
  with owner-scoped policies; then the column-level GRANT that makes the new
  column writable). 006 revoked blanket UPDATE on profiles in favour of a column
  ALLOW-LIST, so EVERY new profiles column the app writes from a user session
  needs its own GRANT — without it the write fails with "permission denied for
  table profiles", which is a grant error checked BEFORE RLS, not a policy
  failure. Avatar limits (2 MB; PNG/JPEG/WebP) are declared once in
  lib/avatar.ts, stated in the UI BEFORE the picker opens, and enforced again on
  the bucket — the client check is a courtesy, the bucket is the enforcement.
  Objects are "<user_id>/<uuid>.<ext>": the first segment is what the storage
  policy checks, and the uuid means a replacement never reuses a URL, so no CDN
  cache-busting is needed; the previous object is deleted after a successful
  replace. EMAIL IS DELIBERATELY READ-ONLY with a note — changing it needs a
  confirmation round trip to the new address, which is not built; do not turn the
  field into an editable control without that. Sign-in methods are read from
  Supabase IDENTITIES (never inferred from the profile), fetched SERVER-side in
  page.tsx so the list is right on first paint and a fetch failure leaves the
  "last method" guard ON rather than off. THE HARD RULE: when identities.length
  <= 1 the Disconnect action is disabled with the reason in the row — Supabase
  also rejects it server-side, but a control that always fails is not a control.
  Provider icons moved from AuthScreen to app/components/ProviderIcons.tsx (a
  move, not a redraw) so Settings does not import the whole auth screen. Avatars
  render through next/image; next.config derives the allowed remote host from
  NEXT_PUBLIC_SUPABASE_URL rather than hardcoding a project ref
- Progress > History tab (2026-07-27, migration 021 + lib/history.ts +
  lib/historyFilters.ts + progress/HistoryView.tsx + progress/QuizResultsTable.tsx):
  the Figma "View all" control beside Recent Quizzes was a dead `<button>`; it is
  now a Link to ?tab=history, and Progress has a third tab. The row markup was
  extracted VERBATIM from DashboardView into QuizResultsTable so Stats (latest 10)
  and History (paginated 25/page) cannot drift; the two grid templates are written
  out in full rather than composed, because Tailwind only sees complete class
  names in source. State is entirely in the URL
  (?tab=history&subject=&difficulty=&page=), all four params allow-listed.
  REQUIRES MIGRATION 021: a result's subject is derived from
  quizzes.question_ids[1] -> questions.subject, and question_ids is a TEXT[] with
  no FK, so PostgREST cannot filter through it — you cannot take page 3 of a
  filter you can only evaluate after loading every row. get_quiz_history() does
  that lookup in SQL and returns one page plus the filtered total (the count
  rides on every row, so page and count share a snapshot);
  get_quiz_history_subjects() feeds the dropdown only the subjects the user has
  actually played, so no option is a dead end. Both SECURITY INVOKER, so RLS
  still scopes them. Do not "simplify" this back to a PostgREST select
- Subject Mastery split in two (2026-07-27, lib/subjectStats.ts +
  progress/SubjectScoreBars.tsx): the Figma radar plotted EVERY attempted subject,
  so labels ran off the SVG — "Motion Desi…", "Comput…", and two axes both reading
  "History" (one of them Sports/Science/Esports History). The radar now shows only
  the 8 most-played subjects, in a half-width card (the row went from
  [1fr_280px] to lg:grid-cols-2) at h-80, with a fixed 0–100 PolarRadiusAxis —
  auto-scaling let a flat 45% profile fill the polygon. Axis labels are pre-wrapped
  server-side into `lines[]` and rendered as one `<tspan>` per line by a custom
  tick, so NOTHING is ever truncated; only SHORT_NAMES may shorten a name, and any
  label collision falls back to the full name (unique by catalogue construction).
  Under 3 subjects the radar is replaced by an encouragement state — a 2-axis
  radar is a line. A second card, "Average Score by Subject", lists every attempted
  subject strongest-first and collapses past BAR_COLLAPSED_ROWS behind "Show all N
  subjects"; it is hand-built HTML, NOT a Recharts BarChart, because a category
  axis has a fixed pixel width and clips the long names this work exists to fix.
  One hue for every bar (a value-ramp would re-encode bar length as brightness);
  the number at the tip carries the value in text colour. Both charts are slices of
  ONE aggregate computed in page.tsx from the results already fetched — no new
  query. Do not restore the uncapped radar
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
- Settings > Notifications made functional (2026-07-27, migration 024 +
  lib/notificationPrefs.ts + settings/NotificationsSection.tsx): the "Coming soon."
  placeholder became an event x channel matrix (5 events, in-app + email).
  REQUIRES MIGRATION 024. THE GATE IS AT WRITE TIME, in notify(), NOT at read
  time in the bell's query — because the bell is not the only consumer:
  DuelRealtime subscribes to notifications INSERTs and fires a sonner toast plus
  router.refresh() per row, so a read-time filter would leave the toast popping
  for an event the user just muted. No row means no bell entry, no unread count,
  no toast, no refresh. The trade is that muting is not retroactive — nothing is
  queued and replayed — which the section copy states outright. 024 REDEFINES
  notify() FROM 013; re-applying 013 silently restores the ungated version.
  DEFAULTS ARE IMPLIED BY ABSENCE: no row means in-app on, so a new user is
  correct with zero rows and existing users need no backfill; the signup trigger
  is untouched. notification_pref_key() in SQL is the source of truth for which
  notification types a preference covers, and the `covers` lists in
  lib/notificationPrefs.ts mirror it for UI copy only. A type mapping to NULL is
  ungated and ALWAYS delivered — that is deliberate for question_reviewed,
  invite_accepted, assignment_completed, group_question_pending and
  report_resolved (which additionally bypasses notify() entirely, INSERTing
  direct from resolve_question_reports() in 010, so adding it to the map would
  NOT gate it). THE EMAIL COLUMN IS RENDERED DISABLED, and there is deliberately
  NO email column in the table: the app sends no transactional email for these
  events (no mail dependency, no edge function, no webhook — the only mail is
  Supabase Auth's own confirmation/reset), so a stored email preference would be
  a value nothing reads. Add the BOOLEAN column and enable the UI column
  together when delivery exists. The matrix is a real <table> with scope="col" /
  scope="row" headers so a screen reader can say which channel a switch belongs
  to; the Radix switches are textless buttons and carry their own aria-label. No
  Figma source; composed from existing card/switch classes — same precedent as
  NotificationBell. Do not remove
- Settings > Data and privacy (2026-07-27, lib/accountExport.ts +
  settings/DataPrivacySection.tsx + app/api/account/export/route.ts): a new
  LAST section, deliberately set apart from the settings stack by a heavier
  rule (mt-4 pt-8 border-t-2) — these are rights, not preferences, and the
  destructive half must never read as one more row next to a theme toggle.
  Ships the EXPORT half only. GET /api/account/export streams a JSON
  attachment (profile, quiz_results, achievements, group_memberships,
  duel_history) with Cache-Control: no-store. It takes NO caller-supplied
  input — no params, no body — so the caller's own JWT is the only thing that
  selects rows; RLS is the scoping boundary and the .eq("user_id", …) filters
  are belt-and-braces for the indexes. SYNCHRONOUS on purpose: five indexed
  owner-scoped reads with no join fan-out, so a job runner would add a store, a
  status endpoint and a delivery path to save milliseconds. NO RATING is in the
  export and none can be — player_ratings is unreadable even by its owner
  (017), so the standing "never render the rating" rule holds for free.
  buildExportPayload() is pure and lives in lib/ so the document shape is
  testable without a database. ACCOUNT DELETION IS DELIBERATELY NOT BUILT and
  renders nothing at all — it is blocked on a decision about content other
  users depend on. Note for whoever builds it: six FKs to profiles have NO
  ON DELETE action (results.user_id, questions.created_by, questions.reviewed_by,
  quizzes.created_by, generation_batches.created_by, question_reports.resolved_by),
  so deleting an auth user FAILS TODAY; and groups.owner_id ON DELETE CASCADE
  chains through questions/quizzes.group_id into results, so cascading an owner
  would destroy other members' quiz history. Do not add a delete control before
  that is resolved
- Legal surface (2026-08-29, app/(legal)/** + lib/legalDoc.tsx + proxy.ts
  publicRoutes + migration 036 + docs/release/legal/*.md): the public /terms,
  /privacy and /subprocessors pages for the 1.0 release. No Figma source; the
  (legal) layout is composed from classes already in use (the AuthScreen logo
  chip, border/muted tokens, a max-w-3xl reading column) — same precedent as
  NotificationBell and Groups. The three markdown files under
  docs/release/legal/ are the SINGLE SOURCE OF TRUTH (reviewed legal copy); the
  pages readFileSync them at build time (force-static, so no runtime fs on
  Vercel) and render them through lib/legalDoc.tsx, a deliberately small
  Markdown-SUBSET renderer — NOT a general engine and must not become one. It
  handles only the constructs those files use, which is why there is no markdown
  npm dependency; blockquotes are dropped on purpose because the only
  blockquotes in the source are maintainer notes ("Source of truth", "Not legal
  advice") that must not reach users. proxy.ts gained a publicRoutes list read
  signed IN and OUT — kept SEPARATE from authRoutes, which also bounces
  signed-in users away. Do not fold the legal routes into authRoutes
- AuthScreen (app/(auth)/AuthScreen.tsx): sign-up clickwrap RESTORED
  (2026-08-29), deliberately REVERSING the 2026-07-06 entry that removed the
  Terms/Privacy line. Register mode now shows a required consent checkbox ("I am
  13 or over and agree to the Terms of Service and Privacy Policy", links to
  /terms + /privacy) gated in handleSubmit, plus a short consent-by-action note
  under the Google/Discord buttons for the OAuth path (which bypasses the form).
  Consent is RECORDED server-side by migration 036: handle_new_user() stamps
  profiles.terms_accepted_at + terms_version on every new profile. Composed from
  classes already in AuthScreen; the checkbox uses accent-brand. Do not remove
- Age floor lowered 16 → 13 (2026-09-01), deliberately REVERSING the DoR's locked
  "16+ only" decision. The 16+ bar mirrored GDPR Art. 8's DEFAULT digital-consent
  age, but Art. 8 only bites when the legal basis is CONSENT — Colloquiz's basis is
  contract (Art. 6(1)(b)) + legitimate interests, so nothing forces 16, and 16+
  needlessly excluded the secondary-school audience an educational quiz app exists
  for. 13 is the global baseline (US COPPA, lowest GDPR member-state age, UK DPA
  2018). Copy/clause change only — no DOB is collected and there is no server-side
  age logic, just the boolean clickwrap; no migration, terms_version stays '1.0'.
  Touched: legal/terms-of-service.md §2 (+ an under-18 parental-permission clause),
  legal/privacy-policy.md §3.1 + §11, AuthScreen.tsx (4 strings), and the DoR /
  next-session decision records. Under-13 restricted "Child Accounts" (verifiable
  parental consent) are DEFERRED to 1.1 and must NOT be promised in the public docs
- Settings > Data and privacy — DELETE half added (2026-08-29, migration 037 +
  lib/accountDelete.ts + lib/supabase/admin.ts + app/api/account/delete/route.ts +
  settings/DataPrivacySection.tsx). Right to erasure by ANONYMISATION, not row
  deletion (see docs/adr/0002-account-erasure.md — six FKs to profiles block a
  hard delete; groups.owner_id CASCADE would destroy other members' history).
  delete_my_account() (SECURITY DEFINER, returns JSONB) BLOCKS with the group
  list if the caller owns a group that still has other members (do NOT
  auto-transfer — locked in ADR 0002), else anonymises the profile
  (display_name → 'Deleted user', nulls name/city/avatar, sets deleted_at +
  leaderboard_opt_out), deletes solo-owned groups + transient data, and leaves
  results/authored content in place unattributable. The route then removes avatar
  objects and BANS the auth user with the SERVICE ROLE (ban, not delete — the FKs
  forbid delete); ban is the erasure mechanism. 037 also adds `deleted_at IS NULL`
  to the three leaderboard RPCs (belt-and-braces over the opt-out the RPC sets).
  NO column GRANT for deleted_at (same reasoning as 036: written only by the
  SECURITY DEFINER RPC). The route takes NO caller input — JWT is the only
  selector, mirroring the export route. UI is a danger-zone block below the export
  with a type-"DELETE" confirm dialog, export offered first; composed from the
  existing Dialog/Input + destructive-* tokens. lib/supabase/admin.ts is the
  first service-role client — server-only, bypasses RLS, never reaches the
  browser. Do not add a hard-delete path before the six FKs are redesigned (1.2)
- Ops & resilience surface (2026-08-29, Session E). No Figma source for any of it;
  the visible pieces compose from existing card/border/destructive tokens and the
  ErrorDialog copy voice (the NotificationBell precedent).
  • Error boundaries: app/global-error.tsx (INLINE-styled — it replaces the root
    layout, so globals.css/ThemeProvider/Geist are NOT available; a boundary that
    depends on what just failed is no boundary), app/not-found.tsx (root 404 in the
    root layout), app/(main)/error.tsx and app/(auth)/error.tsx (client boundaries;
    (main) renders INSIDE the shell so the sidebar survives one page's throw).
  • Sentry: lib/sentryScrub.ts is a pure, SDK-type-free PII scrubber (drops the whole
    cookie jar incl. the sb-* session, Cookie/Authorization/sb-* headers, email, IP)
    wired into every beforeSend; sendDefaultPii is off. Init split per runtime
    (sentry.server/edge.config.ts + instrumentation-client.ts) and loaded by
    instrumentation.ts register(). INERT without NEXT_PUBLIC_SENTRY_DSN and
    production-only, so dev/CI/build send nothing. Create the project in the EU region.
  • CSP is REPORT-ONLY and NONCE-FREE on purpose (next.config.ts headers()): a
    nonce-based CSP forces every page to render dynamically, discarding the app's
    static/streamed rendering — the cost is keeping 'unsafe-inline' for the framework
    and next-themes inline scripts. Do not switch to nonces without accepting that
    trade. Allows Supabase REST+wss, Sentry ingest, the Vercel analytics script/beacon.
  • Vercel Analytics + Speed Insights (<Analytics/> + <SpeedInsights/> in layout) are
    cookieless — this is load-bearing for the no-cookie-banner decision; do not swap in
    a cookie-setting analytics tool.
  • Metadata/OG: app/icon.tsx, apple-icon.tsx, opengraph-image.tsx generate the brand
    images via next/og from lib/site.ts (SITE_URL falls back to https://colloquiz.app);
    the brand hexes are duplicated in lib/site.ts because Satori has no CSS-var access.
    metadata.robots is index:false to match the noindex launch; app/robots.ts is the
    site-wide rule and /robots.txt is in proxy.ts publicRoutes (or it 307s to /login).
  • Export rate limit: migration 038 mirrors feedback_rate_limit (026) — a log table
    counted by a BEFORE INSERT trigger raising PT429; the route logs-and-counts BEFORE
    the reads. Same "cap lives in the DB, holds even for a direct PostgREST caller" rule
- `figma-export/` retired (2026-09-20, docs/decisions/0001-retire-figma-export.md): the
  folder deleted, the port finished and the app moved past it. The running app is now
  the reference. The replacement constraint: new UI composes from components already in
  `app/components/` and classes already used elsewhere in the app — the NotificationBell
  / Groups / Leaderboard / Duels precedent, already most of the app — and colours come
  from tokens in `app/globals.css`, never new hex literals. `figma-export/` was untracked
  and `.gitignore`'d, so nothing in `git log` removes it; the tree is archived at tag
  `archive/figma-export` (`git show archive/figma-export --stat`) before deletion.
  `app/components/figma/**` (incl. `ImageWithFallback`) is LIVE RUNTIME CODE, not part of
  the export, and survived this pass deliberately — the name is a leftover, the code is
  not. A "per Figma" or "matches Figma" comment found with no folder to check against
  should land here, not be treated as broken
- AppSidebar: a "Course editing" section added (2026-09-24, AUTH-007,
  docs/decisions/0041) for a signed-in user who holds a `course_editors` grant
  but is NOT an admin — a single "Courses" link to `/app/admin/courses`,
  reusing the same route and icon (`Library`) as the existing Admin section's
  "Courses" entry rather than a second component. An admin who is also an
  editor sees only the Admin section's Courses link; the two are mutually
  exclusive (`isCourseEditor && !isAdmin`) so nobody gets the entry twice.
  Modelled on the existing Author section's structure (its own `NavItem[]`,
  its own conditional block in `RoleSections`), not on the Admin section's
  multi-item list — course editing is one link, not a sub-app. `isCourseEditor`
  is a head+count query against `course_editors` scoped to the caller's own
  `user_id`, resolved through the same `sidebarPromise` as the duels badge and
  unread count so all three streamed slots settle together. Do not add
  Quiz Builder / Review Queue / Feedback to this section — those stay
  admin-only per docs/decisions/0025/0041.
- Lesson player: adaptive content width on wide screens (2026-09-26, ad-hoc,
  docs/decisions/0043). `LessonPlayer.tsx`'s column grows from `max-w-xl`
  (576px) to `lg:max-w-5xl`, and each block gets one of three widths, decided
  per block type by the pure `lessonBlockWidth()` (`lib/lessonPlayer/
  blockWidth.ts`), never by the block component itself: WIDE (no wrapper
  class, full column) — `image`, `video`; FIT (content-sized, clamped between
  reading width and the column — `lg:mx-auto lg:w-fit lg:min-w-[42rem]
  lg:max-w-full`) — `table` only, so a sparse table sits at reading width and
  a wide one grows up to the column before its own `overflow-x-auto` takes
  over; READING (`w-full lg:max-w-2xl lg:mx-auto`, centred) — every other
  theory block, EVERY PRACTICE BLOCK, the progress banner and the per-block
  explanation lines. `table` started as WIDE in the first pass of this
  decision and was moved to its own FIT band on owner review — a wide table
  always claiming the full column made even a small 2-column table stretch
  edge-to-edge; DO NOT put it back on WIDE. Practice blocks (incl.
  `matching`) deliberately stay at reading width; giving them the wide column
  without a layout redesign is PLAY-010's job, not this task's. A wide image
  or video is therefore intentionally wider than the reading text on both
  sides (a "breakout" look) — seen as intended, not a bug, pending a look in a
  real browser; if that reads as broken too, the FIT treatment already given
  to `table` is the precedent to reach for, not a bespoke fix.
  `HeadingBlockView` itself carries NO width or alignment class — heading
  centring lives at the wrapper level: a dedicated `HEADING_WIDTH_CLASS`
  (`"w-full lg:max-w-2xl lg:mx-auto lg:text-center"`), applied only to
  `heading` blocks by `LessonPlayer.tsx`'s own `widthClassFor()`, deliberately
  distinct from `READING_WIDTH_CLASS` (owner review, 2026-09-26: a
  left-aligned heading above/below a wide block read as hanging over its
  first third, so heading centring is explicit policy, not a shrink-to-fit
  side effect a future session might "fix" away — DO NOT move this back onto
  the `<Tag>` inside `HeadingBlockView`). `next/image`'s `sizes` on
  `ImageBlockView` moved from `640px` to `1024px` to match. Class strings live
  in `app/components/lesson-player/columnLayout.ts` as full literal strings
  (`LESSON_COLUMN_CLASS`, `LESSON_HEADER_COLUMN_CLASS`, `READING_WIDTH_CLASS`,
  `HEADING_WIDTH_CLASS`, `FIT_WIDTH_CLASS`, `THEORY_BODY_TEXT_CLASS`);
  `PreviewClient.tsx` and `lesson-player-demo/page.tsx` both import
  `LESSON_HEADER_COLUMN_CLASS` (re-exported from the `lesson-player` barrel)
  for their own headers instead of repeating `max-w-xl`, so the three surfaces
  cannot drift apart the way they had. Was briefly named `layout.ts`; renamed
  to `columnLayout.ts` because Next's App Router treats any file named
  exactly `layout.{js,jsx,ts,tsx}` anywhere under `app/` as a route-layout
  convention file — do not rename it back. ALSO INCLUDES a `text-sm` →
  `text-sm lg:text-base` experiment on every theory block's body text (not
  captions, not `self_check`'s `<input>`/`<textarea>`), isolated to
  `THEORY_BODY_TEXT_CLASS` so it reverts in one line if it reads wrong. Below
  `lg` (1024px) nothing changes — every new class is `lg:`-prefixed. No new
  `overflow` was added on any ancestor between the matching bank and the page
  scroller (docs/decisions/0039 Decision 5 still holds).
- Sentry removed entirely (2026-09-26, OPS-012, docs/decisions/0046 +
  docs/decisions/0047). SUPERSEDES the Sentry bullet in the 2026-08-29 "Ops &
  resilience surface" entry above — that bullet describes code that no longer
  exists: `lib/sentryScrub.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`, `instrumentation-client.ts` and `instrumentation.ts`
  are all deleted, `next.config.ts` no longer wraps with `withSentryConfig`
  and its CSP `connect-src` no longer allows the Sentry ingest origins, and
  `@sentry/nextjs` is out of package.json. `app/(main)/error.tsx` (and the
  other error boundaries) keep their existing user-facing behaviour — only the
  "reaches Sentry in production" comment is gone, since nothing reads the
  console.error call downstream now. Reason: never wired to a monitored
  destination anyone acted on, so its bundle-byte cost on every route
  (including every future English route), its CSP allowance and its
  PII-scrubbing surface were paid for no realized benefit — owner-approved,
  see docs/decisions/0046's "Sentry" section. Do not re-add error monitoring
  without picking a destination someone will actually watch first.
- English surface (`app/(english)/**`) introduced (2026-09-26, SHELL-007,
  docs/decisions/0049): its own root layout per docs/decisions/0046 —
  `<html lang="ru">`, Geist Sans only (no Geist Mono, no ThemeProvider, no
  katex CSS), a small inline script that adds `.dark` from
  `prefers-color-scheme` with no toggle. Its in-segment `not-found.tsx` and
  the app-root `global-not-found.tsx` (behind `experimental.globalNotFound`)
  compose from the SAME token classes and layout as the Colloquiz
  `(colloquiz)/not-found.tsx` precedent (`bg-background`,
  `text-muted-foreground`, `bg-brand` — no new hex literals) rather than a
  bespoke look; the two 404s read as the same page in two languages, not two
  designs. All learner-facing strings on this surface come from
  `lib/alliengll/copy.ts`, in Russian, with no locale-selection mechanism —
  this is one surface written in one language (docs/handoff.md, "Audience
  and language", 2026-09-24 delta), not an i18n layer. Do not add English
  strings to English-surface chrome, and do not add a language switcher.
- CourseDetailView (2026-09-26, AUTH-008): the "Course details" form gains a
  catalogue-summary input (bound to `courses.subtitle` — see the
  `AuthoredCourse` comment in `lib/courseAuthoring.ts` for why the field is
  named `subtitle`, not `summary`) with a live `N/200` counter mirroring
  `COURSE_SUBTITLE_MAX_LENGTH`, and a cover-image `LessonImageUploadButton`
  reused as-is from the lesson-content editor (AUTH-004) — same bucket, same
  limits hint, same client+bucket-enforced validation, same deferred-deletion
  contract (the replaced object is only removed after `saveMetadata`
  succeeds, never on upload). A new "Catalogue card preview" section below
  the form — cover in an `aspect-video` box (the only precedent for an
  authored image's aspect ratio, `ImageBlockView`), title, summary — lets the
  partner see whether her cover and summary work BEFORE she publishes. This
  is explicitly a preview, not the catalogue card's final design: no
  catalogue-card component exists yet (SHELL-010 builds the real one), so
  this composes from existing `bg-card`/`border`/`rounded-2xl` classes only
  and should be revisited (not necessarily kept) once SHELL-010 lands a real
  card to preview against instead. No Figma source; composed entirely from
  classes already used elsewhere in this same file and in the lesson editor —
  same precedent as NotificationBell/Groups. Do not build a second image-
  upload component for the cover.
- Practice renderers: explanations moved from a block-level list to a
  per-sub-part "Why?" (2026-09-26, PLAY-008, docs/decisions/0053). The
  `text-destructive-text` explanation list `LessonPlayer.tsx` used to render
  below a whole practice block is GONE; each of the five renderers now
  computes its own `resolveExplanations(item, result)` lookup and renders a
  shared `ExplanationDisclosure` (`app/components/lesson-player/practice/
  ExplanationDisclosure.tsx`) directly beneath the wrong row/pair/element/gap
  — a real `<button aria-expanded>`, 44px target (0029 Decision 4 precedent),
  collapsed by default, neutral `bg-muted`/`text-muted-foreground` tokens
  (never `destructive-*` — the wrong state is already signalled by the row's
  own tint and ✗ marker). Stays WRONG-ONLY on purpose: the issue's own
  acceptance flagged extending `resolveExplanations` to correct sub-parts too
  as a stop-and-ask, and the call (put to the user directly) was to leave
  0017's resolver contract alone. `selection_grid` rows and `matching` left
  rows are now visibly numbered 1, 2, 3 … — both confirmed unshuffled first
  (`selection_grid`'s rows never went through `shuffleForItem`; `matching`'s
  `left` doesn't either, only `right` does). `ordering` is NOT numbered here
  (that's PLAY-009's line) and `slots` gaps — inline in a running sentence,
  not a row of their own — get a small "Gap N: Why?" list below the sentence
  instead of an inline expansion, so a multi-line explanation never breaks
  mid-sentence. `selection` (one SubResult per item, 0009) gets exactly one
  disclosure below the whole option list, not per-option. Do not restore the
  block-level list, and do not make a gap's "Why?" expand inline without
  redesigning `slots`' layout first.
- Ordering: grip handle is now the ONLY pointer/touch control (2026-09-26,
  PLAY-009, docs/decisions/0054). The ▲/▼ move-button pair `OrderingRenderer`
  carried alongside the grip handle since 0030/0032 is GONE — three controls
  per row for one action was a partner review complaint. Keyboard reordering
  is unaffected: it was never the buttons' feature alone, dnd-kit's
  `KeyboardSensor` (`sortableKeyboardCoordinates`) was already spread onto
  the SAME grip-handle button via `{...attributes} {...listeners}` (0032),
  so removing the buttons removes a redundant path, not the only one — now
  verified by an RTL test (`OrderingRenderer.test.tsx`) that drives Space →
  ArrowDown → Space on the handle and asserts the rendered row order changes,
  the first time this repo's dnd-kit keyboard path has been driven end to end
  rather than only unit-tested at the pure-function layer. Each row now shows
  its live position (`{position + 1}.`), reusing the exact numbering span
  `docs/decisions/0053` (PLAY-008) already established for `matching`/
  `selection_grid` rows, rather than a new style. `lib/lessonPlayer/
  orderingResponse.ts`'s `moveOrderElement` wrapper (only the buttons' caller)
  was deleted with it — `moveOrderElementToIndex` is unchanged and still the
  one function both drag and (previously) the buttons went through. A
  `text-xs text-muted-foreground` hint ("Hold and drag the handle to
  reorder.") was added under the prompt because the buttons' own affordance
  (a pressable-looking button) is gone and the 200ms touch press-and-hold has
  none of its own. The handle also gained its own `focus-visible:ring-2
  focus-visible:ring-brand` (it used to share the row's visible keyboard
  focus with the now-removed buttons) — same token pairing already used in
  `SelectionRenderer`/`SlotsRenderer`/`ExplanationDisclosure`/`SubjectGrid`.
  Do not re-add the move buttons.
- Matching: a placed answer moves to a full-width line below the left
  content (2026-09-26, PLAY-010, docs/decisions/0055) -- superseding 0039
  Decision 1's "row height never moves" claim, which is corrected rather
  than defended: it held only for the empty slot, not a filled one (`w-28`
  wraps a long answer onto multiple lines and grows the row regardless).
  `SlotTarget` now renders inline (`w-28`, next to the left content) only
  when the slot is empty; once filled, it renders full-width on its own line
  below, for EVERY answer, not only long ones -- a character-length
  threshold was considered and rejected, since the gap between the shortest
  long-answer item (74 chars) and the longest short one (54 chars) is not a
  rendering fact, and the box wrapping is. The bank stays stacked below the
  rows (0039 Decision 5 unchanged); a side-by-side rows/bank layout (the
  same issue's other partner-review note) was decided against for now --
  phone-first traffic sees no benefit from it, and it would narrow the row
  column further, working against this same fix. Do not put the placed
  answer back in an inline fixed-width box.
- Lesson completion screen added (2026-09-26, PLAY-007, docs/decisions/0058):
  a new `LessonCompletion` section (`app/components/lesson-player/
  LessonCompletion.tsx`) renders UNCONDITIONALLY after `LessonPlayer`'s last
  authored block, inside a `bg-card`/`border-border` card matching the
  `app/(english)/error.tsx` / `not-found.tsx` idiom (no new hex — see 0058
  Decision 1 for why this is a footer, not a gated "lesson finished" state,
  since the player is a single scrolling page with no such transition to
  gate on). Contents: the Russian score line (`alliengllCopy.completion.
  scoreLabel`, shown only once `scoreSession(...).status === "scored"`), a
  consolidated "Разбор ответов" explanation review built from
  `explanationsForSession` (0058 Decision 2 — this DELIBERATELY duplicates
  the same wrong-sub-part text a per-item inline "Why?" already shows, per
  0053; not a bug), a next-lesson `<Link>` when `getNextLesson` (lib/
  publicLesson.ts) finds one by ordinal within the course, and an empty
  `RegistrationOfferSlot()` reserved for ANON-004 (which depends on this
  card, not the reverse — it isn't built yet, so the slot renders nothing).
  A new `data-testid="lesson-blocks"` wrapper (`className="contents"`, so it
  adds no extra flex child and doesn't disturb `LESSON_COLUMN_CLASS`'s
  `gap-4`) was added around the authored-block map purely so
  `LessonPlayer.test.tsx` can scope a query to "the inline copy" versus this
  new review section's copy of the same text. Separately, each of the five
  `next/dynamic()` renderers in `app/components/lesson-player/practice/
  index.tsx` gained a text-free, height-reserving `loading` skeleton (0058
  Decision 3) for the client-side-navigation chunk-flash gap 0057 had left
  unaddressed — deliberately NOT `PracticeBlockPlaceholder`, whose English
  "renderer not yet available" copy would be a language bug if it ever
  flashed on this Russian-chrome surface. Do not remove either the
  `lesson-blocks` wrapper or the per-renderer `loading` skeletons without
  re-reading 0058.
- Matching, `presentation: "sort"`: a new bucket renderer (2026-09-26,
  PLAY-011b, docs/decisions/0060) replaces the row/bank "tap to match" layout
  for categorisation items — visible category buckets the learner sorts
  statements INTO, not rows with answer slots (partner review note 5).
  `app/components/lesson-player/practice/BucketRenderer.tsx` is dispatched
  from `MatchingRenderer.tsx` by a one-line `if (item.payload.presentation ===
  "sort")` — NOT a new lazy chunk, since a presentation is a rendering variant
  of `matching`, not a new item type (0057's "one chunk per type" boundary
  still holds). That `if` had to move ABOVE `MatchingRenderer`'s own hooks
  into a hookless wrapper (`PairsMatchingRenderer` now holds the original
  body) — an early return before `useMemo`/`useState` in the same component
  breaks the Rules of Hooks the moment `presentation` differs across renders.
  TOPOLOGY DELIBERATELY INVERTS docs/decisions/0039 Decision 2: there, the
  risk was a shrinking BANK (drag-from pool) making the last row solvable by
  elimination, so the right/bank side was made non-consumable and only the
  left/row side filled up. Here the pool learners drag FROM is the
  statements (`left`) and they genuinely ARE consumed one placement at a
  time — a statement renders in exactly one place (the pool, or its bucket),
  a single draggable node, the same "consumed, not dual-noded" shape
  `slots.ts`'s `DragSlots` already uses (0032 Decision 3) rather than
  matching's reusable-bank shape. What must NOT shrink or disable here is the
  TARGET side instead: every bucket (`right`) stays a valid drop target for
  every remaining statement regardless of what it already holds, so
  elimination-by-"only one bucket is still open" can't return. Buckets
  render in AUTHORED order (never shuffled — they're column headers, not
  answer options, same reason `left` is never shuffled in the pairs
  renderer); the statement pool IS shuffled (`shuffleForItem`), for the same
  reason the old bank was — unshuffled statement order could leak grouping.
  State reuses the EXACT SAME `Map<leftId, rightId>` shape and the already-
  generic `setMatchingPair`/`clearMatchingPair`/`buildMatchingResponse`
  helpers in `lib/lessonPlayer/matchingResponse.ts`, unchanged — no new pure
  functions exist behind this renderer, since "statement maps to bucket" is
  exactly the left->right pairing `score()` already consumes.
  `moveMatchingPair`/`firstEmptyLeftId` are unused here: a bucket has no
  "empty slot" to auto-fill, and moving a statement between buckets is just
  overwriting its one map entry. Layout: `grid grid-cols-1 sm:grid-cols-2`
  (a literal, non-dynamic Tailwind class — bucket count varies per item and
  Tailwind only sees complete class strings in source, the Progress > History
  precedent) so narrow widths stack vertically with no horizontal scroll, and
  no bucket carries a height cap, so it grows with its placed statements
  (`f5-sort` puts 4 in one bucket). Feedback on submit: a wrong statement
  stays exactly where the learner put it (never moved) with a "Correct:
  <bucket>" note plus the standard PLAY-008 `ExplanationDisclosure` "Why?";
  an unplaced statement is marked wrong in the pool. Verified in a real
  browser (Edge via Playwright, temp admin test user, cleaned up after) at
  both 1280px and 375px viewports against `f5-sort`-shaped fixture data —
  buckets side-by-side and growing at desktop width, stacked at mobile width,
  tap-to-place moving a statement from pool into a bucket. `npm run budget`
  FAILs on `/courses/future-imperfect/*` before AND after this change
  (confirmed via `git stash`) — a pre-existing prod-build data gap unrelated
  to this card; `/login`'s budget (284.0 KB / 380 KB) is unchanged, and this
  card added no code to any English-surface route. Do not add height caps to
  `Bucket`, and do not make buckets draggable/shuffled.
- `app/(english)/EnglishFooter.tsx` added (2026-09-27, SHELL-012,
  docs/decisions/0062): a single centred footer line, rendered from
  `app/(english)/layout.tsx` below `{children}` so it appears on every page
  under the English root layout — `border-t border-border`, a
  `text-muted-foreground` link to `/app` (`hover:text-foreground`, existing
  token pairing). This is the ONLY link off the English surface to Colloquiz,
  per docs/handoff.md's settled "footer link only" answer — no header, no
  sidebar, no toggle. Copy lives in `lib/alliengll/copy.ts`
  (`footer.colloquizLink`), Russian, same rule as the rest of that module.
  `npm run budget` re-confirmed `/login` unchanged (284.0 KB / 380 KB); the
  pre-existing `/courses/future-imperfect/*` FAIL (0060) is unaffected and
  was re-verified via `git stash -u` on this same change. Do not add a
  second path to `/app` (a header nav entry, a toggle) without re-confirming
  with the owner first.
- `/` gets a real landing page (2026-09-27, SHELL-010, docs/decisions/0070):
  `app/(english)/page.tsx` — hero (`alliengllCopy.landing`), then a course
  catalogue grid (`CourseCard.tsx`, cover/level-badge/title/subtitle, mirrors
  the `/courses/[courseSlug]` page's own cover-block styling so a tap into a
  course reads as the same object growing). SHELL-013's temporary `/` →
  `/app` 307 is REMOVED from `next.config.ts` entirely — `curl -I /` returns
  200 straight from this route now. The hero's primary CTA deliberately
  skips the catalogue and links straight to the first published course's
  first free-sample lesson (SHELL-008's `firstFreeLesson()`, reused, not
  reimplemented) so the reel-to-lesson path is genuinely one tap from `/`,
  per the acceptance line — the catalogue link next to it is the secondary,
  browse-instead-of-jump-in path. `lib/publicCatalogue.ts` (new file, not
  added to the pre-existing `lib/courseCatalogue.ts`) holds the listing
  query: `courseCatalogue.ts` is imported into a Client Component
  (`CourseDetailView.tsx`) for its `COURSE_SUBTITLE_MAX_LENGTH` constant, and
  putting a `@/lib/supabase/server` import in the same file broke `next
  build` outright (confirmed by a real build failure, not assumed) — keep
  the split. Measured `npm run budget`: `/` is 172.0 KB against a 180 KB
  target (new ROUTES entry); `/login` unaffected; the pre-existing
  `/courses/future-imperfect/*` FAILs (0060/0062, no local Supabase stack in
  this environment) are unrelated and unaffected. Do not fold
  `getPublishedCourses()` back into `courseCatalogue.ts`.
- Lesson player chrome, fully wired to `lib/alliengll/copy.ts` (2026-09-27,
  SHELL-011, docs/decisions/0071): every practice renderer's "Submit" button
  and a long tail of other player chrome (True/False, "Tap to match", "Return
  to pool", "All words placed"/"All statements sorted", the "Gap N"/"Gap N:"
  labels, "Clear", the "Correct: <bucket>" note, the shared
  `ExplanationDisclosure`'s "Why?"/"Hide", `ExampleBlock`'s default "Example"
  label, `SelfCheckBlock`'s placeholder/"Model answer"/"Show model answer",
  `VideoBlock`'s title/play label/"Click to play video") were hardcoded
  English on this Russian-only surface (docs/handoff.md, "Audience and
  language") — some ignoring `alliengllCopy.player.submit`/`.why`, which
  already existed in Russian and were simply never imported. `LessonPlayer.tsx`'s
  own progress banner (previously "Progress: X% (...)", flagged but
  deliberately left unfixed by 0058) now reuses
  `alliengllCopy.completion.scoreLabel` — the same string `LessonCompletion`
  renders — so the banner and the completion box read identically once a
  lesson is scored; THIS DUPLICATION IS NOT NEW (the banner predates
  PLAY-007's completion box per 0058) and was not removed here — only its
  language was fixed. Screen-reader-only `aria-label`s that interpolate
  authored text (drag/gap descriptions) were deliberately left in English —
  deferred, not judged unimportant; see 0071. Also: lesson headings
  (`HeadingBlockView`) gained an `lg:` size step (`lg:text-xl`/`lg:text-lg`)
  and `LESSON_COLUMN_CLASS`'s block gap grew `lg:gap-6`, matching the `lg:`
  body-text precedent decision 0043 already set — the column grew to
  `max-w-5xl` at `lg` in that card but headings/spacing never scaled with it.
  Nothing changes below 1024px. Do not add a locale-selection mechanism to
  satisfy this — copy stays a flat, Russian-only object per the standing
  "one surface, one language" rule.
- ResetPasswordScreen: an "expired link" view added (2026-09-27, SHELL-015,
  docs/decisions/0073) for a visitor with no live session — an anonymous curl,
  a reused link, or a stale bookmark. `page.tsx` became an async Server
  Component that checks `supabase.auth.getUser()` and passes `hasSession` to
  `ResetPasswordScreen`; the component also flips to this view mid-flow if
  `updateUser` itself fails with `AuthSessionMissingError` (a session valid at
  page load can still be gone by submit time). The view reuses the exact
  `AuthLeftPanel` shell and the destructive-box styling already established by
  the login page's error banner, and its "Back to sign in" link points at
  `/login?error=recovery_expired` — the same URL and copy
  (`RECOVERY_EXPIRED_MESSAGE`, now exported from `login/page.tsx` instead of
  duplicated) that `/auth/confirm`'s own expired-token branches already use.
  `hasSession` is deliberately named for what it actually checks — ANY live
  session, not a recovery-specific one, since Supabase gives no way to tell
  the two apart. A signed-in (non-recovery) user who navigates here still sees
  the update-password form, unchanged from before this card; that a password
  change here needs no reauthentication is a separate, pre-existing gap this
  card does not fix (proposed as a follow-up card in #122's closing comment).
  Verified against the real recovery flow, not just curl: a `token_hash`
  minted via the Admin API and passed through `/auth/confirm` exactly as
  `docs/release/launch-checklist.md`'s configured email template does (`?
  token_hash=...&type=recovery&next=/reset-password`) lands on
  `/reset-password` showing the form — Supabase Admin API's own
  `generateLink()` `action_link` was tried first and does NOT match
  production: it uses Supabase's hosted `/verify` redirect, which delivers
  tokens in a URL fragment `/auth/confirm` never sees, landing on
  `/login?error=confirm_expired` instead. Do not use `generateLink()`'s
  `action_link` directly to test this flow again — build the `token_hash` URL
  by hand as this card's verification script did.
- Landing page rebuilt from a Claude Design import (2026-09-28, ad-hoc, option
  "1a — Catalogue-first" of the "Alliengll landing page options" project),
  with three deliberate departures from standing decisions, each an explicit
  owner overwrite in this session:
  1. **EN/RU toggle, landing page ONLY.** `LandingHeader.tsx` (new) adds a
     working language switch, reversing the "no locale switching" clause of
     the 2026-09-24 "Audience and language" decision — but only for `/`. See
     the carve-out now in `docs/handoff.md`, "Audience and language". Every
     other English route (course page, lesson player, completion, signup
     offer) is untouched: still Russian-only, still `lib/alliengll/copy.ts`,
     still no switcher. `app/(english)/landingCopy.ts` (new) holds the
     landing page's own `{ ru, en }` strings — deliberately NOT merged into
     `lib/alliengll/copy.ts`, so the rest of the surface can't accidentally
     inherit the toggle. `catalogue.title` / `catalogue.empty` moved out of
     `lib/alliengll/copy.ts` into `landingCopy.ts` (the catalogue's only
     home today is this page); `catalogue.freeSampleBadge` stays, unused by
     this card, for whenever a paid/free badge is built.
  2. **"Alliengll" rendered as the header wordmark.** This is NOT the
     branding decision `docs/handoff.md`'s "Open questions" still defers —
     `alliengllCopy.siteName` stays `"Colloquiz"`, and `layout.tsx`'s
     `<title>`/metadata are untouched. It is literal display text on one
     page, owner-approved as a demonstration of the page title, not a rename.
  3. **A "Log in" link in the header**, `/login` — new; nothing on this
     surface linked there before (registration was offered only after a
     completed lesson, never on entry). This is additive, not a reversal:
     the post-lesson signup offer (ANON-004) is unchanged.
  Also ported from the same design, without conflict: `CourseCard.tsx` grows
  a compact ROW layout below `sm` (84px→80px square cover beside the text)
  alongside its existing stacked/grid layout at `sm:` and up — a column of
  full-width stacked cards read as mostly whitespace at 390px. The design's
  per-card "Free / First lesson free" badge was deliberately NOT ported:
  `CatalogueCourse` (`lib/courseCatalogue.ts`) carries no free/paid field,
  and decision 0070 scoped the catalogue card to cover/title/description
  only — adding entitlement data to the card is a separate decision.
  4. **`EnglishFooter.tsx` enriched to match the design's footer** (owner
     overwrite, same session, after seeing the shipped page) — superseding
     the paragraph above, which had left it out. Decision 0062's "not nav"
     clause still holds (still one link to `/app`, no new nav item); only
     its "single line" clause is superseded. Now: a bold "Colloquiz ↗"
     heading + a description line (both linking to `/app`), plus a Privacy
     link (`/privacy`, the existing legal route — decision 0062 was written
     before that route existed) and a copyright line, laid out via the same
     `LESSON_HEADER_COLUMN_CLASS` column width the rest of the surface uses
     rather than a bespoke max-width. `alliengllCopy.footer.colloquizLink`
     (the old single string) was replaced by `colloquizHeading` /
     `colloquizDesc` / `privacy` / `copyright`. **Revised same day, same
     session (owner feedback: the description line "Наше приложение с
     квизами" wasn't translating on toggle, and the footer read as too
     tall):** the footer's markup was pulled into a shared, pure
     `FooterLayout.tsx` (heading/desc/privacy/copyright as props, no i18n
     logic), sized down to the design's literal proportions — both text
     rows at 14px/13px (not the `text-sm`/`text-xs` split first shipped,
     which read taller) and `py-5 sm:py-7` instead of a flat `py-6`. Two
     callers now render it: `EnglishFooter.tsx` (unchanged behaviour —
     Russian, from `alliengllCopy.footer`, rendered on every route except
     `/`) and the new `LandingFooter.tsx` (bilingual, from two new
     `landingCopy.ts` keys — `footerDesc`/`footerPrivacy` — reading the
     landing page's own `lang` state; "Colloquiz ↗" and the copyright line
     are NOT translated, matching the design script, which only templates
     the description and the Privacy label). Root layout no longer renders
     `EnglishFooter` directly; a new client `EnglishFooterGate.tsx`
     (`usePathname`) renders `EnglishFooter` on every route and renders
     nothing on `/`, so `LandingContent` — which now renders
     `LandingFooter` itself, full-bleed, after its padded header/hero/
     catalogue column — is the sole footer on the landing page. This is the
     one client-side pathname check on this surface; everywhere else still
     resolves at the server-component layer.
  Separately: `app/(english)/page.tsx`'s `<main>` dropped `min-h-svh` — with
  few courses in the catalogue it forced the page to a full-viewport
  minimum height, padding blank space above the footer and forcing a scroll
  to reach it for no visual reason (`body` already carries `bg-background`
  globally, per `app/globals.css`'s `@layer base`, so nothing needed `main`
  to force viewport height itself). **Superseded same session, owner
  feedback:** removing `min-h-svh` fixed the forced scroll but left blank
  space stranded BELOW the footer on a short page instead of above it — the
  footer just sat wherever the content happened to end, not at the bottom of
  the viewport. Fixed properly as a standard sticky-footer flex layout,
  anchored once at `app/(english)/layout.tsx`'s `<body>` (`flex min-h-svh
  flex-col`, wrapping `{children}` in a `flex flex-1 flex-col` div so it —
  not any individual page — absorbs the leftover space above
  `EnglishFooterGate`'s natural height). This is the ONE place `min-h-svh`
  belongs on this surface; a page's own `<main>` reintroducing it double-
  counts against the footer and reproduces the original bug, which is why
  `courses/[courseSlug]/page.tsx`'s `<main>` had its own `min-h-svh` removed
  in the same pass (identical bug, not previously reported). The landing
  page needed one more step, because `LandingFooter` renders INSIDE
  `<main>` (unlike every other route's `EnglishFooter`, which is `<body>`'s
  direct sibling of the wrapper div): `page.tsx`'s `<main>` is now `flex
  flex-1 flex-col` so it stretches to fill the wrapper handed down to it,
  and `LandingContent`'s own padded content div takes `flex-1` so it grows
  and pushes `LandingFooter` to `<main>`'s bottom — the same pattern,
  nested one level deeper. `FooterLayout`'s padding/font-size were NOT
  touched by this fix (verified: footer's own rendered height is unchanged
  from the prior revision, 111px at 390px width / 77px at 1440px, on every
  route). Verified at 390×844 and 1440×900 on `/`, the course page and a
  lesson page: short content sits flush with no scrollbar, long content
  (the lesson page; the course page at 1440px) scrolls normally with the
  footer following it. **Corrected same session, owner pushback:** the three
  `min-h-svh` holdouts named above — `error.tsx`, `not-found.tsx`, and the
  lesson page's `"not_available"` (paid-preview) state — were NOT a
  theoretical risk left for later. They render as the sole child of the
  same root-layout `flex flex-1 flex-col` wrapper as every other route, with
  the footer directly below as a sibling, so each was reproducing the exact
  bug this entry describes: forced to `min-h-svh` regardless of its own
  (short) content, then the footer's height stacked on top, overflowing the
  viewport by 77–111px. Fixed in the same commit: all three swapped
  `min-h-svh` for `flex-1` (keeping their existing `flex items-center
  justify-center` centering unchanged — `flex-1` only changes how much
  space they're given, not how they use it) so each fills exactly the space
  the wrapper hands it, the same as every page above. Verified live at
  390×844 and 1440×900 on `not-found.tsx` (a bogus lesson slug): flush
  footer, no scrollbar, at both sizes — the paid-preview state and
  `error.tsx` were not triggered live (this dev environment's only
  published course has no paid lesson to preview, and `error.tsx` needs a
  genuine thrown exception, not just a bad URL) but are code-identical in
  every relevant respect (same wrapper, same `flex flex-1 items-center
  justify-center` shape) to the one that was verified.
  Do not extend the EN/RU toggle to any other route without asking again.
  **Default toggle state flipped to EN (owner, same session):**
  `LandingContent`'s initial `lang` value is `"en"` for a first-time visitor
  — a first-time visitor now sees the English hero/header/catalogue strings
  before touching the toggle. Scoped to just this: `<html lang="ru">`
  (layout.tsx) and the page's `<title>`/`description` metadata (from
  `alliengllCopy.landing`, still Russian) are untouched, and every other
  route's chrome stays Russian-only per the standing rule above.
  **Toggle choice persisted across reloads (owner bug report, same
  session):** a `useState` default alone reset to `"en"` on every refresh —
  a visitor who picked RU got bounced back to EN. Persisted via a cookie
  (`LANDING_LANG_COOKIE = "colloquiz_landing_lang"`, `landingCopy.ts`), not
  localStorage: `page.tsx` (Server Component) reads it with `next/headers`'
  `cookies()` and passes the resolved `initialLang` prop into
  `LandingContent`, so a returning visitor's saved language is already
  correct in the FIRST server response — no client-side re-render, no
  flash. A `useEffect` reading `localStorage` after mount was tried first
  and dropped: besides the visible EN→RU flash on every return visit, it's
  exactly the "derive state via `setState` in an effect" antipattern the
  `react-hooks/set-state-in-effect` lint rule (part of `npm run check`)
  exists to catch — the fix was to not need the effect, not to suppress the
  rule. `LandingHeader`'s toggle handler now also writes the cookie
  (`document.cookie`, 1-year `max-age`, no `HttpOnly` — a UI preference, not
  a security-sensitive value, so no server round trip to set it).
- Browser-tab title for `/` changed from the Russian hero headline
  ("Английский без напряжения") to "Alliengll" (2026-09-28, ad-hoc):
  `app/(english)/layout.tsx`'s `metadata.title.default` no longer reads
  `alliengllCopy.landing.heroTitle`, it's the literal string "Alliengll" —
  the same literal display text as `LandingHeader.tsx`'s wordmark, not a
  branding decision (`alliengllCopy.siteName` stays "Colloquiz", untouched).
  Only the default (the landing page, which sets no title of its own) —
  the `%s · Colloquiz` template for every other English-surface page
  (course, lesson) is unchanged.
- Landing page redesigned (2026-10-07, ad-hoc, docs/decisions/0078),
  SUPERSEDING the 2026-09-28 entry's layout (not its EN/RU toggle, cookie,
  footer or sticky-footer rules, which all stand unchanged). `/` is now:
  - a full-bleed brand-gradient hero band (`from-brand-deep via-brand
    to-brand-accent`, dot grid, glow orbs — the `AuthLeftPanel` vocabulary,
    rebuilt in `app/(english)/HeroDecor.tsx` because that panel uses
    framer-motion, forbidden on English routes);
  - `LandingHeader` moved INSIDE that band and restyled white-on-gradient
    (`bg-white/10` toggle track, active `bg-white text-brand-deep`) — do not
    move it back onto `bg-background` without redoing those colours;
  - a white primary CTA (same one-tap `heroHref`, 0070 Decision 2);
  - a tappable demo card (`HeroDemo.tsx`, one real `selection` item copied
    from Future Imperfect, styled by the player's own `optionClassName`,
    now its own module);
  - a four-tile value strip overlapping the hero's bottom edge;
  - the catalogue;
  - a three-step "how it works";
  - a closing gradient CTA card.

  Hero word chips are a SOLID `bg-brand-deep`, not translucent white:
  white-on-white vanished where they overlap the demo card.

  `CourseCard` gained a "N lessons · ~M min" line (supersedes 0070's card
  scope; minutes omitted when any lesson lacks an estimate), a
  brand-gradient level tile in place of the grey "no cover" caption, and a
  hover lift + cover zoom instead of `hover:bg-accent`; its title is now an
  `h3` under the section's `h2`. Still no free/paid badge — that's
  entitlement display, a separate decision.

  Motion is CSS only: tw-animate-css entry stagger, `.landing-float`, and a
  `.reveal-on-scroll` driven by `animation-timeline: view()` inside
  `@supports` (unsupported browsers just show the section; nothing waits on
  JS). All of it is off under `prefers-reduced-motion`.

  Decorative markup (`GradientBackdrop`, `HeroChips`, `valueIcons`) is
  rendered by page.tsx and passed into the client `LandingContent` as
  props so it costs no client JS — `/` is at 179.8 KB of its 180 KB budget
  (`npm run budget`), so do not import those back into the client
  component.

  New Russian copy (value strip, steps, demo feedback, closing card) is
  pending owner/partner review.
- Course page redesigned (2026-10-07, ad-hoc, docs/decisions/0079),
  following the 0078 landing vocabulary. `/courses/[courseSlug]` is now:
  - a full-bleed gradient hero band (`CourseHero.tsx`) holding
    `BandTopBar` (the "Alliengll" wordmark linking to `/`, and "← Все
    курсы" linking to `/#catalogue`; no toggle, no login), the level pill,
    a "Весь курс бесплатно" pill when every lesson is free, the title, the
    lead (the short `subtitle`, falling back to `description`), a size line
    ("N уроков · ~M мин · K заданий"), the two progress numbers as two
    glass tiles, and the white CTA ("Начать курс" when the whole course is
    free). The cover sits on the right at `lg` and above the text on a
    phone. A course with no cover gets a translucent level tile at `lg`
    only, not `CourseCard`'s gradient tile, which would be gradient on
    gradient;
  - an "О курсе" section with the full `description`, only when it isn't
    already the hero's lead;
  - "Уроки курса": numbered rows (`LessonListItem.tsx`) using the
    landing's step-number tile and the catalogue card's hover lift. Each
    row shows its minutes and exercises on the right at `sm`+, and under
    the description on a phone.

  Everything below the band is left-aligned to the hero text's column
  edge. Do not centre a narrower block under a left-aligned hero; that
  misalignment is what this replaced.

  Progress shows ONLY once something has been attempted. It is still two
  numbers, never blended (docs/handoff.md); "0 из 8" for every anonymous
  visitor said nothing. An attempted row gets a ✓ on its tile and
  "Лучший: N%".

  "Бесплатно" is per-row only when the course is NOT entirely free; on an
  all-free course it would repeat on every row. Paid rows get no lock
  icon, since the paid preview is M3.

  Shared pieces moved out of `LandingContent.tsx`, with no change to the
  landing's output: `SectionHeading.tsx`, and `surfaceClasses.ts`
  (gradient band, hero entry stagger, white CTA, glass pill, lift card).
  The page adds no client JS: every new component is a Server Component.
- Lesson images and videos at reading width (2026-10-07, docs/decisions/0079
  Decision 11), REVISING the 2026-09-26 "Lesson player: adaptive content
  width" entry, which made `image`/`video` WIDE (full 1024px column). In a
  real browser that breakout read as misaligned next to the 672px text, so
  now every block is at reading width except `table`, which keeps its own
  FIT band. The "wide" band no longer exists in `lessonBlockWidth`.
  `ImageBlockView`'s `sizes` is 672px at `lg`. Heading centring is
  unchanged. If an image really needs more room, reach for `table`'s FIT
  band, not the old breakout.
- Exercise cards (2026-10-07, docs/decisions/0079 Decision 6). A practice
  block's card is now drawn ONCE, by `LessonPlayer` (`PRACTICE_CARD_CLASS`:
  rounded-2xl, shadow-sm, `p-4 sm:p-5`), not by each renderer. The six
  renderers lost their `rounded-lg border bg-card p-3` root; do not put it
  back, or the card doubles.

  A "Задание N из M" pill tops every card. It counts practice blocks only
  and turns green with a ✓ once answered. That means answered, NOT
  correct: it goes green on a wrong answer too, on purpose.

  "Проверить" is `SUBMIT_BUTTON_CLASS` (rounded-xl, `min-h-11`, tinted
  shadow) and prompts are `PROMPT_TEXT_CLASS` (semibold, `sm:text-base`),
  both from `practice/practiceClasses.ts`. Option rows (`optionClassName`)
  are unchanged.

  The admin lesson preview and the lesson-player demo change with it, by
  design: the preview is the learner's view.
- Lesson page header and progress strip (2026-10-07, docs/decisions/0079
  Decision 5). The bare `<h1>` at the 1024px column's edge is replaced by
  `LessonBand`, a compact gradient band. It holds `BandTopBar` with "←
  Назад к курсу", the course title, the lesson title and description, and
  glass pills ("Урок N из M", minutes, exercises). The band is aligned to
  the reading column via `LESSON_READING_FRAME_CLASS`, so the title starts
  where the content starts.

  Under the band, `LessonProgressStrip` is `sticky top-0`: an icon back
  link, a progress bar of answered exercises, "x/y", and the score % once
  every exercise is answered. It is CSS sticky with no JS observer. It
  exists only on the public lesson page (via `LessonPlayer`'s
  `renderProgress`), never in the admin preview or the demo.

  REMOVED: the score banner at the top of `LessonPlayer`'s column, which
  the SHELL-011 entry above kept. It showed at the top while the learner
  was at the bottom. Do not restore it: the strip and the completion card
  carry the score.
- Lesson completion card is state-aware (2026-10-07, docs/decisions/0079
  Decision 7), REVISING the 2026-09-26 "Lesson completion screen" entry's
  always-"Урок завершён" footer.

  Until every exercise has an answer, the footer is a neutral dashed card:
  "Осталось N заданий" plus a quiet next-lesson link. Once every exercise
  is answered, it is a gradient card in the landing's closing-CTA look:
  "✓ Урок завершён", the score as a big number with "earned из possible"
  (ru-RU decimals), and a white next-lesson CTA, or "Назад к курсу" on the
  last lesson.

  The registration offer is now its own card under the score, and it
  shows only once EVERY exercise is answered, revising 0068 Decision 2's
  "any item scored". "Разбор ответов" is its own card under that.

  "Every exercise answered" comes from `sessionProgress`, NOT
  `lessonScore.status === "scored"`, which is true after the first answer.
  Do not swap them back.
- Paid lesson state (2026-10-07, docs/decisions/0079 Decision 8): the
  "not_available" screen uses the same `LessonBand` as a playable lesson,
  then one card with the existing copy and "Назад к курсу". There is no
  buy CTA (M3), and no lock icon.
- Footer and error-boundary bundling (2026-10-07, docs/decisions/0079
  "Budget"). `EnglishFooterGate` receives the footer as server-rendered
  `children` (layout.tsx) instead of importing `EnglishFooter`. The English
  `error.tsx` reads its strings from `lib/alliengll/errorCopy.ts`.

  Both changes keep the ~2.2 KB copy.ts object out of `/`'s and the course
  page's client JS: `/` went from 180.0 KB (over budget) to 177.7. There is
  no visual change. Do not import copy.ts into a client component that
  renders on those routes.
- One EN/RU toggle for the landing and course pages (2026-10-07, ad-hoc,
  docs/decisions/0080), extending the 2026-09-28 landing-only toggle at the
  owner's request. `/courses/[courseSlug]` now carries the same switch,
  `LanguageToggle.tsx`, in its band's `BandTopBar`, between the wordmark and
  "← Все курсы", with the same white-on-gradient classes the landing's
  header used. The choice is the landing's existing cookie, read
  server-side by both pages, so landing EN → course EN, RU → RU, and a
  reload keeps it. The toggle saves through a Server Action
  (`setSurfaceLang.ts`), not `document.cookie`, so the page and the root
  layout's footer re-render in the new language at once. Do not swap it
  back to a client-only cookie write: the course page and the footer would
  stay in the old language until the next full load.

  Course-page strings moved from `lib/alliengll/copy.ts` to `courseCopy.ts`
  (`{ ru, en }`). Authored titles and descriptions are not translated.

  The footer follows the route (`footerLangForPath`): the saved choice on a
  course page, Russian elsewhere, and on `/` the landing renders it from
  its own toggle state. `LandingFooter.tsx` is gone; `EnglishFooter` takes a
  `lang` and both read `footerCopy.ts`.

  Verified at 360px (no horizontal scroll; wordmark, toggle and back link
  fit on one row) and 1440px.
- Lesson chrome is English (2026-10-07, ad-hoc, docs/decisions/0080
  Decision 5), REVERSING the SHELL-011 entry's Russian player chrome and
  the 2026-09-24 rule behind it for the lesson page, at the owner's
  request. Every interface string on `/courses/[courseSlug]/[lessonSlug]`
  is English, whatever the saved EN/RU choice:
  - the buttons (Check, Why?/Hide, True/False, Clear, Return to pool);
  - "Exercise N of M", "Lesson N of M" and the lesson band's "K min · J
    exercises";
  - "← Back to course";
  - the completion card ("N exercises left", "Lesson complete", "Your
    score", "Next lesson", "Answer review");
  - the signup offer and the paid-lesson notice.

  The lesson page has no toggle, and its footer is English
  (`footerLangForPath`). Strings stay in `lib/alliengll/copy.ts`, one fixed
  language, no switch. Labels SHELL-011 had translated reuse their earlier
  English wording, except "Submit", which is now "Check".

  Authored lesson content is unchanged. The 404 and error pages stay
  Russian. The admin preview and the demo change with it, by design. Do not
  add a toggle to the lesson page, and do not move these strings back to
  Russian, without asking the owner.
- Account chip on the English surface (2026-10-07, SHELL-019,
  docs/decisions/0086). A signed-in learner sees a white circle with their
  email's initial (a person icon if the session has no email) on `/`, the
  course page and the lesson page. On `/` it REPLACES the header's "Log in"
  link, which a signed-in learner could not use (proxy.ts bounced /login
  back to /). On the course and lesson pages it sits at the far right of
  `BandTopBar`. Tapping it opens a card with "Signed in as <email>" and
  "Sign out". A signed-out visitor sees exactly what they saw before:
  "Log in" on `/` only.
  - Zero client JS on purpose. `AccountMenu.tsx` is a Server Component; the
    menu is a native `<details>`, and an open summary's `::before` is a
    fixed full-viewport layer, so an outside tap closes it. There is no
    Escape-to-close.
  - Sign-out is a plain form POST to `/auth/sign-out`, which 303s back to
    the same page, signed out. Do not turn it into a Server Action or a
    client `signOut()`: the first re-renders the lesson player in place
    with a new `attemptId`, the second ships `@supabase/ssr` to every
    English route (+63.3 KB on `/`, measured in 0086).
  - On `/`, page.tsx renders the menu in both languages and
    `LandingContent` picks one with the toggle (the `EnglishFooterGate`
    pattern). Course page: the saved language. Lesson page: English.
    Strings in `app/(english)/accountCopy.ts`.
  - The card uses the `popover` tokens and the sign-out button reuses the
    paid-lesson card's "Back to course" button classes.
  - Course page on a phone: with the toggle AND the chip in the top bar,
    "← All courses" wrapped onto two lines at 360px. In that case only, the
    back link shows just its arrow below `sm` (label kept as its
    `aria-label`). The lesson page and signed-out views keep the label.
  - Sign-out is not a path to `/app`; the footer stays the only one (0062).
- Lesson page "Your best" note (2026-10-07, ad-hoc, docs/decisions/0088).
  Owner report: signing in from the end of a lesson brought them back to a
  blank lesson, which read as lost results. A signed-in learner who has
  attempted the lesson now sees a note at the top of the lesson column, at
  reading width, in `bg-brand-subtle text-brand-text` (the exercise pill's
  tokens): "**Your best: N%** Answer again to try to beat it. Your best
  score is kept." The exercises stay unanswered; restoring the answers
  themselves was option B and was not chosen.
  - This is NOT the running-score banner 0079 D5 removed. That showed this
    visit's score at the top; this shows the best score from earlier
    visits, and the running score still lives in the strip and the
    completion card.
  - The figure is the higher of the server's best (the course page's
    "Best") and the best still in the local attempt store. The local one
    is needed right after a sign-in, before the player uploads the
    anonymous attempts. Do not drop it in favour of the server figure
    alone.
  - Signed-in learners only. The admin preview and the demo pass no
    lesson version and show nothing.
- RegistrationOffer sign-in entry (2026-10-08, ANON-016, docs/decisions/0092):
  an "Already have an account? Sign in" text link (English, lesson chrome)
  under the offer, collapsed and expanded, to `/login?next=<lesson path>`.
  Composed from the offer's existing link/text classes. Do not remove: an
  existing account had no sign-in entry on a lesson at all.
- Voice task placeholder (2026-10-10, VOICE-003, docs/decisions/0100). A
  voice task block renders in the lesson player and the admin preview as an
  exercise card (`PRACTICE_CARD_CLASS`, `PROMPT_TEXT_CLASS`) with a "Voice
  task" pill in the exercise pill's tokens. It shows the prompt, "Up to
  N min", and a disabled Record button in `SUBMIT_BUTTON_CLASS` with
  "Recording isn't available yet." (`VoiceTaskBlock.tsx`). It gets no
  "Exercise N of M" number and is not counted in the progress strip: it is
  not scored. VOICE-005 replaces the disabled button with the real
  recorder. The lesson editor's "Add block" menu gains "Voice task" below a
  separator; its form (`VoiceTaskForm.tsx`) reuses BlockForm's field
  helpers. No new tokens or classes.
- Course editor: per-lesson access level (2026-10-10, AUTH-009,
  docs/decisions/0103). The lesson row's "Free sample" switch is GONE.
  Each row now has a small Select ("Open to anyone" / "Sign-in required" /
  "Purchase required"), which calls `set_lesson_access_level` (055) through
  `.../access-level`. A refusal (`no_open_lesson`) shows as a toast. Above
  the list, one line reads "Open to anyone: <titles>". Rows that are not
  open to anyone get an eye link to a "Visitor view" page. That page
  renders the lesson page's own `LessonBand` + `LessonUnavailable`, read as
  an anonymous visitor (session-less anon client), inside a bordered frame.
  The row now wraps: the controls drop below the title on a narrow screen,
  because the Select made the row overflow at 390px. Composed from the
  existing Select, icon-button and pill classes; no new tokens. Do not
  bring back the switch, and do not render the visitor view from a
  TypeScript level-to-state mapping.
- Sign-in lesson screen (2026-10-10, ANON-011, docs/decisions/0104). A
  visitor on a lesson marked "Sign-in required" sees the lesson band, then
  the lesson's leading theory (as `lesson_teaser` cut it), then a card:
  "Sign in to open this lesson", "It's free. All you need is an account.",
  a "Sign in or create an account" button to `/login?next=<this lesson>`,
  "Or start with an open lesson: <title>" when the course has one, and
  "Back to course". English, like the rest of the lesson chrome. The paid
  state is unchanged. Composed from the paid card's frame and padding,
  `SUBMIT_BUTTON_CLASS` and the player's own block views; no new tokens or
  classes. A teaser VIDEO is a link to YouTube in a new tab, not the
  in-place embed: the player's video component, rendered here, grew every
  open lesson's JS (measured in 0104). Do not swap `TeaserBlock` for
  `TheoryBlockRenderer` without re-running `npm run budget`. The admin
  "Visitor view" shows the same screen.
- Cohort authoring (2026-10-10, AUTH-010, docs/decisions/0106). The course
  editor gains a "Format" section below the catalogue preview: a
  Self-paced / Cohort Select, locked with its reason once the course has a
  run. For a cohort course it also has a "How to join (link)" input with
  Save, a `bg-warning-subtle text-warning` notice while a run is in
  progress, and a "Runs and calls (N runs)" link. On a cohort course, each
  lesson row gets a week Select ("No week", Week 1–8) before the access-level
  Select, and an entitled lesson with no week gets a "Needs a week" warning
  pill. The row's control group is now `max-w-full flex-wrap`, not
  `shrink-0`: with the week Select it overflowed at 390px (measured). The
  new `/app/admin/courses/[id]/runs` page lists runs as cards: title, an
  Upcoming / In progress / Ended pill, start and end, and a calls list with
  edit/delete. It has a New run dialog (title, start), and the start is
  locked with its reason on a started run. A call dialog has a "Repeat
  weekly" Select. Close-run and delete confirms use AlertDialog. Times are
  shown in the editor's timezone, named on the page. Composed from the course
  editor's own classes and existing tokens; no new colours. Do not remove the
  started-run start lock: the RPC refuses the change anyway, and the lock is
  where the editor learns why.
- Cohort invites (2026-10-10, COH-003, docs/decisions/0107). The runs page
  (`/app/admin/courses/[id]/runs`) gives each run card a third section,
  "Invites (N)", below Calls, with the same header row and `+` button
  ("New invite", hidden on an ended run). Rows show the name, a state pill
  (Not claimed / Claimed / Expired / Revoked; Claimed in the run phase's
  `bg-brand-subtle text-brand-text`, the rest muted), the contact, the tier
  and the relevant date in the editor's timezone. A Revoke icon button
  (`Ban`) on a pending or claimed invite opens an AlertDialog, whose text
  says whether the learner loses access. `InviteDialog` (name, contact, tier
  Select) turns into a read-only link field with Copy (the Groups invite-link
  block's classes) after creation; the link is shown once and can't be shown
  again. The new English route `/invite/[token]` is the claim page: a compact
  gradient band (`BandTopBar` with the account chip, an "Invite" glass pill,
  the course title, run and tier pills), then one card in the paid-lesson
  card's frame, holding that state's copy and its one action. That action is
  `SUBMIT_BUTTON_CLASS` "Join the course" (a form POST) or "Sign in or create
  an account", or the secondary "Go to the course" / "Go to the home page".
  English, no toggle. Composed from existing classes and tokens; no new
  colours. Do not make the page claim on load: the button is how a learner
  on the wrong account notices before the link is spent.
- Cohort course page and the scheduled state (2026-10-10, COH-004,
  docs/decisions/0108). On a `cohort` course, `/courses/[courseSlug]`
  groups the lesson list by week (`CohortLessonList.tsx`): "Open lessons"
  (weekless) first, then "Week N" headings (`h3`, lesson titles drop to
  `h4`). A `scheduled` lesson shows "Opens <date>" in a `bg-muted
  text-muted-foreground` pill with a `CalendarClock` icon, in the week
  header when the whole week opens at one moment, else on the row. Rows
  keep their whole-list number and stay links; no lock icon. Above the
  list, `CohortInfo.tsx` renders by audience: an extended learner gets a
  "Calls" section (cards with the step-tile icon, the local date and a
  "Join" link in the paid card's `bg-brand-subtle` button classes, past
  calls muted below with no link); a basic learner gets nothing; a visitor
  gets "How the course runs" with the next start, two tier cards and a
  "How to join" link (also the hero CTA when no lesson is open). The lesson
  page's `scheduled` state reuses the paid card: "This lesson isn't open
  yet" / "It opens on <date>." / "Back to course". Dates render through
  `app/(english)/LocalDateTime.tsx`: UTC in the server HTML, the viewer's
  zone with its short name after hydration. Copy in `courseCopy.ts` (EN/RU)
  and `signInCopy.ts` (English lesson chrome); pending partner review.
  Composed from existing classes and tokens; no new colours. Self-paced
  course pages are unchanged. Do not compute a lesson's state or a call's
  visibility in TypeScript: both come from SQL (058).
- Voice recorder (2026-10-10, VOICE-005, docs/decisions/0111), replacing
  the VOICE-003 placeholder on the lesson page. Inside the same voice-task
  card: Record (`SUBMIT_BUTTON_CLASS`) → a pulsing `bg-destructive` dot
  with "Recording 0:12 / 3:00" and Stop → a native `<audio controls>` of
  the take, Send (primary) and Record again (the paid card's "Back to
  course" button classes). Sending shows a `bg-brand` bar in a `bg-muted`
  track with "Sending N%"; a failure shows a `destructive-subtle` notice
  and the primary button becomes "Try again". Sent: the learner's own
  playback and "Sent. Waiting for feedback."; recording again offers Send
  with "Recording again and sending replaces the recording you sent."
  Feedback published: a `bg-brand-subtle` box headed "Feedback" under the
  recording, bold runs as `<strong>`, then "Your recording has feedback,
  so it can't be replaced." and no record controls. Practice (anonymous,
  free, not enrolled): the same recorder without Send, and "Practice only:
  your recording stays on this device and isn't sent." No MediaRecorder or
  getUserMedia: "Recording doesn't work in this browser. Open this page in
  Safari or Chrome." with a Copy link button. English lesson chrome, in
  `lib/alliengll/voiceCopy.ts`, not copy.ts (bundle, 0111 Decision 1). The
  admin preview and the demo keep the disabled Record button; its note is
  now "Learners record here on the lesson page." Composed from existing
  classes and tokens; no new colours. Do not import the recorder or
  voiceCopy statically into LessonPlayer.
- Studio shell (2026-10-10, SHELL-020, docs/decisions/0109 + 0113). Course
  authoring (the list, the editor, runs, the lesson editor, preview and the
  visitor view) moved from `/app/admin/courses/**` to `/studio/courses/**`
  with its pages unchanged. `/app/admin/courses/**` 308s there.
  `app/(studio)/` is a third root layout: ThemeProvider, Toaster, Geist Sans,
  and Geist Mono unpreloaded for the editor's `font-mono` slugs. It has no
  KaTeX CSS, no Analytics and nothing from the Colloquiz shell.
  - The nav is `StudioSidebar.tsx`, built from `ui/sidebar` (offcanvas) with
    AppSidebar's link classes: a "Studio / Course workspace" header in the
    same brand-gradient tile, "Courses", then a "Leave Studio" group with
    "View site" (`/`) and, for admins only, "Colloquiz admin"
    (`/app/admin/review`; `/app/admin` has no index page).
  - Sign-out is a form POST to `/auth/sign-out` with `next=/`.
  - A small top bar holds the `SidebarTrigger`, which is the way into the nav
    at 360px.
  - A signed-in non-editor gets Studio's own 404 (`app/(studio)/not-found.tsx`,
    the Colloquiz 404's markup) on every Studio path. The moved pages' own
    per-course "Forbidden" screen is unchanged.
  - `/studio` redirects to `/studio/courses` until the inbox (AUTH-012)
    lands.
  - SUPERSEDES the destination in the 2026-09-24 AppSidebar "Course editing"
    entry: both that entry's "Courses" link and the Admin section's
    "Courses" link now go to `/studio`.
  - No new tokens or hex literals. Do not move Studio back under the
    Colloquiz shell, and do not import AppSidebar, Topbar or the duel badge
    into it.
- Studio review queue (2026-10-11, VOICE-006, docs/decisions/0114).
  `/studio/reviews`, a "Reviews" entry in the Studio nav under Courses
  (`MessageSquareText`). A filter row (Course, Run, Week, Status Selects, two
  columns at 360px, URL-driven), then:
  - "Recordings": one card per learner × voice task in the runs page's card
    frame, with the learner (invite name or email, then email · contact ·
    tier), course · run · week · lesson, the sent time, the task prompt, a
    native `<audio controls>` (`nodownload`), and the VOICE-002 editor. A
    take removed by the 6-month purge says so instead of a player.
  - "Status by learner and week": a real `<table>` in its own horizontal
    scroller, learner column sticky, one status pill per voice task.
  - "Final comments": one collapsed row per enrolment with a
    Not written / Draft / Published pill, expanding to the same editor.
  The editor: a bordered textarea with a Bold button bar ("**bold** · blank
  line = new paragraph"), Ctrl/⌘+B, HTML paste converted to `**…**`, a
  character count against 5,000, a "What the learner sees" preview in the
  learner's own `bg-brand-subtle` feedback box (`FeedbackContentView`), and
  Publish (primary, `bg-brand`) + Save draft before publishing, Save changes
  after. Status pills: Waiting and Draft in the warning set
  (`bg-warning-subtle text-warning`, already used by the Colloquiz review
  queues), Answered in `bg-brand-subtle text-brand-text`, Not sent / Not
  open yet muted. The course editor's Format section gains a "Reviews" link
  beside "Runs and calls", and each run card a `MessageSquareText` icon
  link, both pre-filtered. Composed from existing classes and tokens; no new
  colours. Do not let the editor's Ctrl+B reach the window: `ui/sidebar`
  toggles the nav on it.
- Before/after screen (2026-10-11, COH-005, docs/decisions/0115). The new
  English route `/runs/[runId]` uses the invite page's band: `BandTopBar`
  with "← Back to course" and the account chip, a "Before and after" glass
  pill, the course title and a run-title pill. Under it, at reading width:
  - the intro line and the shared prompt;
  - two cards side by side at `sm`, stacked on a phone, each topped by a
    "Before" / "After" pill in `bg-brand-subtle text-brand-text`;
  - a "Final comment" card.

  A card shows one of four things:
  - a native player (`SignedAudio`, moved from Studio's `ReviewAudio` to
    `app/components/voice/`, unchanged);
  - "removed after the course ended. You did record it.";
  - "You haven't sent a recording for this task yet. Record it in
    <lesson>.";
  - "isn't open yet" / "opens near the end of the course".

  The comment uses the weekly feedback box (`bg-brand-subtle`,
  `FeedbackContentView`), or a muted "isn't ready yet" line. Signed out:
  one card in the paid-lesson card's frame with "Sign in"
  (`SUBMIT_BUTTON_CLASS`). English, no toggle; the footer follows
  (`pageLangForPath`). The cohort course page gains a "Your before and
  after" row for an enrolled learner, below the cohort block, in the calls
  card's shape (step-tile `Mic` icon, the Join button's classes, "Open"),
  EN/RU. Composed from existing classes and tokens; no new colours. Do not
  render a purged take as "missing": the row says it was recorded.
- Studio learners page (2026-10-11, AUTH-011, docs/decisions/0116).
  `/studio/learners`, a "Learners" entry in the Studio nav under Reviews
  (`Users`). A Course and a Run Select (two columns at 360px, URL-driven,
  the review queue's filter row), a "N learners" count of people (not
  rows), then one card per learner × course × enrolment in the runs
  page's card frame: the label (invite name, else email) with a muted
  Basic / Extended pill and a muted "Revoked" pill on a revoked
  enrolment; email · invite contact; course · run (or "Not in a run");
  "Came from: <channel> · <course>" or "not recorded". Under a rule, a
  `dl` grid (2 columns, 4 at `sm`): lessons opened N of M, lessons
  completed N of M, recordings "N sent · N answered" ("—" without an
  enrolment), last active in the editor's timezone. Cards, not a table,
  so it fits 360px with no horizontal scroll. Every value comes from
  `learner_roster()` (063); no scores, per the privacy policy's "Course
  authors" list. Composed from existing classes and tokens; no new
  colours. Do not add a score column without a legal revision first
  (0109 Decision 8).
- Studio entry points (2026-10-11, SHELL-021, docs/decisions/0109
  Decision 4 + 0117). The English `AccountMenu` gains a "Studio" link
  (`/studio`, `PenTool` icon, the Sign out button's classes, above Sign
  out) for an admin or a holder of a `course_editors` grant; a learner's
  menu is unchanged. "Studio" in both languages: it is Studio's name. A
  plain `<a>`, still zero client JS. An editor who signs in with `next`
  absent or `/` (the landing's "Log in") lands on `/studio`; a deeper
  `next` wins. Do not move the editor check into the client: it lives in
  `lib/studioEditor.ts`, and the password sign-in reaches it through
  `/auth/after-sign-in`.
- Studio inbox (2026-10-11, AUTH-012, docs/decisions/0109 Decision 5 +
  0118). `/studio` no longer redirects to `/studio/courses`; it is "Needs
  attention", with three sections:
  - "Waiting for feedback": one row per course · run · week;
  - "Unpublished drafts": voice feedback per week, final comments per run;
  - "Calls in the next 7 days".
  Each row is a link card in the runs page's frame (`rounded-2xl border
  bg-card`, `hover:bg-accent`) with a `bg-muted` icon tile, the title, a
  muted detail line ("Oldest sent 2 days ago", or the call's local time)
  and a count pill in the review queue's Waiting tokens (`bg-warning-subtle
  text-warning`). Below `sm` the pill drops under the text: beside it, it
  squeezed the title at 360px. An untitled run reads "run from <date>"
  (`LocalTime`'s new `dateOnly`). One dashed empty box when nothing needs
  attention. The Studio nav gains "Inbox" first, with a waiting-count
  badge in AppSidebar's duels-badge classes. SUPERSEDES the SHELL-020
  entry's "`/studio` redirects to `/studio/courses`". Composed from
  existing classes and tokens; no new colours. Do not compute the badge
  from a second query: it and the waiting list read the same cached
  `review_queue` call (`inboxData.ts`).
- Studio learner page (2026-10-11, AUTH-013, docs/decisions/0119).
  `/studio/learners/[userId]`, opened by the learner's name on a roster
  card (now a link, `hover:underline`). The page has a "← Learners" back
  link (the lesson editor's back-link classes), then a header:
  - the label (invite name, else the email) with the email and invite
    contacts;
  - "Came from" and "Last active";
  - one muted pill per enrolment (course · run · tier, "· Revoked");
  - "Only the courses you edit."

  Then two sections:
  - "Lessons": one card per course in the runs page's card frame, with
    "Opened N of M · completed N of M" and a divided list of lessons. Each
    lesson has its number and title, a Week pill, "No longer published"
    for an archived lesson with activity, Completed
    (`bg-brand-subtle text-brand-text`) or Opened (muted), and last
    opened / completed / recordings.
  - "Recordings": one card per run, with a "Write feedback in Reviews"
    link in the course editor's outlined-link classes, pre-filtered. A
    "Before and after" pair sits side by side at `sm` and stacks on a
    phone; each side is topped by a Before / After pill in
    `bg-brand-subtle text-brand-text`, and a missing side is a dashed box
    with "Not sent yet." The weekly takes follow.

  A take shows its prompt, `SignedAudio` (no download), the review queue's
  Waiting / Draft / Answered pill, and its feedback in the learner's
  `bg-brand-subtle` box, labelled "Feedback draft: the learner can't see
  it yet" when it is a draft. A purged take says it was removed and that
  the learner did record it. Read-only: feedback is written in Reviews.

  No scores. Measured at 360px: `scrollWidth/innerWidth 360/360`.
  Composed from existing classes and tokens; no new colours. Do not add a
  score or an attempt count without a legal revision (0109 Decision 8).
- Learner home (2026-10-11, PROG-002, docs/decisions/0120). `/my` on the
  English surface, reached from a new "My courses" link (`BookOpen`, the
  Studio link's classes) first in the `AccountMenu` card for every
  signed-in user. Still a plain `<a>`, zero client JS. The page:
  - a compact gradient band (`BandTopBar` with "← All courses" and the
    account chip, a "Your account" glass pill, the "My courses" `h1`, a
    lead line);
  - "Next call", only for an extended enrolee with an upcoming call: one
    card in the course page's calls-row shape (step-tile `Video` icon,
    `LocalDateTime`, the course title linking to its page, Join);
  - "Courses": a two-column grid at `sm` of `LIFT_CARD_CLASS` cards
    linking to the course page, each with a 64px cover (or the gradient
    level tile), the level pill, a muted tier · run pill on an enrolled
    course, the title, and the two progress numbers as a `dl` ("N of M
    lessons attempted", "N% average score"). The average is absent until
    a lesson is attempted. Never blended into one number. No courses: a
    dashed box with "Browse courses" to `/#catalogue`;
  - "Feedback", for an enrolled learner or anyone with feedback: one card
    per published voice feedback or final comment, newest first, with the
    course · lesson, the local date, the text in the learner's
    `bg-brand-subtle` feedback box (`FeedbackContentView`), and "Open
    lesson" (or "Before and after" to `/runs/<run>`). No audio player
    here.
  Chrome follows the saved EN/RU choice with no toggle (owner,
  2026-10-11); strings in `app/(english)/my/myCopy.ts`. Sign-out from
  `/my` returns to `/`. Measured at 360px: `scrollWidth/innerWidth
  360/360`. Composed from existing classes and tokens; no new colours.
  Do not add scores per lesson or a blended percentage.
- Studio course stats (2026-10-11, AUTH-014, docs/decisions/0121).
  `/studio/courses/[id]/stats`, from a new "Stats" link (`ChartColumn`,
  the "Runs and calls" link's outlined classes) under the slug in the
  course editor header, for every course format. The runs page's back link
  and `h1`, then two muted notes: signed-in learners only, and the average
  is each learner's first try, shown from 5 learners, restarting when the
  exercise is edited. One card per published lesson in the runs page's
  card frame: "N. <title>", a muted Week pill on a cohort course, and a
  two-column `dl` of "Opened" / "Attempted" learner counts. Under a rule,
  one divided row per exercise: "Exercise N", the type in the lesson
  editor's raw type pill, the prompt as plain text (`line-clamp-2`), and
  on the right (below the prompt on a phone) the whole-percent average
  with a `bg-brand` bar in a `bg-muted` track and the learner count, or
  "N learners · average shows from 5". Measured at 360px:
  `scrollWidth/innerWidth 360/360`. Composed from existing classes and
  tokens; no new colours. Do not compute or threshold the average in
  TypeScript: `course_stats()` (065) returns NULL below 5 learners.
- Runs page: change a claimed learner's tier (2026-10-11, COH-007,
  docs/decisions/0122). A claimed invite's row on
  `/studio/courses/[id]/runs` gains a "Change tier" icon button
  (`ArrowUpDown`, the row's `ICON_BUTTON` class) beside Revoke. It opens the
  page's AlertDialog: "Move <name> to Extended (calls)?" / "Move <name> to
  Basic?", with what the learner gains or loses (the run's calls on the
  course page; lesson access unchanged), confirmed by "Change tier". The
  success toast is "<name> is now on <tier>.", and the row's tier text
  updates, because `set_enrolment_tier` (066) also sets the invite's tier.
  Pending, expired and revoked rows get no button. Measured at 360px:
  `scrollWidth/innerWidth 360/360`. Composed from existing classes and
  tokens; no new colours. Do not add a tier Select here while tier is
  binary.
- Studio "New course" for every editor (2026-10-11, AUTH-015,
  docs/decisions/0125 D2/D4 + 0126). `/studio/courses` shows "New course"
  to everyone who reaches the page (an admin or anyone with a
  `course_editors` row), not only to admins; the non-admin empty-state copy
  "No courses have been shared with you yet." is gone. In the dialog the
  slug fills from the title (`slugifyLessonTitle`, so a Cyrillic title
  transliterates) until the author types in the slug field; emptying the
  slug field hands it back to the title. `slug_taken` and `invalid_slug`
  show under the slug field (`text-xs text-destructive-text`, the field's
  border in `border-destructive-border`, `aria-invalid`), not in the
  dialog's general error box, which still carries every other refusal.
  The slug input gained `aria-label="Slug"`. Measured at 360px:
  `scrollWidth/innerWidth 360/360`. Composed from existing classes and
  tokens; no new colours. Do not hide the button from non-admin editors:
  `create_course` (067) allows them, and a creator becomes the new
  course's editor in the same transaction.
- Lesson editor: adding exercises (2026-10-11, AUTH-016, docs/decisions/0125
  D5/D6 + 0127). The "Add block" menu now has three groups. Each of the
  first two is headed by a muted `DropdownMenuLabel`:
  - "Theory": the nine theory types;
  - "Exercise": Multiple choice, True / False, True/False statements, Put
    in order, Match pairs, Sort into groups, Fill the gaps, Drag words into
    gaps;
  - Voice task, below its separator.

  A new exercise opens empty. True / False is the exception: its two
  options are prefilled. Saving an unfinished exercise gets a 422, and
  every message shows under the field it names. There is no placeholder
  text and no lenient draft.

  A practice block's row now shows the friendly label (`exerciseLabel`,
  read from the item) instead of "Practice · selection". Its preview shows
  the prompt instead of "selection item".

  The matching form gains a "Show as" Select (Pairs / Sort into groups)
  bound to `payload.presentation`. With "Sort into groups" selected, a
  muted line says which side holds the groups. The slots form gains one
  muted line under the prompt about the `___` gap marker.

  Measured at 360px with an empty exercise's errors showing and with the
  matching form open: `scrollWidth/innerWidth 360/360`. Composed from
  existing classes and tokens; no new colours. Do not add a placeholder
  exercise that passes validation: placeholder text can be published.
- Lesson editor: chapter outline (2026-10-11, AUTH-017, docs/decisions/0125
  D1/D7 + 0128). The block list is now an outline. Each level-1 heading
  heads a chapter card (the block list's own `rounded-2xl border bg-card
  divide-y` card). The card's header row is in `bg-muted` and holds:
  - a collapse chevron (`aria-expanded`);
  - the chapter's ↑↓ ("Move chapter up/down"; disabled at the edges);
  - the title (`font-semibold`, truncated) over "Chapter · N blocks";
    tapping it opens the heading's form;
  - a delete icon.

  Delete opens an AlertDialog that gives the number of blocks removed.
  Under the header come the chapter's block rows, unchanged, then a footer
  row with that chapter's own "Add block". Blocks before the first chapter
  sit in a card labelled "Before the first chapter", shown only when the
  card has blocks. A lesson with no level-1 heading looks exactly as
  before. "+ Add chapter" sits under the outline. It opens an inline
  "Chapter title" field whose "Add chapter" button (the editor's primary
  `bg-brand` button) stays disabled until there is a title.

  Header rows have no grip: a chapter heading is never dragged on its own.
  Blocks drag within and across chapters, and a block dropped on a header
  from above becomes that chapter's first block. The Add-block menu's
  heading entry is now "Subheading" (level 2); chapters come only from
  "+ Add chapter". The player and the lesson document are unchanged.
  Measured at 360px (outline loaded, title field open, chapter added,
  delete confirm open): `scrollWidth/innerWidth 360/360`. Composed from
  existing classes and tokens; no new colours. Do not give the header row
  a drag handle, and do not store chapters anywhere but the flat block
  array.
- Course editor: delete a draft course (2026-10-11, AUTH-018,
  docs/decisions/0125 D8 + 0129). A "Delete course" section is the editor's
  last section (`DeleteCourseSection.tsx`), shown to every editor of the
  course. When `course_delete_blockers` (068) returns none, it shows the
  Settings > Data and privacy danger zone: a `border-destructive-border
  bg-destructive-subtle` card with an `AlertTriangle` note that says what
  goes with the course, and an outlined destructive "Delete course" button.
  That button opens a Dialog that asks for the course title (trimmed,
  case-sensitive, as in SQL), with a `bg-destructive` "Delete course"
  button that stays disabled until the title matches. On success: a toast,
  then `/studio/courses`. Otherwise the section is one muted line naming
  the first blocker ("This course can't be deleted because it is
  published. Unpublish it first."), with no button. If the blocker call
  fails, the section is absent. Measured at 360px with the dialog open:
  `scrollWidth/innerWidth 360/360`. Composed from existing classes and
  tokens; no new colours. Do not decide deletability in TypeScript:
  `course_delete_blockers` decides, and `delete_course` re-checks it under
  row locks.
- Lesson table wraps at lg (2026-10-12, ad-hoc, desktop UX run). Owner's
  desktop run on colloquiz.app: at 1440px the Vocabulary table's Example
  column was cut mid-word behind the table's own horizontal scrollbar,
  because `min-w-max` stopped every cell from wrapping (measured on
  localhost: table 1159px in a 990px box). `TableBlock` keeps `min-w-max`
  below `lg` and adds `lg:min-w-0`, so at `lg` cells wrap and a text table
  fits the FIT band (measured: 990px in 990px at 1440 and 1920; lesson 4's
  five tables unchanged, 670–958px). The inner scroll stays as the fallback
  for a table whose longest words alone overflow the column, which is the
  FIT band's stated fallback (2026-09-26 entry). At 360px nothing changes
  (still scrolls inside its box, page `scrollWidth` 345). Cells and headers
  are now `align-top`: once a row wraps, a one-line cell centred against a
  two-line one read as misaligned. Do not put `min-w-max` back at `lg`.
- Matching bank: sticky only under the prompt and only before Check
  (2026-10-12, ad-hoc, desktop UX run). Two bugs in the 0039 Decision 5
  sticky bank, both seen on colloquiz.app at 1440px:
  - The bank's containing block was the whole renderer, prompt included,
    so when an exercise entered from the bottom of the viewport the bank
    rode up over its own prompt (measured on localhost: bank over the
    prompt with the card's top 100, 160 and 220px above the viewport
    bottom). Rows and bank now share a plain wrapper `<div>` (no overflow,
    so 0039 Decision 5's "no new overflow on an ancestor" holds); the bank
    can still ride over the rows it serves, never over the prompt
    (measured after: no overlap at any of the four offsets).
  - After Check the disabled bank stayed sticky and covered results
    (2 result rows under it at 1440). It is now `sticky bottom-0` only
    while unsubmitted, static after (measured after: 0 rows under it).

  Before Check nothing changes, at any width (360px: still sticky, page
  `scrollWidth` 345). Do not move the prompt back inside the bank's
  containing block.
- Matching bank chips are `text-left` (2026-10-12, ad-hoc, desktop UX run).
  A chip is a `<button>`, so a sentence that wrapped to two lines inherited
  the button's centred text (lesson 3's "Modern wireless earbuds…" chip on
  colloquiz.app) next to left-aligned one-line chips. `BucketRenderer`'s
  statement chips were already `text-left`; the pairs bank now matches
  (computed `text-align: left` on all 12 chips of lesson 3 on localhost).
- Typed gap underline uses `border-muted-foreground` (2026-10-12, ad-hoc,
  desktop UX run). An unanswered typed gap is drawn only by its 2px bottom
  border, and that border was `border-border` (10% black, 1.25:1 on the
  white card, computed from the tokens), so lesson 5's empty gaps were
  nearly invisible on colloquiz.app. WCAG 1.4.11 asks 3:1 for a control's
  boundary; `--muted-foreground` gives 5.44:1 (computed), is an existing
  token with a `.dark` value, and the focus (`border-brand`) and submitted
  (success/destructive) states are unchanged. Do not put an unanswered
  gap back on `border-border`.
- Matching and ordering row numbers (2026-10-12, ad-hoc, desktop UX run).
  Two alignment bugs in the 0053/0054 row numbers, measured on localhost
  (lesson 6 at 1440):
  - In a matching row the number was a sibling of the content inside an
    `items-center` row, so on a two-line statement it sat 9px below the
    first line, between the lines. Number and content are now one inner
    `items-start` flex unit, itself centred in the row as before: the
    number sits on the first line (1px off, measured), and a one-line row
    looks the same as before.
  - "1." is narrower than "2." (8.22px vs 11.5px), so row 1's text and grip
    started 3px left of the others. Both renderers' numbers are now
    `tabular-nums` (every number 11.23px; text starts at one x).

  Ordering keeps its number centred with the grip handle: number and
  handle are its control column. Do not split the matching number from
  its content again.
- True/False rows reserve the ✓/✗ slot before Check (2026-10-12, ad-hoc,
  desktop UX run). `SelectionGridRenderer` inserted the marker after the
  two buttons only on Check, so every statement narrowed by the marker and
  its gap (460px → 436px at 1440, measured on localhost) and re-wrapped:
  8 of 8 rows changed size on Check, one grew a line. An invisible
  `size-4` placeholder now holds the slot until Check (measured after: 0 of
  8 rows change). Below `sm` the buttons sit on their own line, so the
  placeholder is just trailing space there. The same reflow in typed gaps
  (`SlotsRenderer`, a marker after each gap inside a sentence) is NOT fixed
  here: reserving space after every gap changes how the unanswered
  sentence reads, which is a design call, not a bug fix.
- Hero demo reserves its feedback height (2026-10-12, SHELL-022, ad-hoc desktop
  UX run). Answering the demo added ~37px (feedback line + "Try again"), and
  the hero grid's `items-center` (LandingContent.tsx) re-centred the headline
  column, so the h1, CTA row and value strip jumped on a visitor's first tap.
  `HeroDemo` now always renders the feedback block, `invisible` until
  answered (same wording for both outcomes, so it is as tall as either real
  state); the `key` swap makes the real one mount fresh inside the
  `aria-live` region so it still announces. Grid alignment is unchanged.
  Measured on localhost, before vs after answering a right and a wrong
  option: h1 / CTA / value strip y and card width, x and height identical at
  1440 (179/407/573, 442px, 401px) and 360 (140/307/876, 328px, 405px).
  `npm run budget`: `/` 179.1 KB of 180. Do not render the feedback only
  after an answer, and do not switch the grid to `items-start` instead: that
  moves the headline off its 0078 centring.
- Lesson title not repeated under the band (2026-10-12, PLAY-014). Every Future
  Imperfect lesson opens with a level-1 heading equal to its title, so the page
  showed it in `LessonBand` and again directly beneath. `LessonPlayer` takes an
  optional `lessonTitle` and drops the FIRST block when it is a level-1 heading
  whose text equals the title (trimmed, case-insensitive), via the pure
  `dropTitleHeading` (`lib/lessonPlayer/titleHeading.ts`). Narrow on purpose: a
  level-1 heading is a chapter since AUTH-017 (0128), so a later one, a level-2
  one or a differing first one still renders. Render-time only: the lesson
  document and the editor outline are untouched. The public lesson page and the
  Studio preview both pass the title (the preview is the learner's view); the
  demo passes none. No new classes or tokens. Do not strip headings in the
  importer or the editor to get the same effect.
- Gap check marks take no inline space (2026-10-12, PLAY-013,
  docs/decisions/0130). `SlotsRenderer` added a ✓/✗ after each typed gap on
  Check, which re-wrapped sentences: 6 of 17 typed gaps on Grammar drilling
  moved at 1440 and 7 of 17 at 360 (measured on localhost, gap x/y relative
  to its sentence, before vs after Check). The mark is now absolutely
  positioned at the gap's top-right corner (`absolute -right-1 top-0.5`),
  so the unanswered sentence has no extra space and Check moves nothing
  (0 of 17 at both widths, measured). Reserving space up front (the
  True/False fix) was rejected for typed gaps: it would leave visible
  space after every blank. The drag variant's mark, inside the gap control,
  got the same treatment (`absolute -right-1.5 -top-1.5`, `bg-card` disc);
  no published lesson has a drag-slots item, so that one is not measured.
  "Gap N:" in the explanation list moved from `mt-2.5` to `mt-4` so its
  text centre matches "Why?" (443 vs 443 at 1440, measured). Existing
  tokens only. Do not put the mark back in the inline flow.
- Wrong sub-parts name the right answer (2026-10-12, PLAY-015,
  docs/decisions/0131). After Check, a wrong True/False row, matching pair,
  typed or dragged gap and ordering row each gets a `text-xs
  text-muted-foreground` line in the sort renderer's style: "Correct: True",
  "Correct: <right side>" (rendered as content, so an image pair shows the
  image), "Gap N: Correct: <first accepted answer>", "Correct position: N".
  Gap lines now appear for every wrong gap, not only those with an
  explanation. Right sub-parts get no note. English lesson chrome from
  `lib/alliengll/copy.ts`; existing tokens only. Do not drop the note back
  into "Why?" only.
- Answer review names its exercise and row (2026-10-12, PLAY-016,
  docs/decisions/0132). Each "Answer review" entry on the completion card now
  has a heading line, "Exercise N · k" (or "Exercise N · Gap k"; just
  "Exercise N" for a multiple-choice item), `text-xs font-semibold` over the
  statement or prompt it explains, cut to one line (`truncate`), and the
  explanation below. The heading line is a link to the exercise's card
  (`#exercise-<block id>`, `scroll-mt-20` under the sticky strip). Correct
  sub-parts stay out (0058 D2). Existing tokens only. Do not turn the list
  back into bare explanations.
- Desktop matching: rows left, bank right (2026-10-12, PLAY-017,
  docs/decisions/0133), superseding 0055's rejection of side-by-side for `lg`
  and up. The pairs bank is a 16rem column beside the rows, chips stacked,
  sticky at `top-16` under the progress strip until Check, scrolling inside
  itself if taller than the viewport. Below `lg` it is the stacked
  `sticky bottom-0` bank as before. The card stays at the 672px reading width
  (0079 D11). Measured at 1440x900: no row under the bank at any scroll
  position. Do not put the bank back under the rows at `lg`, and do not widen
  the practice card to fit it without redoing 0133 Decision 4.
- True/False rows are named groups (2026-10-12, PLAY-018,
  docs/decisions/0134). The True / False button pair in each
  `SelectionGridRenderer` row is a `role="group"` labelled by the row's
  statement. No visual change. Do not move the statement onto the buttons'
  names without updating the name-based tests.
- Sign-in from the English surface (2026-10-12, ANON-017,
  docs/decisions/0135). `/login` and `/signup` with a `next` outside `/app`
  (`isEnglishSurfaceEntry`) show `EnglishAuthPanel` in place of the quiz-app
  panel: the same gradient shell, an "Alliengll" heading, and "Sign in to save
  your progress and pick up where you left off." The mobile logo chip reads
  "Alliengll". English, fixed, no cookie read (owner choice over following the
  EN/RU cookie). No `next`, or a `next` under `/app`, keeps the Colloquiz panel
  unchanged. The password and confirm-password fields have no "••••••••"
  placeholder: it read as a pre-filled password. `reset-password` still has
  its dots (not in this card). Tab title stays "Colloquiz". Existing tokens
  only; `/login` 287.5 KB of 380 (287.4 before). Do not make the panel read
  the language cookie without redoing 0135.
- Gated lessons say how to get in (2026-10-14, PAY-001, docs/decisions/0136).
  The paid-lesson card gains a primary "How to get access" button
  (`SUBMIT_BUTTON_CLASS`, external link, new tab) above "Back to course" when
  the course has a `how_to_join_url`; without one it is unchanged. On the course
  page a lesson the visitor cannot open yet gets a muted pill, "Sign in to open"
  or "Paid" (`bg-muted text-muted-foreground`, the "Opens <date>" pill's
  tokens), read from the SQL lesson state, so a granted learner sees none and
  an all-free course is unchanged. No lock icon. Studio's "How to join (link)"
  field now shows for self-paced courses too. Existing tokens only. Do not
  derive the pill from `accessLevel`.
- English surface shares say Alliengll (2026-10-14, ad-hoc,
  docs/decisions/0137). The tab-title suffix on every English route is
  "· Alliengll" (was "· Colloquiz"), and og:site_name is Alliengll. Every
  share card (`courses/ogImageCard.tsx`) carries an "Alliengll" wordmark at
  the top left. `/` and every English route without a card of its own get a
  new surface card (hero title and subtitle on the brand gradient), replacing
  the Colloquiz quiz card they fell back to. Invite links get a card with the
  course cover, a "You're invited" pill and the title, and the title "Invite
  to <course>", the same for every invite state. Colloquiz (`/app`, `/login`)
  is unchanged. No new hex literals. Do not make the invite card or title
  depend on the invite's state: Telegram caches the preview per URL.
- Runs page: delete an unclaimed invite (2026-10-14, COH-009,
  docs/decisions/0138). Every unclaimed invite row (pending, expired,
  revoked-unclaimed) gains a Delete icon button (`Trash2`, the row's
  `ICON_BUTTON` class with `hover:text-destructive-text`), beside Revoke on a
  pending row. It opens the page's AlertDialog: "Delete the invite for <name>?"
  / "The link stops working and the name and contact are removed. It can't be
  undone; create a new invite if needed."; toast "Invite deleted." A claimed
  invite has no Delete (Revoke and Change tier only). A pending row now has the
  same two icons a claimed row already had; width at 360px not re-measured.
  Composed from existing classes and tokens; no new colours. Do not offer
  Delete on a claimed invite: its label belongs to the enrolment.
- Telegram sign-in (2026-10-14, ANON-012, docs/decisions/0139). AuthScreen
  (both panels) and the lesson's registration offer gain a full-width
  "Continue with Telegram" button above the Google/Discord row, in the same
  button classes, grouped with that row at `gap-3`. The icon is Telegram's
  mark in a new `--telegram` token (`#2aabee`, same in `.dark`). The sign-up
  consent note reads "Signing up with Telegram, Google or Discord…". In an
  Instagram or Telegram in-app browser the registration offer shows no OAuth
  button, Telegram included, and its notice names all three, until a phone
  pass proves Telegram there (`lib/inAppBrowser.ts`). Settings › Sign-in
  methods gains a Telegram row, last, showing "@username" when connected.
  Do not show Telegram in the in-app offer without that pass's result in
  docs/decisions/0098.
- Auth form reachable when taller than the screen (2026-10-14, ANON-012,
  docs/decisions/0139 Decision 8). AuthScreen's right panel no longer
  centres with `items-center`. The form column centres with `my-auto`
  instead, so a sign-up form taller than the viewport starts at the panel's
  top padding rather than overflowing above it. Measured on `/signup`: the
  form's top was at −123 px at 360×800 and −35 px at 1440×900; now it is
  48 px at both. A form that fits is centred exactly as before (`/login`
  unchanged). Do not put `items-center` back on that panel.
- Voice takes (2026-10-15, VOICE-008, docs/decisions/0141 Decision 11). The
  voice-task card keeps up to five takes made on the page instead of the last
  one. Each take is a bordered row (`rounded-xl border border-border p-3`)
  with a "Take N" label, a native `<audio controls>`, "Send this take"
  (`SUBMIT_BUTTON_CLASS`, send mode only) and "Delete" (the recorder's
  secondary button with a `Trash2` icon). Below the list: "Your takes stay on
  this device until you reload the page." Nothing is stored in IndexedDB or
  localStorage. With five takes "Record again" is disabled and a line says
  "You have 5 takes. Delete one to record another." A sent take leaves the
  list and becomes the sent playback; the other takes stay. The cap, add and
  delete rules are `lib/voice/takes.ts`. Sending, replace-until-feedback and
  the post-feedback lock are unchanged. Existing classes and tokens only; not
  measured at 360px. Do not persist takes without redoing 0141 Decision 11.
- Studio shows a Telegram learner's @username (2026-10-16, AUTH-019,
  docs/decisions/0145, migration 073, applied to hosted). Where Studio showed a
  learner's email (roster, learner page, review queue), an account with no
  email shows "@username" from its Telegram identity. The inbox shows no
  learner label, so it is unchanged. The label order is unchanged (invite
  name, email, @username). No new classes or tokens. Measured at 360px (local
  stack, a Telegram learner with a 32-character username):
  `scrollWidth/innerWidth 360/360` on `/studio/learners`, the learner page,
  `/studio/reviews` and `/studio`. Do not add a separate username column to
  the UI.
- Lesson completion on the course page (2026-10-16, PROG-006, docs/decisions/
  0143 + 0147, migration 075 not yet applied). A lesson row's ✓ and "Best: N%"
  now mean COMPLETE (every exercise answered, or opened when it has none), not
  "has an attempt". A partly answered lesson gets a muted pill
  (`bg-muted text-muted-foreground`, the "Opens <date>" tokens) reading
  "N из M заданий" / "N of M exercises", no ✓ and no score, and counts toward
  neither progress number. EN "lessons attempted" is now "lessons completed"
  (course hero and /my); RU "пройдено уроков" is unchanged. Studio course stats
  label "Attempted" becomes "Completed". /my has no lesson list, so no tile
  there. Existing tokens only; 360px not measured. Do not recompute
  completeness in TypeScript: `lesson_completion()` decides.
- Teacher links (2026-10-16, TCH-001, docs/decisions/0148, migration 076 not
  yet applied). Three surfaces, all composed from existing classes and tokens;
  no new colours:
  - `/join/[token]` on the English surface, in the invite page's frame: a
    compact gradient band ("Teacher" glass pill, "Link to <name>"), then one
    card holding the statement of what the teacher sees (`LinkStatementCard`:
    a `bg-muted` box, a bulleted list, two muted sentences), the learner's
    account, and "Join" (`SUBMIT_BUTTON_CLASS`, a form POST). Signed out: the
    same statement and "Sign in or create an account" with `next` = the page.
    An already-linked, own-link or invalid token gets its own card. Follows the
    saved EN/RU choice, no toggle (the `/my` rule).
  - The invite page shows the same statement, in English, above "Join the
    course" whenever claiming will also link the learner to the invite's
    creator.
  - `/my` gains "Your teachers" between Courses and Feedback, shown only when
    there is a link: one `rounded-2xl border bg-card` row per teacher with
    "Linked since <date>" and a "Leave" button in the course page's Join-button
    classes. Leave opens, in place, a sentence on what changes and "Yes, leave"
    (a native `<details>`, no client JS).
  - Studio Learners gains a panel above the roster: "Your student link"
    (Create/Rotate, the invite dialog's link field with Copy, a confirm before
    replacing the link) and "N linked students" rows with a
    `bg-brand-subtle text-brand-text` "Linked" pill, the source and date, and
    Remove behind an AlertDialog. Roster cards of linked learners get the same
    pill.
  Measured at 360px (076 applied; `/join` budget 177.0 KB of 183): `scrollWidth/innerWidth
  360/360` on /join (signed out, signed in unlinked, already linked, invalid
  token, RU), the invite page with the statement, /my with a linked teacher
  (EN and RU), and Studio Learners with a linked student. Not reached: the
  opened Leave confirm and the Studio dialogs.
  Do not show the join link after a reload: it is stored hashed. Do not put a
  teacher's `full_name` on the join page.
- Teacher groups (2026-10-16, TCH-002, docs/decisions/0149, migration 077). Studio only; no learner-facing page shows a group. Composed
  from existing classes and tokens; no new colours:
  - Learners gains a "Groups" outlined link under the filters
    ("Groups (N)" once there are some) and a third Select, "Group" ("All
    students" or one of the teacher's groups), shown only when the teacher has
    a group. It narrows the roster and the linked-students list.
  - `/studio/learners/groups`: a "New group" field + "Create group" (the
    student-link panel's input and `bg-brand` button), then one
    `rounded-2xl border bg-card` link row per group with a name and "N
    students".
  - `/studio/learners/groups/[groupId]`: a "← Groups" back link, the name, a
    Name card (input + Rename), the members (a row each with Remove), "Add
    students" (a checkbox list of linked students not yet in the group, rows
    `min-h-11`, and "Add N to group"), and an outlined "Delete group" that
    opens an AlertDialog.
  - A linked learner's page gains a "Groups" section above Lessons: one
    checkbox per group, each toggle one call; with no groups, a dashed box
    linking to the groups page.
  - Wherever Studio names a group (New group, Name, Add students, the
    learner page's Groups) a `text-xs text-muted-foreground` line reads
    "Students see the names of groups they are in only in their data export."
  Measured at 360px (077 applied): `scrollWidth/innerWidth 360/360` on the
  groups list (empty, one group, with a toast), the group page (no members,
  member + candidate, delete confirm open), Learners (unfiltered and group
  filtered) and the learner page. Do not show a group's name anywhere a
  student can see it in the app; the export is the one place.
- Linked student's answers (2026-10-16, TCH-003, docs/decisions/0150, migration
  078 not yet applied). On `/studio/learners/[userId]` for a student linked to
  the teacher, an "Answers" section sits above "Lessons": one card per course
  in the runs page's card frame, one native `<details>` row per lesson with a
  `bg-brand-subtle text-brand-text` "Best: N%" pill (or a muted "N of M
  answered" pill before the lesson is complete). Open, each exercise is a
  bordered `rounded-xl` box: "Exercise N", the prompt, then each attempt as a
  muted "Attempt k · time · E of P (n%)" line over the answer as plain text
  lines. "No answer stored for this attempt." and "The answer can't be shown:
  the exercise no longer reads." are muted lines. A non-linked learner's page
  is unchanged and shows no scores. Existing classes and tokens only; 360px
  measured (078 applied): `scrollWidth/innerWidth 360/360` on the learner page
  with the section closed, and 360/360 with a lesson row open (two exercises,
  three attempts, a long title and prompt). Do not show scores for
  a learner who is not linked.
- Messages (2026-10-16, TCH-004, docs/decisions/0151, migration 079 applied). One conversation per linked pair, in the app.
  Composed from existing classes and tokens; no new colours:
  - Learner: `/my/messages` (the saved EN/RU choice, no toggle, the `/my` rule)
    is `/my`'s band, then one `LIFT_CARD_CLASS` row per teacher (step-tile
    `MessageSquare` icon, the name, a `bg-brand text-white` "N new" pill, a muted
    "Closed" pill, "Open" or "Start a conversation"). `/my/messages/[teacherId]`
    is the same band with the teacher's name as the `h1`, then the thread, then
    the composer, or, once the link has ended, a dashed "This conversation is
    closed" note in place of the composer. `/my` gains a "Messages" section
    between Courses and Your teachers: one row to `/my/messages` with "N new" or
    a muted "No new messages", shown only when the learner has a link or a
    conversation.
  - The account chip gets a `bg-destructive` dot with a white ring while a
    teacher reply is unread, its accessible name gains "Unread messages: N", and
    the card gains a "Messages (N)" link in the other links' classes. Server
    markup only; no client JS.
  - Thread (shared by both surfaces): bubbles at `max-w-[85%]`, the reader's own
    in `bg-brand-subtle` and right-aligned, the other party's in `bg-muted` and
    left-aligned, a `text-xs text-muted-foreground` line under each with who and
    the local time, and a `bg-brand text-white` "New" pill on a message the
    reader had not read. Bodies are the feedback format (`FeedbackContentView`).
    The composer is the feedback editor's textarea with its Bold bar, hint and
    character count (`N / 2,000`, `text-destructive-text` over the cap), a
    `bg-brand` Send button and an inline `destructive-subtle` error line. No
    realtime: a page load shows new messages.
  - Studio: a "Messages" nav entry under Learners with a `bg-brand` badge from
    the unanswered count (AppSidebar's duels badge classes); the inbox gains an
    "Unanswered questions" section between "Waiting for feedback" and
    "Unpublished drafts" (the inbox's link rows, "Last message N ago", a warning
    pill with the unread count). `/studio/messages` lists conversations newest
    first, then "Linked students you haven't written to" (so a teacher can write
    first), with Unanswered / unread / Closed pills. `/studio/messages/[studentId]`
    has the learner page's back link, the label as `h1`, the thread and the
    composer, or the closed note. Studio's chrome stays English.
  Measured at 360px (079 applied locally): `scrollWidth/innerWidth 360/360` on
  `/my` (dot and Messages row), `/my` with the account card open, `/my/messages`,
  `/my/messages/<teacher>` (a long unbroken word, bold, "New" pills, unread),
  `/studio` (unanswered row), `/studio/messages`, `/studio/messages/<student>`
  (also with a 2,001-character draft), and the closed state of both threads and
  of both lists. Not reached: the composer's error line (a refused send).
  Do not show a sender when the reader read their message: no read receipt is
  shown or returned to the sender (0151 Decision 5).
- Homework (2026-10-16, TCH-005, docs/decisions/0152, migration 080 applied to
  the local stack only, not yet to the hosted project). Composed from existing
  classes and tokens; no new colours:
  - Studio: a "Homework" nav entry under Learners (`ClipboardList`).
    `/studio/homework` is a heading, a muted line ("A due date is information
    only: nothing locks…"), an outlined "Assign homework" button and one
    `rounded-2xl border bg-card` card per assignment: the title ("Course ·
    Lesson", or "Course · whole course"), a muted due pill ("Due 20 Oct", "Was
    due 13 Oct"), a "N of M done" pill (`bg-brand-subtle text-brand-text` once
    everyone is done, else muted), a muted "Course not published: students
    don't see it" pill where it applies, the note, a "For:" line, Edit and
    Delete (outlined buttons; Delete confirms in an AlertDialog), and a native
    `<details>` "Students (N)" listing each recipient with a Done / "k of n
    lessons" / "Not yet" pill, "Best: N%" and the last activity.
  - The assign dialog (course select unless fixed, "What" select with "The
    whole course" first, a date input, a note with an N / 500 counter, a "Who"
    checkbox list of groups then students at `min-h-11`) opens from the course
    editor, a linked learner's page (student ticked) and a group's page (group
    ticked). The groups list carries the "Students see the names of groups they
    are in only in their data export." line. A "Homework" section with a short
    link-row list sits on the course editor (published courses only), a linked
    learner's page (above Answers) and a group's page (above Name).
  - A linked student's Answers section now also lists the lessons the teacher
    assigned but does not edit. A linked student with no activity yet opens
    their page instead of a 404.
  - Learner: `/my` gains "Homework" between Courses and Messages (EN/RU with
    the saved choice, no toggle): one `LIFT_CARD_CLASS` row per assignment with
    the step-tile icon (a check once done), the lesson or course title, "from
    <teacher>", the note, and muted pills: "Due 21 Oct" / "Was due 18 Oct",
    "k of n lessons" for a course, "Sign in to open" / "Not available yet" /
    "Opens <date>" for a lesson the student cannot open yet. "Done" is the only
    brand-coloured pill. Past due is never a destructive colour and nothing
    locks.
  - The lesson band gains a glass pill with a clipboard icon: "Homework",
    "Homework · due 21 Oct", "Homework · was due 1 Oct" or "Homework ✓", on the
    open and the paid/scheduled/sign-in states, for a signed-in learner whose
    teacher assigned the lesson or its course.
  Measured at 360px (`scrollWidth/innerWidth`, local stack, seeded teacher and
  students): 360/360 on `/my` (EN and RU), the lesson page with the pill,
  `/studio/homework` (closed and with every `<details>` open), the same page
  with the assign dialog, the edit dialog and the delete confirm open,
  `/studio/learners`, a linked learner's page (with activity and with none),
  a group's page and the course editor. `npm run budget` before and after:
  `/my` 171.5 / 171.5 KB, the free lesson 256.0 / 256.0 KB. Not reached: a
  toast, the dialogs' error box.
  Do not colour a past due date destructive, and do not show a group's name to a
  student in the app.
- Ask the teacher (2026-10-16, TCH-006, docs/decisions/0153, migration 081
  applied to the local stack and, through the hosted-apply gate, to hosted).
  Composed from existing classes and tokens; no new colours:
  - Lesson page: for a signed-in student with a teacher who edits the course
    or assigned the lesson, every exercise card and voice-task card ends with a
    text button, "Ask the teacher" (`MessageCircleQuestion`, `text-brand-text`,
    `min-h-11`, underline on hover). Nobody else sees it: not a visitor, not a
    student nobody qualifies for, not the Studio preview or the demo.
  - It opens a Radix dialog (`ui/dialog`, `max-h-[calc(100dvh-2rem)]`, scrolls
    inside): "Ask the teacher" and one muted sentence; "To" as radio rows
    (`rounded-xl border`, `min-h-11`) when more than one teacher qualifies, or
    "To: <name>" when one; "What your teacher will see", the frozen copy as a
    read-only card in its own scroll box (`max-h-60`); an "Include my answer"
    checkbox (`accent-brand`, on after Check, disabled with "Check your answer
    first if you want to include it." before); the existing message box; and,
    once sent, "Sent" with a success icon, "Open the conversation"
    (`SUBMIT_BUTTON_CLASS`, new tab) and "Close". English, like the rest of the
    lesson chrome.
  - In both threads a message from an exercise carries, under its text and
    inside the bubble, `AttachmentCard`: `rounded-xl border bg-card p-3`, the
    course · lesson line (`text-xs text-muted-foreground`, truncated) over
    "Exercise N" or "Voice task" (`font-semibold`), together a link to the
    lesson's exercise; the prompt (`font-medium`), what the exercise offered
    (bulleted, muted) and, under a rule, "Answer" and the student's answer, or
    "Answer not included." `/my` follows the saved EN/RU choice, Studio is
    English. The card never shows which option is right.
  - Loading: the link is part of a lazy chunk only a linked student's lesson
    downloads; the dialog behind it is a second chunk fetched on the first click.
    `npm run budget`, free lesson 257.2 to 257.4 KB (the loader stub; 0153
    "Budget" says why it is not zero).
  Measured at 360px (`scrollWidth/innerWidth`, local stack, seeded student and
  two teachers): 360/360 on the lesson with the links, the dialog unanswered
  with two teachers (one with a long name), answered with the answer included,
  with a long unbroken question typed, in the sent state (dialog 16 to 344 px
  wide, never past the viewport), `/my/messages/<teacher>` (EN and RU) and
  `/studio/messages/<student>`, each with an attachment card. Not reached: a
  voice task's card in a browser, and the dialog's error line.
  Do not draw the answer key in the card, and do not refresh the lesson page
  after sending (it re-renders the player with a new attemptId).
- Author seats (2026-10-16, TCH-007, docs/decisions/0154, migration 082 applied to
  the local stack and, by the owner, to the hosted project). Studio only; composed from
  existing classes and tokens, no new colours:
  - `/studio/authors`, admin only (a seated teacher gets Studio's 404), with an
    "Authors" nav entry for admins, last (`UserCog`). An "Add a teacher" card
    (email, optional public name, optional "Through" date, notes, "Add seat"), then
    one `rounded-2xl border bg-card` card per seat: the public name (wraps), a
    House (`bg-brand-subtle text-brand-text`) or Teacher (muted) pill, a state
    pill (active and open-ended `bg-brand-subtle text-brand-text`, ending within 7
    days `bg-warning-subtle text-warning`, lapsed `bg-destructive-subtle
    text-destructive-text`), the contact, a `dl` of expiry / courses / linked
    students (2 columns, 3 at `sm`), the notes, and outlined buttons Edit, Extend,
    Freeze now (hidden on a lapsed seat) and Mark as house seat / Make a regular
    seat. Edit and Extend are Radix dialogs (`max-h-[calc(100dvh-2rem)]`, scroll
    inside); Freeze is an AlertDialog. The notes field says they are private to
    admins and included in the teacher's data export.
  - Extend's +1/+3/+12-month buttons only fill the date field; the admin confirms
    it with "Set date", or chooses "No expiry".
  - A lapsed seat reads in the destructive-subtle set because this page is the
    admin's, not the learner's: "Nothing demotivates the learner" does not apply.
  - A seated teacher with no course yet can open Studio and sees "New course"; a
    lapsed seat's `create_course` answers with its own message.
  Measured at 360px (local stack, `scrollWidth/innerWidth`): 360/360 on
  `/studio/authors` with 5 seats (a 66-character unbroken name, a long contact, a
  750-character note, a house seat, a seat ending in 3 days), with the Edit dialog
  open, the Extend dialog open with a date filled, the Freeze confirm open, the
  unknown-email error toast showing, and after adding a sixth seat; 360/360 on
  `/studio/courses` for a seated teacher with no course. Not reached: the empty
  list ("No seats yet.") and the Add form's other error toasts.
  Do not show the page to a non-admin, and do not decide "active" in the client:
  `author_seats_list()` returns `is_active`.
- Frozen Studio (2026-10-17, TCH-008, docs/decisions/0155, migration 083 applied to the
  local stack and, by the owner, to hosted). While the signed-in teacher cannot write (an admin
  always can; so can an active seat), every Studio page shows, above its content,
  a `rounded-2xl border bg-warning-subtle` banner with a `Lock` icon: a
  `text-warning` title ("Your author seat has ended: Studio is read-only"), then
  one line with the expiry date ("It ended on 13 Oct 2026"), what is not lost
  (published courses, students' access, reading and replying to messages,
  feedback on recordings) and who to ask. A teacher with no seat reads "You don't
  have an author seat". Eleven client components that write (course list and
  editor, lesson editor and preview, runs, homework assign and actions, student
  link panel, learner groups, groups list and group page) are wrapped in
  `WriteArea`: frozen, a native `<fieldset disabled>` (links keep working,
  disabled controls dim to 50% with `cursor-not-allowed`, the reason is the
  tooltip); not frozen, nothing is rendered around them, so the pages are
  unchanged. Filters, the review queue's feedback editors and the message
  composer stay enabled: reading, feedback and replies are what a lapse leaves
  open. Composed from existing classes and tokens; no new colours. Measured at
  360px with the banner showing (local stack, `scrollWidth/innerWidth`): 360/360
  on `/studio`, `/studio/courses`, the course editor, the runs page, the lesson
  editor, `/studio/learners`, a linked learner's page, the groups list, a group,
  `/studio/homework` and `/studio/messages`. Not reached: a dialog left open
  across a lapse. Do not decide frozen-ness in the client: `studio_can_write()`
  decides, and the database refuses every write whatever the page shows.
- Account menu names a Telegram user (2026-10-17, SHELL-024, docs/decisions/0157).
  An account with no email shows its Telegram username in the English account
  chip and card: the chip its first letter (upper-cased), the card "Signed in as
  @username" in the same `truncate` line the email used (and the chip's
  accessible name). With neither email nor username the person icon and "You are
  signed in" stay. Email accounts are unchanged. The username is read from the
  JWT's `user_metadata.preferred_username` (`lib/auth.ts`), so no network call is
  added; `AccountMenu` is still a Server Component with zero client JS.
  `npm run budget`, before and after (local stack, seeded): `/` 178.2 / 178.2 KB,
  the course page 172.0 / 172.0, the free lesson 256.2 / 256.2. Existing classes
  and tokens only. 360px not measured: the change is a string inside the
  existing truncating span, and a real no-email session was not available locally.
  Do not show a username for an account that has an email.
- Calendar events (2026-10-17, COH-014, docs/decisions/0158, migration 084 applied to
  the local stack only, not to the hosted project). Studio only; no learner page shows an
  event until COH-015. Composed from the runs page's Calls list and CallDialog, and the
  group page's card frame; no new colours:
  - Each run card on `/studio/courses/[id]/runs` gains an "Events (N events, both tiers)"
    section between Calls and Invites: the Calls header row with an "Add event" button, and
    a divided list (`rounded-xl border`) with the title (wraps), the local start (and end), an
    optional link (`break-all`) and Edit / Delete icon buttons.
  - The group page gains the same section in a `rounded-2xl border bg-card` card above the
    roster, headed "(N events, this group's students)".
  - One Radix dialog for add and edit (`max-h-[calc(100dvh-2rem)]`, scrolls inside): Title,
    Starts, Ends (optional), Link (optional), the existing `destructive-subtle` error box,
    and a description saying who sees it ("They don't see the group's name." for a group).
    Delete is the page's AlertDialog. Deleting a group's confirm now says its events go too.
  - Both sections sit in `WriteArea`: a frozen seat disables Add, Edit and Delete.
  Measured at 360px (local stack, seeded teacher, a long wrapping title and a long
  unbroken link): `scrollWidth/innerWidth` 360/360 on the runs page and on the group page;
  360/360 with the add dialog open (dialog 16 to 344 px), with its error box showing, after
  a create, with the edit dialog and the delete confirm open, on both pages; 360/360 on both
  pages with the seat lapsed and "Add event" disabled. Not reached: the toast.
  Do not show an event's group name to a student, and do not decide who may edit in the
  client: `calendar_events()` returns `can_manage` and the RPCs refuse regardless.
- Calendar (2026-10-17, COH-015, docs/decisions/0159, migration 085 applied to the local
  stack only until the hosted gate). One server-rendered month, no client JS, composed from
  existing classes and tokens (no new colours, `ui/calendar.tsx` unused):
  - `/my` gains a "Calendar" section (`SectionHeading`, EN/RU with the saved choice, no
    toggle) between Homework and Messages, shown only when the learner has at least one date.
    Studio gains `/studio/calendar` and a "Calendar" nav entry (`CalendarDays`) under
    Messages; its chrome is English.
  - Header row: previous and next month icon buttons and a "Today" link (`min-h-11`,
    the outlined `rounded-xl border bg-card` link look), the month name between them. The
    month is `?month=YYYY-MM`; an unreadable value falls back to the current month. A muted
    line names the time zone, or says times are in UTC when the zone is not known.
  - At `sm` and up a `<table>` in a `rounded-2xl border bg-card` frame, Monday first, a
    `bg-muted` weekday header, days of neighbouring months on `bg-muted/40`, today's number
    in a `bg-brand text-white` circle. Below `sm` an agenda: one heading per day that has
    something (weekday, day, month) over rounded chips, an empty month a dashed box. Both are
    in the HTML and CSS chooses.
  - A chip is `rounded-lg`: run start/end and week openings and homework in `bg-muted`
    (homework is quiet on purpose: a due date never reads as an alarm, 0152), calls and
    events in `bg-brand-subtle text-brand-text`. A done homework gets a small check. Text
    wraps (`break-words`); in the grid the second line (time and course) is clamped to one
    line with the full text as a tooltip.
  - The page learns the viewer's zone from a cookie (`colloquiz_tz`) an inline script
    writes, reloading once when it was missing or different (0159 Decision 7).
  Measured at 360px (`scrollWidth/innerWidth`, local stack, a seeded learner and teacher,
  an event title with a 34-letter unbroken word): 360/360 on `/my`
  (October, with every kind of item), `/my?month=2026-11`, `/my?month=2099-01` (empty month),
  `/my` with the saved RU choice, and `/studio/calendar`. Checked in Edge at 1280px and 360px
  with the zone Europe/Belgrade: the call at 14:41 on 20 Oct reads 13:41 on 27 Oct, across
  the 25 Oct clock change. `npm run budget`: `/my` 171.5 KB before and after.
  Do not shift a homework due date into the viewer's zone, and do not add client JS to
  learn the zone.
- Calendar feed panel (2026-10-17, COH-016, docs/decisions/0160, migration 086 written and
  applied to the local stack only). A "Subscribe in your calendar" card under the calendar on
  `/my` (EN/RU with the saved choice) and on `/studio/calendar` (English), composed from
  existing classes and tokens, no new colours: the calendar cards' `rounded-2xl border bg-card`
  frame, a `bg-brand-subtle` primary and an outlined secondary button (`min-h-11`), the
  `destructive-subtle` error line.
  - No link yet: one line about what it does and "Create link". With a link made earlier: "You
    made a link on <date>. It can't be shown again; replace it to get a new one." with "Replace
    link" and "Turn off". Replace asks in place ("The old link will stop working in every
    calendar that uses it. Replace it?", "Yes, replace" / "Cancel"); Turn off does not ask, as
    creating a link again undoes it.
  - A new link is shown once in a read-only field (selects on focus) with Copy ("Copied" after),
    and a note that anyone with it can read the dates. The address is stored hashed, so a later
    visit shows the first state again, never the link.
  - The panel is left out when the status read fails (086 not applied).
  Measured at 360px (`scrollWidth/innerWidth`, local stack): 360/360 on `/my` with no link, with
  the link shown (a 64-character token in the field), in the replace confirm, and after Turn
  off; 360/360 on `/studio/calendar` with no link, the link shown and after Turn off; 1280/1280
  on `/my` in the same states. Not reached: the confirm on `/studio/calendar`, the error line,
  RU wording in a browser. `npm run budget`: `/my` 171.5 KB before, 174.0 KB after (limit 180).
  Do not show a stored address again (only its hash exists), and do not make Replace a
  one-click action: it breaks every calendar already subscribed.
- English surface renamed Alliengll to Alina Cher (2026-10-17, SHELL-025,
  docs/decisions/0161), superseding 0137's name (not its share-card layout). The
  wordmark (landing, course and lesson bands), the tab-title suffix
  (`· Alina Cher`), og:site_name, the share-card wordmark, the footer
  copyright, the English auth panel heading and its mobile logo label, and the
  calendar feed's name all read "Alina Cher". The Colloquiz panel is unchanged.
  The tagline "английский с умом" is not shown anywhere yet (SHELL-027). No new
  classes or tokens. Do not rename `lib/alliengll/*` or the
  `alliengll.attempts.v1` storage key: the second would orphan saved anonymous
  attempts.
- Alina Cher foundation (2026-10-17, SHELL-026, docs/decisions/0163, values from
  0162). The English surface is violet. `surface-alina` on `<html>` in
  `app/(english)/layout.tsx` overrides `--brand*` (`#5b3fd9` as fill, `#a595ea`
  as dark text); on a wrapper it does the same, for the sign-in panel. Every
  existing `bg-brand` / `text-brand-text` / `bg-brand-subtle` on an English
  route therefore turns violet, with no change to a component. Colloquiz and
  Studio stay indigo (measured: `--brand` `#4f46e5`). New tokens in `:root` and
  `.dark`: `--highlight`, `--highlight-foreground`, `--ink`, `--paper`,
  `--grid-line`, `--offset-shadow` (`shadow-offset`). Fonts: Unbounded 800
  (`font-display`, preloaded) and Caveat 600 (`font-accent`, not preloaded),
  with cyrillic. `.grid-paper`, `.marker`, `Marker` and `HandOval` are
  server-rendered CSS/SVG. `--background` is not changed yet, so no English page
  has the paper ground until a later card puts `.grid-paper` on it. Measured at
  360px on a scratch page (deleted): `scrollWidth/innerWidth` 360/360, light and
  dark; the real pages are not re-measured, since nothing but colour changed on
  them. `npm run budget`: unchanged on every route. Do not hard-code the violet
  in a component: use the tokens, and do not use `--ink` as the colour of text on
  the marker.
- Course access (2026-10-17, TCH-009, docs/decisions/0164, migration 087 applied to
  the local stack and, through the hosted-apply gate, to hosted). Studio only; a student sees
  nothing new. Composed from the group page's row frame, button classes and
  AlertDialog confirm; no new colours:
  - A linked student's page (`/studio/learners/[userId]`) gains "Course access"
    between Groups and Homework: one `rounded-2xl border bg-card` row per
    self-paced course the teacher edits, with the title (wraps), a
    `bg-brand-subtle text-brand-text` "Access opened" pill and "Since <date>" once
    granted, a muted "Draft" pill on an unpublished course, and a primary "Open
    access" button, or an outlined "Close access" that opens an AlertDialog. A
    student who already has the course through a purchase or an admin has no
    button, and a muted line says so. With no self-paced course, a dashed box
    explains that cohort courses use runs and invites.
  - The course editor of a self-paced course gains "Granted access (N)" above
    Homework: a row per linked student the teacher opened it for (their name is a
    link to their page), "Since <date>", and "Close access" behind the same confirm.
  - Both are in `WriteArea`: a frozen seat disables the buttons. A failed read hides
    the section instead of the page.
  Measured at 360px (local stack, seeded teacher, three linked students,
  `scrollWidth/innerWidth`): 360/360 on a linked student's page with no grants,
  after a grant (a 76-character title, a 70-character email), with the confirm
  open (dialog x 21, width 318), for a student with a purchase, and with the seat
  lapsed; 360/360 on the course editor with two grantees, with its confirm open,
  after a revoke, and with the seat lapsed. Not reached: a toast.
  Do not offer Close access on a row the teacher did not make, and do not decide
  the state in the client: `teacher_grantable_courses()` returns it.
- Alina Cher landing (2026-10-17, SHELL-027, docs/decisions/0165), SUPERSEDING
  the 0078 landing layout (the gradient hero band, `HeroDemo`, the word chips,
  the value strip and the gradient closing card); the EN/RU toggle, its cookie
  and the sticky-footer rules stand. `/` is grid paper (`.grid-paper`) from the
  header to the footer:
  - Header: wordmark (`font-display`), the tagline "английский с умом" in
    `font-accent` with the oval round "с умом" (Russian in both languages),
    Courses, the toggle and Log in or the account chip, in their `paper` tone
    (`LanguageToggle` and `AccountMenu` take `tone`; the default is the old
    white-on-gradient look, so the course and lesson bands are unchanged).
  - Hero: eyebrow, headline with "without the stress" / "без напряжения" on the
    marker, subtitle, a violet button with an ink outline and the offset shadow
    (`OFFSET_CTA_CLASS`), an "All courses" underlined link, a bio line (Alina's
    photo in a circle, "Courses made by Alina", Instagram and YouTube), and the
    comic panel with a yellow "10-15 minutes a day" sticker. No About me, no
    reviews.
  - Catalogue cards: ink outline, offset shadow, yellow level pill; a course with
    no cover gets a grid-paper tile with the level in the display face. How it
    works is record / feedback / compare, with yellow numeral tiles. The closing
    CTA is a yellow card with ink text.
  - New tokens `--comic-cell`, `--comic-frame`, `--comic-dino-big`,
    `--comic-dino-small`, `--comic-drop` in `:root` and `.dark` (0162's table).
    The dinosaur outline follows `--ink`, so it is a light line in dark.
  - `SectionHeading` gained `display`; off by default, the course page keeps its
    heading until SHELL-028. Removed: `HeroDemo`, `HeroChips`, `valueIcons`,
    `.landing-float`.
  Measured at 360px: `scrollWidth/innerWidth 360/360` (`npm run viewport360`,
  and Edge in light and dark, EN and RU); 1440/1440 at 1440px. `npm run budget`
  `/`: 179.1 KB before, 178.1 KB after, of 180. Not measured: a signed-in `/`.
  Do not put the gradient band or the demo back on `/`, and do not drop the
  dinosaur outline to `--comic-frame` in dark (too faint to read as a line).
- Course page and lesson chrome in the Alina Cher look (2026-10-17, SHELL-028,
  docs/decisions/0166), SUPERSEDING the gradient bands of 0079 D1 and D5 on
  `/courses/[courseSlug]` and the lesson page (the EN/RU toggle, saved choice,
  lesson-chrome language, access states and one-tap path stand). Both pages are
  grid paper (`.grid-paper`); the gradient stays on `/invite`, `/join`, `/runs`
  and `/my` until PROG-007. `BandTopBar` gained `tone="paper"` (default
  unchanged).
  - Course hero: yellow level pill, ink-outlined "Whole course free" pill, the
    title in `font-display`, the two progress numbers as ink-outlined tiles
    (still two numbers), the violet offset button, a cover with the ink outline
    and offset shadow; no cover shows `CourseCard`'s grid-paper level tile at
    `lg`. Lesson rows take the catalogue card's ink outline and offset shadow
    (`PAPER_CARD_CLASS`) and a yellow numeral tile; the cohort calls, tiers and
    before/after cards the same frame. Section headings use `SectionHeading
    display`.
  - Lesson band: the course title in `font-accent`, the title in `font-display`,
    a yellow "Lesson N of M" pill and ink-outlined pills, an ink rule under it.
    The progress strip has an ink-outlined track with a solid `bg-brand` fill and
    the count in the display face. The completion card is marker yellow
    (`--highlight`, `--highlight-foreground`) with the score in the display face
    and the violet offset "Next lesson" button; before completion it is the same
    dashed card with an ink border. The paid, scheduled and sign-in cards get the
    ink frame. The Studio "Visitor view" shows the same band, in Studio's indigo.
  - Unchanged: exercise cards, the registration offer, the answer review, the
    footer. No new tokens or hex literals. Measured at 360px:
    `scrollWidth/innerWidth 360/360` on the course page (EN, RU), a cohort course
    page (EN, RU), a free lesson, a drag/typed lesson, the paid state, the
    sign-in state; 360/360 and 1440/1440 in Edge, light and dark, with a lesson
    completed. `npm run budget`: course page 173.0 / 173.0 KB, free lesson 257.4 /
    257.4. Not measured: a signed-in session.
    Do not put the gradient band back on these two routes, and do not use
    `--ink` as the text colour on the yellow card (`--highlight-foreground`).
- Landing wording from the owner's mockups (2026-10-17, SHELL-031,
  docs/decisions/0167), SUPERSEDING SHELL-027's hero copy (0165), not its layout.
  The hero reads as `docs/design/alina-cher/owner-landing-hero-{ru,en}.png`:
  "Ты знаешь больше, чем можешь сказать" / "You know more than you can say",
  with the marker on "больше"/"more" and the hand-drawn oval on "сказать"/"say".
  The tagline in the header lost its oval. The eyebrow and the "no account"
  line are gone. The bio is "**Алина.** …" / "**Alina.** …"; the social row's
  label is visible text in the accent face with an arrow; Instagram and YouTube
  carry monochrome marks (`SocialIcons.tsx`, `currentColor`) in place of the
  external-link arrow. The sticker is "10–15" in the display face over a small
  unit, raised to `-top-12` (with `mt-4` on the panel below `lg`) so it clears
  the second caption; a line in the accent face with lucide's `Brain` sits
  under the panel. The landing's Russian says "ты" throughout. Existing classes
  and tokens; no new colours. Measured: `scrollWidth/innerWidth` 360/360 and
  1440/1440, EN and RU; no sticker overlap at 360–1440. `npm run budget`: `/`
  178.2 / 177.9 KB of 180. Do not put "About me" or "Student reviews" back
  without the partner's text (0156 Decision 14), and do not move the headline
  strings into the client component: `HeroTitle` keeps them server-rendered.
