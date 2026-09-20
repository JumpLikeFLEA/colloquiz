# CLAUDE.md

@AGENTS.md
@docs/handoff.md
@docs/ui-decisions.md

Colloquiz — a quiz platform (Next.js 16 / React 19 / TypeScript / Tailwind v4 /
Supabase, deployed to Vercel), now carrying a second surface: a catalogue of
English mini-courses for a Russian-speaking A2–B1–B2 audience, on the same app,
the same database and the same accounts.

Read `docs/handoff.md` before any design decision: it holds the purpose of both
surfaces, the audience, the monetisation constraints and the failure modes this
project has already hit. `docs/ui-decisions.md` is the running record of
deliberate UI decisions — read the relevant entry before "fixing" anything
that looks wrong.

## Working agreement

- Surface concerns before implementing. After posting a plan, STOP and wait
  for my answer, unless the task was invoked with `--no-approval` (see
  "Working on a board issue").
- One atomic, verifiable step at a time; one module per file.
- Explain the reasoning behind methodological choices, not just the code.
- Never auto-accept a guess. If a number or a behaviour surprises, re-derive
  it from the source instead of constructing an explanation.
- Counts in docs, commit messages and handoffs are copied from printed
  output, never typed.
- A causal claim cites the measurement that established it. "X happens
  because Y" — in a comment, decision doc, issue body or commit message —
  carries a pointer to the file, migration or run that established it. A
  claim with no such pointer is an assumption and gets written as one.
  Paraphrasing someone else's finding is how an assumption acquires a
  citation it never earned: point at the source instead of restating it.
- A check that passes on an empty result is a failure until proven otherwise.
  A green test over zero rows, a passing RLS check against an empty table, a
  filter that matched nothing — none of these are evidence.
- Scale verification to the stakes: bookkeeping gets a sanity check, not the
  full protocol. Anything touching entitlement, RLS, payments or account
  deletion gets the full protocol.
- A hypothesis is labelled as one and is never used as input to the next step
  until it's verified.
- `npm run check` must exit 0 before any commit. `npm test` must pass when
  anything under `lib/` changed. Both together are the pre-commit gate.

### Stop and ask before anything irreversible

- **Never push.** I review and push.
- **Never apply a migration.** Migrations are written to
  `supabase/migrations/NNN_*.sql` and handed to me with the SQL to run; I
  apply them against the hosted database myself. This is the established
  pattern and it is not negotiable — the database is hosted and shared.
- Deleting data, rewriting history, rotating keys, and anything at all
  against the live Supabase project or the Vercel production deployment.

### Standing rules this repo has paid for

Each of these was learned the hard way. Breaking one is a regression, not a
refactor.

- **Column GRANTs.** Migration 006 revoked blanket UPDATE on `profiles` in
  favour of a column ALLOW-LIST. Every new `profiles` column the app writes
  from a user session needs its own GRANT, or the write fails with
  "permission denied for table profiles" — a grant error, checked BEFORE RLS,
  not a policy failure. Columns written only by a SECURITY DEFINER RPC get no
  GRANT (see 036, 037).
- **Entitlement is decided in one place.** Whether a lesson is free or paid is
  resolved by a single SQL function that both RLS and the UI call. If the UI
  decides independently, the two will disagree, and the direction they
  disagree in is "paid content served for free". Never gate paid content on a
  client-side check alone.
- **The rating is never rendered.** `player_ratings` has RLS on with no
  policies and no grants; only the tier reaches the client.
