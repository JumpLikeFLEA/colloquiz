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
