/**
 * Board data. The single source of truth for cards; `bootstrap-board.mjs`
 * turns this into GitHub issues and project items, and `next-card.mjs` ranks
 * from it.
 *
 * Adding a card here does NOT create it on the board — re-run bootstrap.
 * Editing a card that already has an issue updates nothing automatically;
 * edit the issue, then reconcile this file.
 *
 * Lower `rank` wins. Ranks are spaced by 10 so a card can be slotted between
 * two others without renumbering.
 */

export const MILESTONES = [
  {
    key: 'M0',
    title: 'Foundations & item engine',
    goal:
      'The five item types score correctly under test, and the route namespace ' +
      'is settled before any English route exists. Nothing user-visible ships.',
  },
  { key: 'M1', title: 'Content & authoring', goal: 'The partner can publish a lesson without Gleb.' },
  { key: 'M2', title: 'Public surface', goal: 'A reel viewer can play a free lesson with no account.' },
  { key: 'M3', title: 'Monetisation', goal: 'A paid course can be bought and unlocked.' },
  { key: 'M4', title: 'Progression & polish', goal: 'English progression, explanations UI, analytics, SEO.' },
];

export const EPICS = [
  { key: 'ITEM', title: 'Item engine', desc: 'The item-type registry, scoring contract and per-type modules.' },
  { key: 'CNT', title: 'Content model', desc: 'Course/lesson schema, importer, publish pipeline.' },
  { key: 'AUTH', title: 'Authoring', desc: 'The UI the partner uses to write and publish lessons.' },
  { key: 'PLAY', title: 'Lesson player', desc: 'The learner-facing player M2 wraps; built in M1 because preview needs it.' },
  { key: 'SHELL', title: 'Brand shell', desc: 'Routing, layouts, landing, the Colloquiz/English split.' },
  { key: 'ANON', title: 'Anonymous conversion', desc: 'Play-before-signup and the progress migration.' },
  { key: 'PAY', title: 'Entitlement & payments', desc: 'Free/paid resolution, MoR checkout, unlocking.' },
  { key: 'PROG', title: 'Progression', desc: 'English progression, separate from Colloquiz XP.' },
  { key: 'OPS', title: 'Ops', desc: 'Board tooling, session harness, test infrastructure.' },
];