- **Leaderboards use `display_name`, never `full_name`.**
- **The running app is the visual source of truth.** `/figma-export` was it
  until 2026-09-20 and has been deleted; the port is finished and the app has
  moved past it. There is no external reference to diff against, so the
  constraint is now internal consistency:
  - New UI composes from components already in `app/components/` and from
    classes already used elsewhere in the app. This is the NotificationBell /
    Groups / Leaderboard / Duels precedent, which by now is most of the app.
    It governs the whole English surface, which never had a design source.
  - Colours come from tokens (`--brand`, `--brand-subtle`, `--primary`,
    `--card`, the destructive-* set), never new hex literals. There is a known
    backlog of 461 hex literals across 48 values plus 644 hardcoded Tailwind
    palette classes with no `dark:` variants; do not add to it. A new colour
    is a token decision, not a class.
  - `app/globals.css` is the single source of truth for tokens, and every new
    token is defined in `:root` AND in `.dark`.
  - A deliberate visual change to an existing surface is still recorded in
    `docs/ui-decisions.md` in the same commit. An unrecorded one will be
    "fixed" by a future session. Redesigning a surface is fine; doing it by
    accident is what the log prevents.
- **`app/components/figma/**` is NOT the deleted reference folder.** It is
  vendored runtime code imported by app components, kept unlinted for the same
  reason `ui/**` is. The name is a leftover; the code is live. Do not delete
  it as part of any Figma cleanup.
- **`.design-sync/tw-input.css` is generated** by `build-pkg.mjs` from
  `app/globals.css`. globals.css is the single source of truth; treat
  tw-input.css as read-only.

## Repo map

- `app/` — Next.js app router.
  - `app/(auth)/` — AuthScreen, reset-password. `AuthLeftPanel` and `Field`
    are exported from AuthScreen for reuse.
  - `app/(main)/` — the signed-in shell: dashboard, progress, groups,
    leaderboard, duels, settings, quiz, my-quizzes, admin.
  - `app/(legal)/` — /terms, /privacy, /subprocessors. Rendered at build time
    from `docs/release/legal/*.md` through `lib/legalDoc.tsx`, a deliberately
    small Markdown-SUBSET renderer that must not become a general engine.
  - `app/(english)/` — the English mini-courses surface: landing, catalogue,
    course, lesson player. Reached by hostname rewrite in `proxy.ts`, not by
    a path prefix. **Planned (M2), not yet present.**
  - `app/api/` — route handlers: `account/export`, `account/delete`, `duels/`,
    `results/`.
  - `app/components/` — shared components. `ui/**` (vendored shadcn/Radix) and
    `figma/**` (vendored runtime helpers, incl. `ImageWithFallback`) are
    UNLINTED on purpose; they are upstream code, re-vendored on each add.
    `figma/**` is live code despite the name — see the standing rules.
- `lib/` — pure modules, unit-testable without a database: `scoring.ts`,
  `shuffleOptions.ts`, `history.ts`, `historyFilters.ts`, `subjectStats.ts`,
  `difficultyFilter.ts`, `accountExport.ts`, `accountDelete.ts`,
  `notificationPrefs.ts`, `profileFields.ts`, `avatar.ts`, `site.ts`,
  `legalDoc.tsx`, `sentryScrub.ts`, `supabase/` (incl. `admin.ts`, the
  service-role client — server-only, bypasses RLS, never reaches the browser).
  - `lib/items/` — the item-type registry: one module per type (`selection`,
    `selectionGrid`, `ordering`, `matching`, `slots`), each exporting `parse`,
    `score` and its renderer contract. Scores `{ earned, possible,
    subResults[] }`, not a boolean. This is what replaces exact string
    equality in `scoring.ts` for course items. **Planned (M0).**
  - `lib/entitlement.ts` — the client-side MIRROR of the entitlement SQL
    function. Mirror only; the function is the authority. **Planned (M3).**
- `supabase/migrations/NNN_*.sql` — schema. Numbered, applied by me, never by
  a session. Latest applied: 038.
