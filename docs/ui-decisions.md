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