export const CARDS = [
  // ---------------------------------------------------------------- OPS ---
  {
    key: 'OPS-001',
    title: 'Board scripts (bootstrap, move, status, next-card)',
    milestone: 'M0',
    epic: 'OPS',
    type: 'task',
    rank: 10,
    dependsOn: [],
    bootstrap: true,
    goal:
      'Build the Node ESM scripts that turn this backlog into a GitHub project ' +
      'board and drive the `work on next` loop. Worked by hand from a prompt, ' +
      'because it is what creates the board it would otherwise be tracked on.',
    acceptance: [
      '`scripts/board/bootstrap-board.mjs` creates one GitHub issue per card in CARDS, with the goal as the body, acceptance as a task list, milestone assigned, and epic + type as labels. Re-running it is idempotent: it updates existing issues by key rather than creating duplicates, and prints created/updated/skipped counts.',
      '`scripts/board/board-move.mjs <KEY> "<column>"` moves the card and prints the before/after column. An unknown key or column exits non-zero with the valid values listed.',
      '`scripts/board/board-status.mjs` prints a table of every card: key, title, milestone, column, blocked-by-open-dependency. Output is stable enough to paste verbatim into a planning brief.',
      '`scripts/board/next-card.mjs` returns an In-progress card in the active milestone if one exists; otherwise the lowest-rank Ready card whose dependsOn are all closed. It prints the pick, the reason it was picked, and the picked card\'s latest SESSION HANDOFF comment if it has one. With no pickable card it says which of the three "return to chat" conditions applies and exits 0.',
      '`rankOf(key)` is exported from backlog.mjs and used by next-card.mjs — ranking logic lives in one place.',
      'All four scripts run on `gh` with no Python and no new npm dependency beyond what `gh` provides. `node scripts/board/<name>.mjs --help` prints usage.',
      'Verified against the real board, not a dry run: bootstrap creates the M0 cards, board-status lists them, next-card picks OPS-002. Paste the printed output as evidence — a script that "ran without error" over zero cards is not evidence.',
    ],
    notes:
      'The board is a GitHub Projects v2 board; `gh project` commands need a ' +
      'project number and owner. Put them in one config constant, not scattered ' +
      'through four files.',
  },
  {
    key: 'OPS-002',
    title: 'Context guard hook + session handoff mechanics',
    milestone: 'M0',
    epic: 'OPS',
    type: 'task',
    rank: 20,
    dependsOn: ['OPS-001'],
    goal:
      'Make the session handoff described in CLAUDE.md actually fire, rather ' +
      'than depending on a session noticing its own context usage.',
    acceptance: [
      '`scripts/session/context-guard.mjs` is registered as a PreToolUse hook in `.claude/settings.json`.',
      'At CONTEXT SOFT LIMIT it injects the `CONTEXT SOFT LIMIT` message and allows the call through.',
      'At CONTEXT HARD LIMIT it denies `Edit` and `Write`, and allows exactly the allowlist CLAUDE.md names: `git status|diff|log|add|commit|restore|stash` and `gh issue view|comment`. A denied call returns a message saying to revert and post the handoff.',
      'Both limits are constants at the top of the file with a comment saying what they were tuned against.',
      'Unit tests cover the decision logic — soft passes, hard denies Edit, hard allows `git commit`, hard denies an unlisted Bash command. Tests run under `npm test` and do not require a live session.',
      'A dry-fire: force the hard limit in a scratch session and show the denial message plus a successful `git status` afterwards.',
    ],
  },
  {
    key: 'OPS-004',
    title: 'Context guard reads real token usage instead of estimating it',
    milestone: 'M0',
    epic: 'OPS',
    type: 'task',
    rank: 25,
    dependsOn: ['OPS-002'],
    goal:
      'Replace the context guard\'s chars/CHARS_PER_TOKEN estimate with the token ' +
      'counts the transcript already carries, so the trip point stops depending on ' +
      'a constant that measurement showed cannot have a correct value. Calibration ' +
      'across four real transcripts put the true ratio between 6.53 and 9.57 against ' +
      'the assumed 4: the guard over-counts by 1.63-2.39x and would fire its hard ' +
      'limit at as little as 31% of the real window. See ' +
      'docs/decisions/0003-context-guard.md.',
    acceptance: [
      '`estimateUsageFraction()` is replaced by a reader returning the last non-sidechain `message.usage` in the transcript as `(input_tokens + cache_creation_input_tokens + cache_read_input_tokens) / CONTEXT_WINDOW_TOKENS`. `CHARS_PER_TOKEN` and the `isCompactSummary` boundary scan are deleted, not kept as a fallback — 0003 already recorded that two independent estimates of the same thing is how they quietly disagree.',
      'A transcript with no usage entry (the first tool call of a session, or a format change) returns 0 and allows, consistent with the fail-open choice in main(). Show that case.',
      'The sidechain exclusion is verified against a real transcript that HAS sidechain entries, not asserted. The calibration sample was 0.0% sidechain in all four transcripts, so a test passing over zero sidechain rows is not evidence.',
      'Unit tests cover last-usage-wins, sidechain skipped, no-usage-found, and a malformed trailing line. The existing 14 decide() tests still pass unchanged.',
      'Dry-fire through the stdin contract against a REAL transcript path, not /dev/null: show the usage fraction the guard reports and the raw usage numbers it came from.',
      '`scripts/session/calibrate-context-guard.mjs` lands as the calibration tool 0003 asks for, rewritten to validate CONTEXT_WINDOW_TOKENS against compaction boundaries — the window is the only unvalidated constant once CHARS_PER_TOKEN is gone.',
      '0003 gains a second dated revision recording the measurement, the sample it rests on (four transcripts, one project, one density profile), and the successor calibration item.',
    ],
    notes:
      'Measurement behind this card, from the 2026-09-20 probe run: implied ' +
      'CHARS_PER_TOKEN of 6.53 / 6.82 / 7.77 / 9.57 across four transcripts of one ' +
      'project, drifting upward within every session as the fixed system-prompt and ' +
      'tool-schema overhead amortises. The between-session spread has no established ' +
      'cause and does not need one: the replacement removes the constant rather than ' +
      'tuning it. Confirming the guard against a live `/context` reading still wants ' +
      'doing once, but it is a check on the window constant now, not on the estimate.',
  },
  {
    key: 'OPS-003',
    title: 'Vitest scoped to lib/, wired into the pre-commit gate',
    milestone: 'M0',
    epic: 'OPS',
    type: 'task',
    rank: 30,
    dependsOn: [],
    goal:
      'Every ITEM card is verified by a test rather than by inspection, so the ' +
      'test runner has to exist and be trustworthy first.',
    acceptance: [
      'Vitest is a devDependency, configured to collect only pure modules under `lib/` — no jsdom, no React, no database.',
      '`npm test` runs it and exits 0. `npm run check && npm test` is documented in CLAUDE.md as the pre-commit gate (already written; confirm it is true).',
      'At least one test covers an EXISTING lib module (`shuffleOptions.ts` is the natural first — it is pure and has a documented determinism property), so the runner is proven against real code and not only against code written to suit it.',
      'A deliberately failing test exits non-zero and names the failing case. Show that output — a green run proves nothing about a runner that cannot go red.',
      'Report whether vitest was already present from the Colloquiz courses plan; if so this card is a verification pass and says so rather than reinstalling it.',
    ],
  },
  {
    key: 'OPS-005',
    title: 'checkedAcceptanceLines matches ticked lines tolerantly',
    milestone: 'M0',
    epic: 'OPS',
    type: 'task',
    rank: 999,
    dependsOn: ['OPS-001'],
    goal:
      'checkedAcceptanceLines (bootstrap-board.mjs) matches acceptance text by ' +
      'exact string equality, so a ticked box in the live issue un-ticks itself ' +
      'the moment GitHub or a hand-edit normalises a dash, a smart quote, or ' +
      'trailing whitespace on that line — silently discarding completed-work ' +
      'status on the next bootstrap run.',
    acceptance: [
      'Ticked state survives dash (`--` / `–` / `—`), smart-quote and trailing-whitespace differences between the live issue line and the backlog text for the same acceptance item.',
      'A test covers the ITEM-002 case.',
      'A genuinely changed acceptance line — not just a punctuation/whitespace normalisation — still renders unticked.',
    ],
  },

  // -------------------------------------------------------------- SHELL ---
  {
    key: 'SHELL-001',
    title: 'Move Colloquiz under a path prefix, freeing / for English',
    milestone: 'M0',
    epic: 'SHELL',
    type: 'task',
    rank: 40,
    dependsOn: ['OPS-003'],
    goal:
      'The English surface owns the clean URLs. Colloquiz moves wholesale under ' +
      'one path segment. Done in M0 deliberately: the move gets more expensive ' +
      'with every route added, and there is no meaningful bookmark base to ' +
      'protect yet.',
    acceptance: [
      'ONE OPEN CHOICE, confirmed at plan time before any file moves: the segment name. Recommendation on record is `/app` — `/quiz` collides with the existing `/quiz/[id]`, `/colloquiz` reads oddly on a Colloquiz-branded domain. Do not proceed on the recommendation alone.',
      'Every route currently under `app/(main)/**` is reachable under the new prefix and nowhere else.',
      'Every old path issues a 308 permanent redirect to its new location, including deep links (`/quiz/<id>`, `/groups/<id>`, `/duels/<id>`). Enumerate them from the route tree, not from memory.',
      'No internal link points at an old path: grep for `href="/` and `router.push("/` across `app/` and `lib/`, and show the grep returning only new-prefix and external paths.',
      'Notification deep-links stored in the database are checked: if any row embeds an absolute path, say so and propose a follow-up card rather than migrating data in this one.',
      '`proxy.ts` route gating and `publicRoutes` updated for the new paths; the legal routes and `/robots.txt` still resolve signed-in and signed-out.',
      'OAuth redirect URLs and Supabase auth redirect configuration reviewed for hardcoded paths — report findings even if nothing needs changing.',
      '`npm run check` exits 0. Manual smoke: sign in, land on the prefixed home, play a quiz, open a group, open settings.',
      'No visual change anywhere. This is a move, not a redesign.',
    ],
    notes:
      '`app/(main)/` is a route group contributing no path segment, so this is ' +
      'a real directory move plus a wide Link sweep. Expect it to touch many ' +
      'files and almost no logic. Land it in one commit so the rename is one ' +
      'reviewable point in history.',
  },
  {
    key: 'SHELL-002',
    title: 'Prove Cyrillic coverage of the served webfonts',
    milestone: 'M1',
    epic: 'SHELL',
    type: 'task',
    rank: 180,
    dependsOn: [],
    goal:
      'docs/decisions/0018-alliengll-content-model.md Decision 5: no fallback ' +
      'to a system font, anywhere Alliengll content renders.',
    acceptance: [
      '`next/font` is configured with the subsets needed for Russian text, for every face Alliengll content uses (Geist and Geist Mono if the player uses mono).',
      'The served font files (from `next build` output, not the package\'s claims) are checked for coverage with a one-off script, not committed as a dependency. Its printed output shows every code point in U+0410-U+044F, `Ёё` (U+0401, U+0451), `« » — – №`, and straight and curly quotes.',
      'Any gap stops the card and becomes a font-choice decision. It is not fixed with a fallback stack.',
      'A test page with that full character set shows only the webfont in the browser\'s rendered-fonts panel, with a screenshot attached as evidence.',
    ],
  },
  {
    key: 'SHELL-003',
    title: 'Re-derive design-token figures; guard against new hex literals',
    milestone: 'M1',
    epic: 'SHELL',
    type: 'task',
    rank: 330,
    dependsOn: [],
    goal:
      'The M1 audit (Phase 1, 2026-09-21) found the recorded hex-literal count ' +
      'did not match a fresh `rg`, and found no source for the "three known ' +
      '`.dark` bugs" claim. Replace stale figures with the command that ' +
      'produces them, and stop the literal count from growing further ' +
      '(docs/handoff.md, "Visual work" §1) without migrating the existing ones.',
    acceptance: [
      'Every token-debt figure in `CLAUDE.md` and `docs/handoff.md` is either replaced by the exact command that produces it plus that command\'s printed output today, or removed.',
      'The stale "`--brand` absent from `.dark`" premise is removed wherever it appears (the M1 audit found both tokens already present in `.dark`).',
      '`npm run check` fails on a new hex literal under `app/` or `lib/` outside an explicit allow-list (the Satori brand hexes in `lib/site.ts`, `global-error.tsx`), with no new npm dependency. It is shown failing on a planted literal and passing without it.',
    ],
  },
  {
    key: 'SHELL-004',
    title: 'Spike: `.dark` token gaps and the "three known `.dark` bugs"',
    milestone: 'M1',
    epic: 'SHELL',
    type: 'task',
    rank: 1000,
    dependsOn: [],
    goal:
      'Low-priority, blocks nothing (docs/handoff.md, "Visual work" §1). Find ' +
      'any genuine `.dark` token gap and either substantiate the "three known ' +
      'bugs" claim or strike it — it has no citation anywhere in git log, ' +
      'issues or docs as of the M1 audit.',
    acceptance: [
      'A printed diff lists every custom property defined in `:root` but not in `.dark` in `app/globals.css`. Each gap is fixed in this card if it is a missing token, or recorded as intentional.',
      'Search `git log`, issues and `docs/` for the "three known bugs" claim\'s origin. Record where it came from, or that no source exists.',
      'If sources exist, each bug is reproduced or shown fixed, and real ones become their own cards.',
      'If no source exists, the claim is struck from `docs/handoff.md` with a pointer to this card.',
    ],
    notes: 'priority:low. Ranked last deliberately — nothing else in M1 depends on it.',
  },

  // --------------------------------------------------------------- ITEM ---
  {
    key: 'ITEM-001',
    title: 'Item type contract and registry skeleton',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 50,
    dependsOn: ['OPS-003'],
    goal:
      'Define the discriminated union, the scoring result shape and the registry ' +
      'interface every item type implements. Everything else in M0 implements ' +
      'this; getting it wrong is expensive, so it ships alone.',
    acceptance: [
      '`lib/items/types.ts` defines the item union (`selection`, `selection_grid`, `ordering`, `matching`, `slots`) and the result shape `{ earned, possible, subResults[] }`, where a subResult carries its own correctness and an explanation reference.',
      'The registry interface is defined: each type module exports `parse` (unknown -> typed item, or a typed error), `score` (item + response -> result), and declares what its renderer needs. No rendering code in this card.',
      '`lib/items/index.ts` holds the registry map, typed so a missing or extra type is a compile error rather than a runtime surprise.',
      'Zod (or the existing validation approach — check what the codebase already uses before adding a dependency) parses authored JSON. Adding a new dependency is a stop-and-ask.',
      'THE ABSTRACTION TEST: a throwaway `free_text` module — parse + a score that always returns `{ earned: 0, possible: 1 }` pending LLM grading — compiles against the contract with ZERO changes to `types.ts` or the registry interface. Commit the sketch under `lib/items/__sketches__/` or delete it and show the diff in the evidence. If the contract needed changing to admit it, the contract is wrong and this card is not done.',
      '`docs/decisions/NNNN-item-type-contract.md` records the shape, why partial credit is per-subResult, and what would make us revisit it.',
      '`npm run check` exits 0. No behaviour to test yet beyond types compiling.',
    ],
    notes:
      'Partial credit is settled: 8/10 on a grid is 0.8 of that item, and the ' +
      'lesson denominator is constant because English lessons are fixed ' +
      'authored sequences. Do not reintroduce all-or-nothing scoring.',
  },
  {
    key: 'ITEM-002',
    title: 'Seeded shuffling for item presentation',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 60,
    dependsOn: ['ITEM-001'],
    goal:
      'Option order, pair order and the initial scramble are deterministic per ' +
      'learner-attempt, reusing the existing PRNG rather than inventing a second ' +
      'one.',
    acceptance: [
      'Shuffling reuses `lib/shuffleOptions.ts` (xmur3 + mulberry32). No new PRNG.',
      'The seed convention is documented and applied consistently: one seed per attempt+item, so re-rendering the same item mid-attempt does not reshuffle under the learner.',
      'For `ordering`: the presented scramble is NEVER the correct order. Test it against a 2-element item, where a naive shuffle hits the answer half the time.',
      'Tests: same seed gives the same permutation; different seeds give different permutations across a sample; the ordering guarantee holds for n=2 and n=3 over many seeds.',
      'No scoring depends on presentation order — scoring works against item identity, not position. State how this was verified.',
    ],
  },
  {
    key: 'ITEM-003',
    title: 'selection — MCQ single, MCQ multi, True/False',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 70,
    dependsOn: ['ITEM-001', 'ITEM-002'],
    goal: 'The simplest type, and the one that proves the contract is usable.',
    acceptance: [
      'Handles single-answer MCQ, multi-answer MCQ, and True/False as one type with a flag — not three types.',
      'Multi-answer scoring rule is DECIDED AND RECORDED, not assumed: all-or-nothing, or credit per correct option with a penalty for wrong ones. Whichever is chosen goes in a decision doc with the reasoning, because it changes what a learner sees.',
      'Tests cover: fully correct, fully wrong, partially correct (multi), no response, a response naming an option that does not exist, and a malformed response.',
      'A response referencing an unknown option id is rejected by `parse`/`score` rather than silently scoring zero — a client bug and a wrong answer must not look identical.',
      '`npm test` green, with the failing-case output shown for at least one deliberately broken input.',
    ],
  },
  {
    key: 'ITEM-004',
    title: 'selection_grid — N statements, one choice each',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 80,
    dependsOn: ['ITEM-003'],
    goal:
      'The inline True/False item: ten sentences, T or F against each. The first ' +
      'type where partial credit is the whole point.',
    acceptance: [
      '`possible` equals the number of rows; `earned` equals the number correct. 8 of 10 scores 0.8, not 0.',
      '`subResults` carries one entry per row, each with its row identity, correctness, and its explanation reference.',
      'A partially answered grid scores the answered rows and marks the rest incorrect — it does not throw and does not score the item as unattempted.',
      'Tests: all correct, none correct, 8/10, one row unanswered, a row referencing an unknown statement id, zero rows (must be rejected at parse, not scored as 0/0).',
      'The 0/0 case is explicitly tested. A grid with no rows dividing into the lesson total is the exact shape of bug that turns a score into NaN.',
    ],
  },
  {
    key: 'ITEM-005',
    title: 'ordering — permutation of N elements',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 90,
    dependsOn: ['ITEM-002', 'ITEM-003'],
    goal: 'Sequencing and word-order items. Drag is the affordance, not the type.',
    acceptance: [
      'Scoring rule DECIDED AND RECORDED: exact permutation, or credit per element in the correct position, or a distance metric. For A2–B1 word order, per-position credit is the likely fit — but record the choice and the reasoning, do not default silently.',
      '`subResults` identifies which positions were wrong, so the UI can mark them individually.',
      'Tests: exact match, fully reversed, one adjacent swap, a response with a duplicated element, a response missing an element, a response with an element not in the item.',
      'The duplicate and missing cases are rejected at parse — a permutation that is not a permutation is malformed input, not a wrong answer.',
    ],
  },
  {
    key: 'ITEM-011',
    title: 'Shared response-error contract for item types',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'decision',
    rank: 95,
    dependsOn: ['ITEM-003', 'ITEM-004', 'ITEM-005'],
    goal:
      'Three item types (selection, selection_grid, ordering) each throw their ' +
      'own typed response error with overlapping codes (malformed, unknown id, ' +
      'duplicate id) — the threshold docs/decisions/0008-selection-scoring.md ' +
      'named for revisiting the contract. Before matching and slots add a ' +
      'fourth and fifth ad hoc error class, decide one shared contract so a ' +
      'lesson-level caller (Σearned/Σpossible) can tell a client bug from a ' +
      'legitimate zero score with a single check.',
    acceptance: [
      'Options laid out with evidence from the three existing error classes (SelectionResponseError, SelectionGridResponseError, OrderingResponseError): (1) a shared base error class (e.g. ItemResponseError { code, itemId, itemType }) with score()\'s signature unchanged; (2) an error channel on ItemScoreResult (score() returns ok | error). Include call-site and module impact for each. Decision recorded in docs/decisions/.',
    ],
    notes:
      'type:decision — lay out the options with evidence, do not pick. This ' +
      'card changes the shared ItemTypeModule / ItemScoreResult contract every ' +
      'item-type module implements against.',
  },
  {
    key: 'ITEM-012',
    title: 'Migrate selection/selection_grid/ordering to shared ItemResponseError',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 97,
    dependsOn: ['ITEM-011'],
    goal:
      'ITEM-011 (docs/decisions/0012-item-response-errors.md) decided the ' +
      'shared error class; this card carries out the option-1 migration it ' +
      'committed to, before matching and slots (ITEM-006/007) depend on it.',
    acceptance: [
      'ItemResponseError { code, itemId, itemType } in lib/items/errors.ts; one code union: malformed, unknown_id, duplicate_id, plus too_many_selections (selection) and missing_element (ordering).',
      'selection.ts, selectionGrid.ts and ordering.ts throw it; the three module-specific classes deleted; old codes renamed, not aliased (unknown_option -> unknown_id, duplicate_selection -> duplicate_id, and any selection_grid equivalents), with their tests updated.',
      'A test proves one `instanceof ItemResponseError` check distinguishes every existing response error from a legitimate zero score.',
      '0008 and 0011 revisit notes point at 0012.',
    ],
    notes:
      'Executes the option decided in docs/decisions/0012-item-response-errors.md ' +
      '— do not relitigate the option here.',
  },
  {
    key: 'ITEM-006',
    title: 'matching — pairs, including image matching',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 100,
    dependsOn: ['ITEM-002', 'ITEM-003', 'ITEM-012'],
    goal:
      'Word-to-definition and word-to-image are one type with different ' +
      'renderers. The module knows nothing about images.',
    acceptance: [
      'Left and right sides are authored independently; an item may have unequal sides (distractors on the right with no left partner).',
      'Credit is per correct pair; `possible` equals the number of left items that have a correct partner.',
      '`subResults` identifies each left item and whether its pairing was correct.',
      'Image matching adds no field to the scoring module — the image lives in the element\'s content, and `score` never reads it. State how this was verified.',
      'Tests: all pairs correct, none, half, a left item left unpaired, two left items mapped to the same right item, a pair referencing an unknown id.',
      'The many-to-one case is decided and recorded: is mapping two words to the same definition legal input or malformed?',
    ],
  },
  {
    key: 'ITEM-007',
    title: 'slots — cloze, word insertion, drag-into-gap',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 110,
    dependsOn: ['ITEM-003', 'ITEM-012'],
    goal:
      'Three of the twelve requested functions collapse into this one type. The ' +
      'hardest of the five, because typed input means answer normalisation.',
    acceptance: [
      'One type with `input: "typed" | "drag"`. The two affordances score identically; assert this with a test that scores the same response both ways.',
      'Each gap holds a LIST of accepted answers, not one string.',
      'NORMALISATION IS DECIDED AND RECORDED — this is the substance of the card. At minimum: case sensitivity, leading/trailing whitespace, internal whitespace, curly vs straight apostrophes (a Russian keyboard and an English one do not produce the same character), and whether trailing punctuation is stripped. Each rule gets a test. Getting this wrong marks correct answers wrong, which is the single worst outcome for a beginner learner.',
      'Explicitly out of scope unless argued for: fuzzy matching, typo tolerance, stemming. A near-miss is wrong in v1, and the explanation is what softens it.',
      'Credit is per gap; `possible` equals the number of gaps.',
      'Tests: all gaps right, none, some, an empty gap, whitespace-padded input, wrong case, curly apostrophe against a straight-apostrophe answer, an answer matching the second entry in the accepted list.',
    ],
    notes:
      'Colloquiz\'s existing `lib/scoring.ts` uses exact string equality, and an ' +
      'existing Psychology question contains "$500" in `correct_answer`. Do not ' +
      'change `scoring.ts` behaviour in this card — the item registry is a ' +
      'parallel path for course items. Any change to the old scorer is its own ' +
      'card.',
  },
  {
    key: 'ITEM-008',
    title: 'Lesson scoring aggregate',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 120,
    dependsOn: ['ITEM-004', 'ITEM-005', 'ITEM-006', 'ITEM-007'],
    goal: 'Roll item results into a lesson result the progression layer can store.',
    acceptance: [
      'Lesson score is `Σearned / Σpossible` across items, with the per-item breakdown preserved.',
      'A lesson with zero items, or where every item has `possible: 0`, returns an explicit unscored result rather than dividing by zero. Test it.',
      'Rounding is decided and recorded once, here, not per surface — including what 79.5% displays as.',
      'The result shape carries everything the explanations UI needs without a second pass over the items.',
      'Tests: a mixed lesson hand-computed against an expected percentage; an all-correct lesson; an all-wrong lesson; a lesson with one unattempted item.',
      'The hand-computed case is computed BY HAND in the test as a literal, not by calling the same function the test is checking.',
    ],
  },
  {
    key: 'ITEM-009',
    title: 'Explanation resolution',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 130,
    dependsOn: ['ITEM-008'],
    goal:
      'Every mistake gets an explanation, and explanations attach at the level ' +
      'the mistake happened — per sub-response, not per item.',
    acceptance: [
      'The authored shape for explanations is defined for all five types: a grid row, an ordering position, a matching pair and a gap each carry their own explanation.',
      'A resolver maps a result\'s wrong subResults to their explanations, returning them in presentation order.',
      'A missing explanation is a PARSE-TIME failure for published content, not a runtime blank. Decide and record whether it blocks publish or only warns — and make the importer\'s behaviour match.',
      'An item-level fallback explanation is supported, so a ten-row grid need not have ten if one covers it.',
      'Tests: every wrong sub-response resolves; a correct response resolves to none; fallback used when a specific one is absent; a wrong response with no explanation anywhere behaves as decided above.',
      'THE AUTHORING COST IS WRITTEN DOWN, in the decision doc and in whatever the partner reads: a ten-row inline True/False needs up to ten explanations. This is the item type\'s real price and she must know it before designing around it.',
    ],
  },
  {
    key: 'ITEM-010',
    title: 'Dev-only item playground',
    milestone: 'M0',
    epic: 'ITEM',
    type: 'task',
    rank: 140,
    dependsOn: ['ITEM-009'],
    goal:
      'Prove the contract end-to-end by rendering one authored example of each ' +
      'type and scoring a real response. Without this, M0 ships five modules ' +
      'nobody has watched run.',
    acceptance: [
      'A dev/admin-gated route renders one example of each of the five types, accepts a response, and shows the score plus resolved explanations.',
      'NOT in `publicRoutes`, and unreachable in production by a signed-out visitor. State how that was verified, not that it is intended.',
      'Renderers are throwaway and say so in a comment — the real player is M2. This card exists to falsify the contract, not to design the UI.',
      'Composed only from classes already used in the app, per the standing rules.',
      'The five examples are committed as fixtures and reused by the M2 player\'s tests rather than re-authored.',
      'Evidence is a screenshot or a recorded interaction per type, not a description.',
    ],
  },

  // ---------------------------------------------------------------- CNT ---
  {
    key: 'CNT-001',
    title: 'Retire Colloquiz courses (code and data)',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 150,
    dependsOn: [],
    goal:
      'Remove the Colloquiz course feature and write the migration that ' +
      'deletes its data (docs/decisions/0018-alliengll-content-model.md ' +
      'Decision 1). `courses`, `course_editors`, `can_edit_course` and the ' +
      'editor-grant RPCs are kept — they are reshaped in CNT-002. Everything ' +
      'else Decision 1 marks dropped goes.',
    acceptance: [
      'Before writing the migration, a printed audit counts every reference to a course question outside the course tables: `quizzes.question_ids` elements matching the course id prefix; `results` rows on such quizzes; `quiz_history` subject derivation. Any non-zero count is resolved in the migration (and recorded) rather than left as a dangling id that breaks History.',
      'Both courses (`calculus-i` and `human-behavioral-biology`) and all their rows are deleted, with before/after row counts printed per table.',
      '`supabase/migrations/039_theory_heading_block.sql` (never applied) is deleted from the repo. The retirement migration takes number 039.',
      'The migration drops every course table, RPC and policy 0018 marks as dropped, deletes the course questions and their `questions` columns, and narrows the `visibility` CHECK. It is handed over unapplied, with the SQL to run.',
      'Quick Play is untouched (standing rule). Before and after the migration, printed output shows these results unchanged: `sampleQuestions()`; `get_subject_stats()` per subject; the `visibility=\'shared\'` question count. The `visibility=\'course\'` rows were never visible to Quick Play, so any change is a bug to explain.',
      'Removed from the app: `scripts/import-course.ts`, `lib/courseContent.ts` and `lib/theoryValidate.ts`, with their tests; the course learner and authoring routes, and `COURSES_ENABLED`; the sidebar and admin entries pointing at them.',
      'KaTeX remains wherever Colloquiz quiz questions render it. A printed `rg` shows the remaining KaTeX imports, and none of them is under a course path.',
      '`npm run check && npm test` exit 0. The vitest file count drops only by the removed suites, with before/after counts printed.',
      '`CLAUDE.md` repo map and `docs/handoff.md` no longer describe Colloquiz courses as present.',
      'The name "Alliengll" appears in no user-facing string, route segment or metadata. It is an internal name (0018).',
    ],
  },
  {
    key: 'CNT-002',
    title: 'Alliengll schema migration',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 160,
    dependsOn: ['CNT-001'],
    goal:
      'Implements 0018 Decisions 2, 4 and 6 as one migration: reshape ' +
      '`courses`, create `lessons`, `lesson_versions` and ' +
      '`course_entitlements`, write `can_read_lesson`, the RLS, the ' +
      'save/publish/free-sample RPCs, and the image bucket.',
    acceptance: [
      '`courses` has lost `access` and gained `author_id`.',
      '`lessons` and `lesson_versions` exist with the columns in 0018.',
      '`lesson_versions` has no UPDATE or DELETE path for any app role.',
      '`course_entitlements` exists, is empty, and has no grant allowing an app role to write it.',
      '`can_read_lesson` matches the 0018 definition, and is the only thing the `lesson_versions` read policy calls for non-editors.',
      '`save_lesson_version` enforces the concurrency token: saving against a stale latest-version id fails.',
      '`publish_lesson` sets `published_version_id` and `published_item_count` together.',
      '`set_lesson_free_sample` is separate from both, and neither save nor publish touches `in_free_sample`.',
      'Creating a course\'s first lesson writes `in_free_sample = true`. Every later lesson defaults to false. Nothing derives it from `ordinal`.',
      'Public storage bucket for lesson images: writes are scoped to course editors, and limits are declared in one `lib/` constant and enforced again on the bucket (the avatar precedent).',
      'Full verification protocol (this card touches entitlement and RLS), run against seeded, non-empty data with the output printed: `anon`, a signed-in non-buyer, a signed-in buyer (seeded entitlement row) and an editor; each against a free-sample lesson, a paid lesson and an unpublished draft; a 12-cell matrix, every cell matching 0018.',
      'The migration applies cleanly to a local Supabase replaying every migration from 001 (supabase start + db reset), with output printed, before it is handed over.',
      'Handed over unapplied with the SQL to run, as migration 041, after CNT-001\'s 039 and 040 (040 deletes the two retired `courses`/`course_editors` rows so this migration starts from an empty table).',
    ],
  },
  {
    key: 'CNT-003',
    title: 'Lesson document validator (lib/lessons/)',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 170,
    dependsOn: ['ITEM-001', 'ITEM-009'],
    goal:
      'The single validator for a lesson document: the Alliengll theory-block ' +
      'set with inline markup, plus practice blocks through `parseItem`.',
    acceptance: [
      'Theory block set covers at least heading, prose, example, callout, list, image and video. Its exact field shapes are recorded in a new decision file.',
      'Inline markup is limited to emphasis and English-span, and is represented structurally (not a Markdown string), so it cannot corrupt content. No Markdown parser dependency.',
      'No block type, and nothing imported by `lib/lessons/`, pulls KaTeX. This is verified by a test that inspects the module graph or by a printed `rg` over the import chain.',
      'Practice blocks are accepted only if `parseItem` accepts them. Every 0008-0017 invariant, including explanation coverage, surfaces as a lesson-level error that names the block id and field.',
      'Block ids are required and unique within a document. A duplicate is a parse error.',
      'The video block accepts only a YouTube video id, not an arbitrary URL.',
      'Tests cover: a valid mixed lesson; each rejection above; a lesson with zero practice blocks (decide and record: valid theory-only lesson, or rejected).',
    ],
  },
  {
    key: 'CNT-004',
    title: 'Lesson importer',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 300,
    dependsOn: ['CNT-002', 'CNT-003'],
    goal: 'Import an authored lesson file into a draft `lesson_versions` row, never publishing.',
    acceptance: [
      '`npx tsx scripts/import-lesson.ts <file>` validates with CNT-003 before any write. An invalid file writes nothing.',
      'Idempotent on `authored_key` for courses and lessons.',
      'Writes a new `source=\'import\'` version as a draft, and never publishes.',
      'Refuses to append over an editor save unless run with `--adopt`, and prints which lessons it skipped and why.',
      'Dry-run mode prints what would change without writing.',
    ],
  },
  {
    key: 'CNT-005',
    title: 'PDF -> lesson-document drafting step',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 310,
    dependsOn: ['CNT-003', 'CNT-007', 'CNT-008'],
    goal:
      'Draft a lesson document from a real partner PDF via an LLM pass, in ' +
      'exactly the CNT-003-validated shape (0018 Decision 3).',
    acceptance: [
      'Drafts the whole course from the PDF: one lesson per section, with C and D merged (0022 Decision 1). Level and each lesson\'s estimated minutes are taken from the PDF.',
      'Part 2\'s answers and "why" columns become per-sub-part explanations. Items with no source explanation are listed; their drafted explanations are marked as drafts.',
      'Converted paper tasks (0022 Decision 6: D, F6, F10, and any others) are marked for partner review, each with a one-line note of what changed.',
      'Open-writing tasks become `self_check` blocks with the PDF\'s model answers and checklists.',
      'Paper-only instructions are rewritten for the screen.',
      'Emits a partner QA report alongside the drafts. It lists: ambiguous items (at least F1 #4, where "came true" is defensible); internal inconsistencies (satellites "fifty" versus "sixty" years; earbuds "fifteen years" versus "since 2015"); pages missing from the file (2, 5, 24, 26-27, 38).',
      'New npm dependency (a PDF parser) is still stop-and-ask. Passing the PDF to the model directly is the alternative to weigh first.',
      'The drafting prompt and model call live under `scripts/`, and nothing reads the PDF at runtime.',
    ],
    notes: 'PDF: `authored/Future Imperfect B1+ Present Perfect vs Past Simple.pdf`.',
  },
  {
    key: 'CNT-006',
    title: 'End-to-end: the finished course through the pipeline',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 320,
    dependsOn: ['CNT-004', 'CNT-005', 'AUTH-005'],
    goal: 'The M1 bar, demonstrated: the partner can publish a lesson without Gleb.',
    acceptance: [
      'The partner\'s finished course goes PDF -> draft -> import -> corrected in the editor -> previewed -> published, with the partner (not Gleb) doing the editing and publishing.',
      'Every lesson of that course parses and plays in preview. Printed counts of lessons and blocks are copied from output.',
      'Friction the partner hit is filed as new cards, not fixed inside this one.',
    ],
    notes: 'The "finished course" is "Future Imperfect" (B1).',
  },

  {
    key: 'CNT-007',
    title: 'Extend the lesson block set: self_check, table, two highlight marks',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 190,
    dependsOn: ['CNT-003'],
    goal:
      'Implements 0022 Decisions 2-4 in `lib/lessons/`. Records the exact ' +
      'field shapes as a "Field shapes" section appended to ' +
      'docs/decisions/0022.',
    acceptance: [
      '`self_check` is a theory-side block with a prompt, `response: \'none\' | \'short\' | \'long\'`, a required model answer, and an optional checklist of strings. It never passes through `parseItem`. A test proves it contributes nothing to the lesson aggregate (0016), and nothing to a practice-block count helper that the publish path uses for `published_item_count`.',
      '`table` has a header row, body rows and an optional caption. Every row has the same column count as the header, and a mismatch is a parse error naming the block id and row. Cells carry inline markup.',
      'Inline markup gains `mark_a` and `mark_b`. The rules for nesting them with emphasis and English-span are decided and recorded, and the tests cover them.',
      'Still KaTeX-free. The existing module-graph test covers the new files.',
      'Tests cover: a lesson using every new block and mark; each new rejection; an existing CNT-003 fixture, which still parses unchanged.',
    ],
  },
  {
    key: 'CNT-008',
    title: 'Catalog metadata: courses.level, lessons.estimated_minutes',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 200,
    dependsOn: ['CNT-002'],
    goal: 'Migration 042. Implements 0022 Decision 5.',
    acceptance: [
      '`courses.level` is `NOT NULL`, with a CHECK over A1, A2, B1, B2, C1 and C2.',
      '`lessons.estimated_minutes` is a nullable positive integer, with a CHECK that it is greater than 0.',
      'Both are readable wherever published course and lesson metadata is readable (0018 RLS), so no document read is needed.',
      'Neither is derived from content anywhere.',
      'Applies cleanly on a local Supabase replaying from 001, with output printed, before it is handed over unapplied. This card is metadata only, so no entitlement matrix is needed.',
    ],
  },

  // --------------------------------------------------------------- PLAY ---
  {
    key: 'PLAY-001',
    title: 'Lesson player: shell and theory blocks',
    milestone: 'M1',
    epic: 'PLAY',
    type: 'task',
    rank: 210,
    dependsOn: ['CNT-003', 'ITEM-008', 'ITEM-009', 'CNT-007'],
    goal:
      'The M1 player that M2 will wrap. It lives outside the Colloquiz shell ' +
      'from day one.',
    acceptance: [
      'Player components live outside `app/(main)/`, and import nothing from the Colloquiz shell, Recharts, KaTeX, or Framer Motion unless this card records why. A printed `rg` over the player\'s import graph is the evidence.',
      'Renders a lesson document block by block in authored order, parsing on read. An invalid document renders a visible author-facing error, not a crash.',
      'Every theory block renders. The English-span renders with `lang="en"`.',
      'The video block is a click-to-load facade using `youtube-nocookie.com`, so no third-party cookie is set before the learner opts in (the no-cookie-banner decision is load-bearing). The report-only CSP is extended for it.',
      'Uses tokens only: no new hex literals or palette classes. Mobile-first at 360px width.',
      'Holds a lesson-level result via `aggregateLessonScore` (0016) and explanations via `resolveExplanations` (0017). Nothing is persisted (attempt storage is M2).',
      '`self_check` renders the prompt and a response box sized to its `response` value, with the model answer hidden until the learner asks for it and the checklist ticks local and unscored. Nothing is persisted.',
      '`table` scrolls horizontally inside its own container at 360px. The page itself never scrolls horizontally.',
      '`mark_a` and `mark_b` are distinguishable without colour, and use tokens only.',
    ],
  },
  {
    key: 'PLAY-002',
    title: 'Player renderers: selection and selection_grid',
    milestone: 'M1',
    epic: 'PLAY',
    type: 'task',
    rank: 220,
    dependsOn: ['PLAY-001', 'ITEM-002', 'ITEM-003', 'ITEM-004'],
    goal:
      'Handoff\'s "item interaction design inside M1": whether the item works ' +
      'on a phone, not how it looks.',
    acceptance: [
      'Submits the response shape `selection`/`selection_grid` expect, and a malformed-response `ItemResponseError` is impossible to reach from the UI. A test drives the renderer to submission and scores the result.',
      'Presentation order comes from `lib/items/shuffle.ts`, and never affects scoring (0007).',
      'After submission, each sub-part shows correct or incorrect plus its resolved explanation.',
      'Usable on a 360px touch screen, with the interaction choices recorded in a decision file.',
      'No `ItemPlaygroundClient.tsx` code is reused. Its header marks it throwaway.',
    ],
  },
  {
    key: 'PLAY-003',
    title: 'Player renderers: ordering and matching',
    milestone: 'M1',
    epic: 'PLAY',
    type: 'task',
    rank: 230,
    dependsOn: ['PLAY-001', 'ITEM-002', 'ITEM-005', 'ITEM-006'],
    goal:
      'Handoff\'s "item interaction design inside M1": whether the item works ' +
      'on a phone, not how it looks.',
    acceptance: [
      'Submits the response shape `ordering`/`matching` expect, and a malformed-response `ItemResponseError` is impossible to reach from the UI. A test drives the renderer to submission and scores the result.',
      'Presentation order comes from `lib/items/shuffle.ts`, and never affects scoring (0007).',
      'After submission, each sub-part shows correct or incorrect plus its resolved explanation.',
      'Usable on a 360px touch screen, with the interaction choices recorded in a decision file. For drag items this covers target size, and what happens mid-drag on scroll.',
      'A drag-and-drop library is a new npm dependency: stop and ask before adding one. Native pointer events are the default assumption.',
      '`matching`: many-to-one is answerable (0013). If the renderer uses a consumable chip pool, 0013\'s revisit note is answered in the decision file.',
      'No `ItemPlaygroundClient.tsx` code is reused. Its header marks it throwaway.',
    ],
  },
  {
    key: 'PLAY-004',
    title: 'Player renderer: slots (typed and drag)',
    milestone: 'M1',
    epic: 'PLAY',
    type: 'task',
    rank: 240,
    dependsOn: ['PLAY-001', 'ITEM-007'],
    goal:
      'Handoff\'s "item interaction design inside M1": whether the item works ' +
      'on a phone, not how it looks.',
    acceptance: [
      'Submits the response shape `slots` expects, and a malformed-response `ItemResponseError` is impossible to reach from the UI. A test drives the renderer to submission and scores the result.',
      'Presentation order comes from `lib/items/shuffle.ts`, and never affects scoring (0007).',
      'After submission, each sub-part shows correct or incorrect plus its resolved explanation.',
      'Usable on a 360px touch screen, with the interaction choices recorded in a decision file. For the drag input this covers target size, and what happens mid-drag on scroll.',
      'A drag-and-drop library is a new npm dependency: stop and ask before adding one. Native pointer events are the default assumption.',
      'Typed and drag inputs score identically for the same answer (handoff), and normalisation is `lib/items/slots.ts`\'s, never re-implemented in the UI.',
      'No `ItemPlaygroundClient.tsx` code is reused. Its header marks it throwaway.',
    ],
  },

  // --------------------------------------------------------------- AUTH ---
  {
    key: 'AUTH-001',
    title: 'Authoring: courses and lesson list',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 250,
    dependsOn: ['CNT-002', 'CNT-008'],
    goal: 'The minimum screen set to manage courses and their lesson lists.',
    acceptance: [
      'An editor can create a course (slug, title, description), and publish and unpublish it.',
      'The lesson list supports create, rename, edit description, reorder, and archive. No hard delete, because purchasers keep access to what they bought.',
      'The free-sample toggle is its own explicit control, calling `set_lesson_free_sample`.',
      'Course editor delegation works through the existing grant/revoke RPCs.',
      'English-only chrome, composed from existing admin components and classes.',
      "Course level can be edited (required) and each lesson's estimated minutes can be edited.",
    ],
  },
  {
    key: 'AUTH-002',
    title: 'Lesson editor: block list and theory-block forms',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 260,
    dependsOn: ['AUTH-001', 'CNT-003', 'CNT-007'],
    goal: 'The theory half of the block editor.',
    acceptance: [
      'Add, edit, delete and reorder blocks. Every theory block type has a form, and no raw JSON is ever shown to the author.',
      'Inline emphasis and English-span can be applied without typing markup. A rich-text editor library is a new npm dependency: stop and ask. A minimal in-house control over the structural markup is the default assumption.',
      'Save runs the CNT-003 validator in the server route before the RPC. Errors render next to the field they name.',
      'A stale-token save shows "changed elsewhere, reload" and never silently overwrites.',
      'Version history is listed, and any version can be restored as a new draft.',
      "Forms exist for `self_check` and `table`. `mark_a` and `mark_b` are applied the same way as emphasis, without typing markup.",
    ],
  },
  {
    key: 'AUTH-003',
    title: 'Lesson editor: practice-block forms for the five item types',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 270,
    dependsOn: ['AUTH-002'],
    goal: 'The practice half of the block editor.',
    acceptance: [
      'A form for each of `selection`, `selection_grid`, `ordering`, `matching` and `slots`, including `slots`\' `input: \'typed\' | \'drag\'`.',
      'Per-sub-part explanation fields plus the item-level fallback. The form makes the cost visible: for example, "10 rows: add 10 explanations, or 1 fallback" (0017 Decision 5).',
      'Every 0008-0017 parse rejection is reachable from the form and shown in place. There is one test per item type that submits an invalid form and asserts the rendered error.',
    ],
  },
  {
    key: 'AUTH-004',
    title: 'Image upload for theory and matching blocks',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 280,
    dependsOn: ['CNT-002', 'AUTH-002'],
    goal: 'Image upload into the CNT-002 bucket, mirroring the avatar-upload precedent.',
    acceptance: [
      'Upload into the CNT-002 bucket from the image theory block and from image matching.',
      'Limits are stated before the picker opens, and enforced client-side and on the bucket.',
      'Objects are stored as `<course_id>/<uuid>.<ext>` (no URL reuse, no cache-busting). Replacing an image deletes the old object only after the new one is saved.',
      'Alt text is required on every image.',
    ],
  },
  {
    key: 'AUTH-005',
    title: 'Preview and publish',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 290,
    dependsOn: ['AUTH-002', 'PLAY-001'],
    goal:
      'Preview through the real player, and a publish action that cannot ' +
      'diverge from what was previewed.',
    acceptance: [
      'Preview renders the current draft version through the real player (PLAY-001..004), not a separate preview renderer and not sessionStorage.',
      'Publish publishes exactly the version previewed. If a newer draft was saved since preview opened, publish refuses.',
      'After publishing, the learner-visible version is unchanged by further draft edits until the next publish. This is demonstrated on a seeded lesson.',
      'The editor shows whether a lesson has unpublished changes.',
    ],
    notes:
      'Full acceptance coverage of the "real player" requirement depends on ' +
      'PLAY-002..004 as well as PLAY-001; those may still be in progress when ' +
      'this card starts, in which case preview covers whichever renderers ' +
      'exist and the gap is named, not hidden.',
  },
];

export function rankOf(key) {
  const card = CARDS.find((c) => c.key === key);
  if (!card) throw new Error(`Unknown card key: ${key}`);
  return card.rank;
}

export function cardsInMilestone(milestoneKey) {
  return CARDS.filter((c) => c.milestone === milestoneKey).sort((a, b) => a.rank - b.rank);
}