- `scripts/`
  - `scripts/board/` — `backlog.mjs` (board data, incl. `rankOf()`),
    `bootstrap-board.mjs` (backlog → GitHub issues/board), `board-move.mjs`,
    `board-status.mjs`, `next-card.mjs` (an In-progress card in the active
    milestone, else the highest-ranked unblocked Ready card; prints the
    picked card's latest `SESSION HANDOFF` comment if it has one; see
    "Working on a board issue" and "Session handoff"). Node ESM over the `gh`
    CLI — deliberately not Python, so the repo keeps one toolchain.
    **Planned (M0, first issue).**
  - `scripts/session/context-guard.mjs` — `PreToolUse` hook registered in
    `.claude/settings.json`; injects the `CONTEXT SOFT LIMIT` message and
    denies non-essential tool calls past `CONTEXT HARD LIMIT` (see "Session
    handoff"). **Planned (M0).**
  - `scripts/import-course.ts` — idempotent course importer, keyed on
    `authored_key`. Archives or rejects, never DELETEs. Imports create
    DRAFTS; nothing it writes is publicly readable until published.
- `docs/`
  - `handoff.md` — purpose, audience, scope, principles, failure modes.
  - `ui-decisions.md` — the running log of deliberate UI decisions (until
    2026-09-20, of deviations from the deleted `/figma-export`). Reference
    material, not agreement; that is why it lives here and not in this file.
  - `adr/NNNN-<slug>.md` — architecture decisions (0002 is account erasure).
  - `decisions/NNNN-<slug>.md` — every decision made while working an issue,
    not only `type:decision` issues (see "Working on a board issue" step 5).
  - `release/legal/*.md` — reviewed legal copy; the single source of truth
    for the legal pages.
- Root: `proxy.ts` (route gating, `publicRoutes`, hostname rewrite),
  `next.config.ts` (headers, report-only CSP, remote image host),
  `eslint.config.mjs` (flat config), `DEVELOPMENT-MAP.md` (layered task map
  over the board; refreshed when a card reaches Done — see "Working on a
  board issue" step 8), `PLAN.md` (historical Noosphere record, not current).

Exact commands:

```
npm run check                      # tsc --noEmit && eslint .  — the static gate
npm run lint / npm run lint:fix
npm test                           # vitest, scoped to pure lib/ modules
npm run dev

node scripts/board/next-card.mjs
node scripts/board/board-move.mjs <KEY> "In progress"
node scripts/board/board-status.mjs
node scripts/board/bootstrap-board.mjs   # writes issues; ASK FIRST

npx tsx scripts/import-course.ts <file>  # writes DRAFTS only

gh issue view <n> --comments
```

`next lint` DOES NOT EXIST — Next.js 16 removed it along with the `eslint` key
in `next.config`. Do not add a `"lint": "next lint"` script.

## Working on a board issue

Issue bodies are specs. `docs/decisions/` holds settled decisions. Board
scripts live in `scripts/board/`.

Milestones: **M0** item engine · **M1** content & authoring · **M2** public
surface · **M3** monetisation · **M4** progression & polish.
Issue keys are epic-prefixed: `ITEM-`, `CNT-`, `AUTH-`, `SHELL-`, `ANON-`,
`PAY-`, `PROG-`, `OPS-`.

Three invocations:

- `work on <KEY>` — checkpointed. Post the plan, then stop and wait.
- `work on <KEY> --no-approval` — autonomous. Post the plan and keep going
  without waiting. Only the plan checkpoint is lifted; every stop listed
  below still holds.
- `work on next [--no-approval]` — run `node scripts/board/next-card.mjs` and
  work its pick the same way. If next-card reports the pick as
  `type:decision`, or reports the active milestone complete, or finds no
  unblocked Ready card, say so and return to chat instead of picking
  something else yourself.

Steps:

1. `gh issue view <n>`: read goal, acceptance and depends-on, plus every
   decision file it references. If a dependency is still open, run a
   satisfaction audit instead of assuming it blocks: for each of the
   dependency's acceptance lines, find the evidence (issue comments, commits,
   `docs/decisions/`) and mark it satisfied / partial / open, then say which
   of those lines this card actually consumes. Stop with a recommendation —
   close the dependency as satisfied, relax it and split the remainder into
   its own card, or it genuinely blocks — and return to chat rather than
   deciding it yourself, even under `--no-approval`.
2. `node scripts/board/board-move.mjs <KEY> "In progress"`.
3. Post a plan: steps, files touched, concerns, and anything the issue leaves
   undecided. Default: STOP and wait. Under `--no-approval`: proceed, and
   resolve the plan's open items yourself, recording each per step 5.
4. Implement one step at a time and show how each step was verified. A step
   touching `lib/` is verified by a test, not by inspection.
5. Any decision made during the work goes into
   `docs/decisions/NNNN-<slug>.md` (context, options, decision, what would
   make us revisit it), never only into the conversation. For
   `type:decision` issues, lay out the options with evidence; I make the call.
6. When every acceptance item has evidence: tick the boxes in the issue body,
   run `npm run check && npm test`, commit on master (linear history) with
   `Closes #<n>` in the final commit message, and move the card to Verify.
   Comment the evidence using this fixed template, in this order, every field
   present even when empty (write "None"):

   ```
   Evidence per acceptance line:
   - <acceptance line> -- <evidence>
   Decided unattended:
   - <decision> (or "None")
   Stops nearly hit:
   - <which working-agreement/--no-approval stop, and why it didn't fire> (or "None")
   Surprises:
   - <anything that didn't match the plan> (or "None")
   Proposed new cards:
   - <title + one-line acceptance> (or "None")
   ```

   **Never push.** I review and push; the push closes the issue and the board
   moves it to Done.
7. If new work turns up, propose a new issue (title + acceptance) instead of
   doing it inside this one.
8. When a card reaches Done — you tell me, or `board-status.mjs` shows `Done`
   for a card `DEVELOPMENT-MAP.md` still lists as outstanding — update the map
   in the same pass: drop the card from its layer, re-check what its
   completion unblocked, and re-state any ordering it changed (a dependency
   cut, a new blocker, a proposed issue now filed). Every count the map quotes
   is re-derived from printed output; never carry a number forward or
   hand-edit one. Update the map's `Last synced` line to the board snapshot it
   was checked against.

`--no-approval` does not lift these:

- Never push.
- Never apply a migration.
- Anything irreversible: writes to the hosted database, deleting data,
  rewriting history.
- `type:decision` issues — present options and stop; the flag is a no-op here.
- A choice that changes the shape of the deliverable: a schema change, a new
  npm dependency, a new item type, a change to the entitlement rule, or
  anything contradicting `docs/handoff.md`. Stop and ask.
- A visual change to an existing surface that has no recorded decision, or any
  new colour that isn't an existing token.
- Scope growth. Propose the new issue, don't absorb it.

Under `--no-approval`, finish with a summary of what you decided unattended
and which of the above you nearly hit, so the review has something to check.

## Return to chat when

- The card is `type:decision`.
- The active milestone is complete (every card in Verify or Done).
- The active milestone has no pickable cards left.
- Any `--no-approval` stop listed above fires.
- A dependency satisfaction audit (step 1) recommends anything other than
  "genuinely blocks".
- 3 or more cards in Verify.
- A migration is ready to apply and nothing further can be verified without
  it.

## Interrupting the active session

'''Stop the loop. Run the session handoff now:
- If the current step is complete and verified, commit it.
- If not, revert it (git restore / stash) and record that in the handoff,
  don't finish it.
- If a command was interrupted mid-run, say which one and check what it left
  behind (partial files, a half-written migration, an import run that wrote
  draft rows).
- Post the SESSION HANDOFF comment (or print it if no card is In progress),
  print `git status` (must be clean) and `git log -5 --oneline`, then stop.'''

## Session handoff

Triggered by the `CONTEXT SOFT LIMIT` message injected by
`scripts/session/context-guard.mjs` (a `PreToolUse` hook; see that module and
`.claude/settings.json`), or by me directly.

Not a stop-mid-step mechanism: never abandon the current atomic step because
of a handoff trigger. Finish it, run its verification, and commit — the
working tree must be clean when the handoff posts its comment. If the step
genuinely can't be finished (verification fails, a decision is needed), revert
it and record that it was reverted, rather than committing a half-done step or
leaving it uncommitted.

At the **hard** limit specifically, this is not a choice: `context-guard.mjs`
denies `Edit`/`Write` there (see its allowlist), so finishing the step is no
longer possible regardless of intent. Revert it — `git restore` for tracked
edits, `git stash` if it's worth keeping for the next session to reapply —
never leave it half-done. `git status`/`diff`/`log`/`add`/`commit`/`restore`/
`stash` and `gh issue view`/`comment` stay available specifically so this
revert-and-record path and the handoff comment itself can still run.

Then post one comment on the In-progress issue, this exact template:

```
SESSION HANDOFF <UTC timestamp>
- Card / plan step done / next step
- Commits this session
- Open hypotheses (labelled, unverified)
- Migrations written but not applied
- Stops nearly hit
- Context at handoff: <pct>% / <tokens>
- Resume command: work on next [--no-approval]
```

Then print `SESSION HANDOFF: <issue url>` and stop.

If no card is In progress (an ad-hoc session, not `work on <KEY>` / `work on
next`) there is no issue to comment on. Print the full template above to the
terminal instead of posting it, then stop.

A handoff is not a "Return to chat when" trigger — nothing is added there for
it. It isn't a request for review; I just start a new session, which picks it
up via `work on next` (`next-card.mjs` prints an In-progress card's latest
`SESSION HANDOFF` comment alongside the pick — see "Repo map").

## Planning brief

When asked for a planning brief ("planning brief since <date>"), produce one
markdown message for a chat planning session. No preamble.

1. Board: output of `node scripts/board/board-status.mjs`, verbatim.
2. Closed since <date> (from `git log --since`): per issue, the key, a
   one-line outcome, and anything that surprised us.
3. Autonomy log: per issue closed since <date>, the "Decided unattended" and
   "Stops nearly hit" lines from its step-6 template comment
   (`gh issue view <n> --comments`) — read verbatim from the comment, never
   reconstructed from the diff or git log. Skip an issue whose closing
   comment predates the template and say so once, rather than guessing.
4. Decisions: per new file in `docs/decisions/`, the title, the decision in
   one or two lines, and what would make us revisit it.
5. Migrations: written, applied, and pending — with the number and what each
   one changes.
6. Deviations: where the work contradicted `docs/handoff.md` or the backlog
   assumptions, and whether the doc was updated. Separately, every new entry
   in `docs/ui-decisions.md`.
7. Content: lessons drafted, published, and awaiting review — counts from
   printed output, never estimated.
8. Open questions, and proposed issues not yet created.
9. In flight: anything in In progress or Verify, and its current state.

Counts come from command output. Stay under ~80 lines; details on request.
Example: "Planning brief since 2026-09-12"

## Linting

- `npm run check` (`tsc --noEmit && eslint .`) is the static gate; it exits 0
  on a clean tree.
- Tier is `eslint-config-next/core-web-vitals` + `/typescript`. Type-aware
  rules (`projectService`) are deliberately NOT enabled — they would roughly
  triple run time for rules we have not needed yet.
- **Prettier is deliberately declined.** It was originally declined to keep
  the Figma-port diff auditable; that reason expired with the port, but a
  formatter would still reflow JSX across the whole codebase in one commit and
  bury every subsequent `git blame`. Adding it is a decision, not a chore — if
  it is ever added, it goes in on its own commit, alone.
- ESLint 9 does NOT read `.gitignore`, so `authored/`, `ds-bundle/` etc. are
  listed explicitly in `globalIgnores`. Supplying `globalIgnores` overrides
  eslint-config-next's own defaults, so `.next/**`, `out/**`, `build/**` and
  `next-env.d.ts` are re-listed by hand.
- `app/components/ui/**` (vendored shadcn/Radix) and `app/components/figma/**`
  (vendored runtime helpers) are unlinted on purpose — upstream code,
  re-vendored on each add. `ImageWithFallback`'s manual `<img>` handling is the
  point of the component, not a `no-img-element` violation to fix.
- Deliberately-unused bindings use the `_name` convention, honoured via
  `argsIgnorePattern` / `varsIgnorePattern` in the config.
- Two `react-hooks/refs` suppressions exist (`QuizSession.tsx`,
  `DuelRealtime.tsx`), each with a comment explaining why the ref is assigned
  during render. These are known debt, not oversights — read the comment
  before "fixing" them.