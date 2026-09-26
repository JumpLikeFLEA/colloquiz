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
  { key: 'INFRA', title: 'Infrastructure', desc: 'Storage, egress and hosting plan — outside the milestones.' },
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
      'Every drafted lesson document passes the lesson validator (CNT-003 + CNT-007 extensions), or the run reports exactly which blocks failed. Drafts are written to authored/; this card writes nothing to the database (import is CNT-004).',
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
    dependsOn: ['CNT-004', 'CNT-005', 'AUTH-005', 'AUTH-007'],
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
  {
    key: 'PLAY-005',
    title: 'RTL smoke tests for the PLAY-002..004 renderers',
    milestone: 'M1',
    epic: 'PLAY',
    type: 'task',
    rank: 1010,
    dependsOn: ['PLAY-002', 'PLAY-003', 'PLAY-004'],
    goal:
      'Low-priority, blocks nothing. AUTH-003 (2026-09-23) added React Testing ' +
      'Library + jsdom to this repo for the first time — the "revisit when" a ' +
      'component-rendering setup exists, named by docs/decisions/0024 Decision ' +
      '4 and 0029 Decision 3. Until now every PLAY-002..004 renderer was ' +
      'verified only through pure lib/items/*.test.ts helpers plus manual ' +
      'browser checks; the hydration mismatch and client-boundary bugs fixed ' +
      'during PLAY-001..004 (see the DndContext/SortableContext id fixes in ' +
      'recent commits) slipped through exactly that gap. A cheap smoke layer ' +
      'now that the tooling exists, not a full interaction-test rewrite.',
    acceptance: [
      'One RTL test per practice renderer (selection, selection_grid, ordering, matching, slots) that mounts it inside `LessonPlayer` with a real fixture (reuse `lib/items/__fixtures__/playgroundExamples.ts`, same precedent AUTH-003\'s tests set) and asserts it renders without throwing.',
      'At least one interaction per renderer reaches `onScore`/`scoreItem` — e.g. selecting an option, submitting an order — proving the renderer is wired to real scoring, not just that it paints.',
      'Uses the `editor` vitest project (docs/decisions/0036) or a renamed equivalent; no new test-runner config beyond what AUTH-003 already added.',
      'Does not replace the existing pure `lib/items/*.test.ts` coverage or the 360px Playwright-viewport checks recorded in 0029 Decision 3/4 — this is additive, a rendering smoke layer only.',
    ],
    notes: 'priority:low. Proposed 2026-09-23 during AUTH-003/004/005 review, not blocking any open card.',
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
      'Creating a lesson generates its slug from the title at creation time; the slug is immutable afterward (docs/decisions/0023 — the importer matches re-imports on it).',
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
  {
    key: 'AUTH-006',
    title: 'Sweep orphaned lesson-image uploads',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 1020,
    dependsOn: ['AUTH-004'],
    goal:
      'Low-priority, blocks nothing. AUTH-004/docs/decisions/0037 deliberately ' +
      'defers deleting a replaced lesson image until the SAVE that replaces it ' +
      'succeeds, so an image uploaded during an edit that is never saved (tab ' +
      'closed, navigated away, CNT-003 rejected the block) becomes an orphan ' +
      'object in the `lesson-images` bucket — nothing ever references it and ' +
      'nothing ever deletes it. Accepted as a stray-file cost at the time, not ' +
      'a correctness bug, but unbounded over time without a sweep.',
    acceptance: [
      'A script (or scheduled job) lists every object in the `lesson-images` bucket and every image URL actually referenced by any `lesson_versions.document` (theory image blocks and matching image content), and reports objects in the bucket that are referenced by none.',
      'Deletion is a separate, explicit step from the report — the first run is read-only, printed output only, so the report can be sanity-checked against real data before anything is deleted.',
      'Run manually first against seeded/real data with output printed; only scheduled once that output looks correct.',
    ],
    notes: 'priority:low. Proposed 2026-09-23 during AUTH-004 review, not blocking any open card.',
  },
  {
    key: 'AUTH-007',
    title: 'Open course authoring to delegated editors',
    milestone: 'M1',
    epic: 'AUTH',
    type: 'task',
    rank: 315,
    dependsOn: ['AUTH-005'],
    goal:
      'A course_editors delegate (non-admin) can open, edit, preview and ' +
      'publish the lessons of the courses they were granted, from the app — ' +
      'the precondition for CNT-006\'s "the partner (not Gleb) doing the ' +
      'editing and publishing".',
    acceptance: [
      '/app/admin/courses, /app/admin/courses/[id], .../lessons/[lessonId] and .../lessons/[lessonId]/preview admit an admin or a can_edit_course editor of that course; anyone else gets the existing Forbidden screen.',
      'Page-level access is decided by the SQL function can_edit_course (rpc), not re-implemented in TypeScript.',
      'A non-admin editor\'s course list shows only courses they hold a course_editors row for — verified while at least one published course they do NOT edit exists.',
      'A non-admin editor sees no "New course" button and no Editors (grant/revoke) section; everything else on the course page, including the free-sample toggle, archive and publish/unpublish, stays available.',
      'The sidebar shows a "Course editing" section with a Courses link to non-admin editors; admins keep Courses under Admin. Recorded in docs/ui-decisions.md.',
      'No migration, no RPC change, no new npm dependency.',
      'Decision recorded as docs/decisions/0041-*.md, reopening 0025 Decision 1.',
    ],
    notes:
      'Plan settled in chat on 2026-09-24 — see the AUTH-007 work prompt. ' +
      '044 is applied; 2 course_editors rows exist (added after 040).',
  },

  // ---------------------------------------------------------- M1, misc ---
  {
    key: 'SHELL-013',
    title: '`/` → `/app` redirect becomes temporary (307)',
    milestone: 'M1',
    epic: 'SHELL',
    type: 'task',
    rank: 145,
    dependsOn: [],
    goal:
      'next.config.ts redirects() currently sends `/` to `/app` with ' +
      '`permanent: true` (a 308) — SHELL-001\'s Colloquiz-under-/app move. M2 ' +
      'needs `/` to eventually serve the English landing; a 308 is cached by ' +
      'browsers and some in-app browsers well past the point the redirect ' +
      'entry is removed, so it has to stop being permanent before any M2 card ' +
      'starts building toward a public `/`. Found during the M2 scoping audit, ' +
      '2026-09-24 — not something any draft M2 card was pointed at.',
    acceptance: [
      'The `/` entry in next.config.ts redirects() has `permanent: false`, and only that entry — every other entry in movedSegments keeps permanent: true.',
      '`curl -I /` against a local `next start` shows `307`, not `308`.',
    ],
    notes:
      'SHELL-010 owns removing this redirect entirely once the English ' +
      'landing is real content, not a stub — see SHELL-010\'s acceptance.',
  },
  {
    key: 'OPS-011',
    title: 'Board tooling accepts a milestone-less card (INFRA)',
    milestone: 'M1',
    epic: 'OPS',
    type: 'task',
    rank: 146,
    dependsOn: [],
    goal:
      'INFRA cards sit outside the M0-M4 milestones by design (see INFRA-001 ' +
      'etc.), but bootstrap-board.mjs, board-status.mjs and next-card.mjs were ' +
      'all written assuming every card.milestone resolves to one of M0-M4. ' +
      'board-status.mjs crashes outright the moment a milestone-less card ' +
      'exists in CARDS; bootstrap-board.mjs would pass a literal "undefined" ' +
      'milestone title to gh. Both found during the M2 scoping audit, ' +
      '2026-09-24. Fix before Phase 4 bootstraps INFRA-001.',
    acceptance: [
      'bootstrap-board.mjs omits `--milestone` entirely (in both the issue-create and issue-edit gh calls) when card.milestone is falsy, instead of passing the literal string "undefined".',
      'board-status.mjs renders a milestone-less card\'s MILESTONE column as `—` instead of throwing. Reproduce the crash first against a synthetic milestone-less card (`card.milestone.length` at the column-width calculation throws `Cannot read properties of undefined`), then show it fixed.',
      'A unit test against next-card.mjs\'s exported decide() proves a milestone-less synthetic record is never returned as a pick, for any set of other records — this confirms the existing M0-M4-only matching in activeMilestoneKey already excludes it by construction, so the test is a proof, not new picking logic.',
      '`node scripts/board/bootstrap-board.mjs --dry-run` against the real INFRA-001 card (once it exists in CARDS) prints a WOULD CREATE line with no milestone, and board-status.mjs lists it without crashing.',
    ],
  },
  {
    key: 'CNT-010',
    title: 'Transliterate lesson slugs; editable until first publish',
    milestone: 'M1',
    epic: 'CNT',
    type: 'task',
    rank: 147,
    dependsOn: [],
    goal:
      'create_lesson\'s slug step (migration 044 line 229) and its client ' +
      'mirror lib/lessonSlug.ts are both ASCII-only ([^a-zA-Z0-9]+ / ' +
      '[^a-z0-9]+), so a Cyrillic-only title — the norm for this audience, ' +
      'not the exception (docs/handoff.md) — collapses to the empty-title ' +
      'fallback "lesson", deduped only by creation order into ' +
      'lesson/lesson-2/lesson-3/…: the same "URL encodes position, not ' +
      'content" failure docs/handoff.md names for ordinal-derived free ' +
      'samples, reached through slug-collision suffixing instead. Separately, ' +
      'EditLessonDialog lets a title be renamed freely with the slug ' +
      'immutable underneath (0023) and never shown, so a placeholder working ' +
      'title\'s slug can silently outlive the real title. Found during ' +
      'SHELL-005 (docs/decisions/0044 addendum, 2026-09-26); this card is the ' +
      'proposed fix, not done inline there.',
    acceptance: [
      'Slug generation (Cyrillic -> Latin transliteration table) lives in lib/ only, no new npm dependency. The RPC no longer slugifies a title itself — it validates the lib-generated slug against ^[a-z0-9]+(-[a-z0-9]+)*$ and does the within-course collision suffixing; it never derives a slug from p_title.',
      'Test: the two titles from the 0044 finding ("Прошедшее время: вопросы" and "Прошедшее время 2: вопросы") produce meaningful, distinct, non-fallback slugs — printed in the test output, not just asserted non-equal.',
      'The slug stays editable (subject to the existing per-course uniqueness check) until the lesson has EVER been published, and is enforced frozen in the RPC after — not only in the UI. Unpublishing or archiving a previously-published lesson does not unfreeze it.',
      'EditLessonDialog shows the lesson\'s current slug: editable while unfrozen, read-only once frozen, so a rename\'s (mis)match with the URL is visible either way.',
      'courses.slug checked for the same ASCII-stripping problem. (Preliminary read: create_course takes p_slug as author-supplied text — see CoursesListView.tsx\'s manual "slug-like-this" field — with no slugify step, so it looks unaffected; this card confirms that and fixes it too if the check finds otherwise, and says which either way.)',
      'A migration (written, not applied) does a one-time re-slug of every existing lesson through the new transliteration step — safe because no lesson is publicly shared yet (SHELL-005) — and prints each row\'s slug before and after.',
    ],
  },

  // ------------------------------------------------------ M2 (Alliengll) ---
  {
    key: 'OPS-006',
    title: 'Route budget guard: cold-load JS bytes',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2000,
    dependsOn: [],
    goal:
      'Next 16 removed the `First Load JS`/`size` columns from `next build` ' +
      'output ("we found these to be inaccurate in server-driven ' +
      'architectures using React Server Components... both our Turbopack and ' +
      'Webpack implementations had issues" — Next 16 upgrade guide, ' +
      'node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md). ' +
      'Every M2 English-route budget in docs/handoff.md\'s Performance ' +
      'boundary depends on a printed number; this card builds the ' +
      'replacement measurement before any card needs to cite it, and ' +
      'baselines the smallest route that exists today, since no route ' +
      'currently prints any size at all to compare against.',
    acceptance: [
      'Playwright is added as a new devDependency — approved 2026-09-24 (owner) specifically for this card; record the decision in docs/decisions/ when this card is actually worked.',
      '`npm run budget` starts the production server (`next start`) and, per a configured list of routes, loads each with headless Chromium in a fresh, cache-disabled browser context, sums the compressed byte size of every script resource actually downloaded, and prints `route | KB | budget`.',
      'A route whose navigation fails (non-2xx response, timeout, a page error) is a hard failure for that route, not a 0 KB pass — demonstrated by pointing the guard at a route that 500s and showing it exits non-zero, not silently green.',
      'Exits non-zero when any route exceeds its configured budget. Kept out of `npm run check` (a full server boot is slow); added to CLAUDE.md\'s command list as its own `npm run budget`.',
      'Accepts a base-URL override (env var or CLI arg) so OPS-010\'s launch rehearsal can point it at the deployed production URL instead of local `next start`, without a second tool.',
      'Baselines `/login` — the smallest route that exists today per the phase-1 audit (no route currently prints any size). Its cold-load KB is printed and recorded as the floor any English route budget starts from.',
      'Forbidden-package check is separate from the byte-budget run: an ESLint `no-restricted-imports` rule, added via `overrides` scoped to `app/(english)/**` and `app/components/lesson-player/**`, denying imports of recharts, katex, framer-motion, @supabase/ssr. Runs inside `npm run check`, shown failing on a planted import and passing without it.',
      'Demonstrated failing once on a deliberately lowered budget number for an existing route, then passing at the real budget. Both outputs printed.',
    ],
    notes:
      'docs/handoff.md\'s Performance boundary section already cites this ' +
      'card by name for the replacement wording (2026-09-24 delta).',
  },
  {
    key: 'SHELL-006',
    title: 'The English surface gets its own root layout (or doesn\'t)',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'decision',
    rank: 2010,
    dependsOn: ['OPS-006'],
    goal:
      'Route groups can define multiple root layouts, each with its own ' +
      '<html> (confirmed against the installed docs, not memory: ' +
      'node_modules/next/dist/docs/.../layout.md and .../route-groups.md). ' +
      'Decide whether the English surface takes one, and settle every ' +
      'consequence that decision has for app-root-singular files before ' +
      'SHELL-007 builds on top of it.',
    acceptance: [
      'Evidence: `npm run budget` output for a stub English route under (a) the shared root layout and (b) its own root layout. Both printed — not a next build table, which Next 16 no longer produces (see OPS-006).',
      'The case for (b): `<html lang="ru">`, no ThemeProvider or katex CSS unless the English surface wants them. The only known cost is a full page reload crossing root layouts, confirmed in route-groups.md — accepted per settled input 7 (Colloquiz reached only through a footer link).',
      'not-found: app/not-found.tsx and app/global-not-found.js are both app-root-singular files, not per-route-group. Decide between keeping app/not-found.tsx (shared, generic copy) or adopting global-not-found.js (experimental, needs `experimental.globalNotFound` in next.config.ts) — the case for it is exactly "multiple root layouts, so there\'s no single layout to compose a global 404 from" (Next docs, not-found.md). Record which, and why.',
      'global-error.tsx has no per-root-layout equivalent at all — it stays a single shared file regardless of which option wins, and "replaces the root layout... when active" (Next docs, error.md). State this as a known constraint, not something SHELL-007 discovers later.',
      'opengraph-image.tsx and the icon files (icon.tsx, apple-icon.tsx) ARE per-route-segment conventions (confirmed, opengraph-image.md) — each root group can carry its own; state this so SHELL-009 doesn\'t re-derive it.',
      'Which root layout (auth) and (legal) sit under is decided and stated explicitly — today both inherit the single shared app/layout.tsx.',
      'Sentry\'s client init (instrumentation-client.ts) is a genuinely global Next instrumentation hook, not something app/layout.tsx opts into — its cost is measured as part of the OPS-006 stub-route baseline, and whether/how (or whether at all) it can be scoped away from English routes is decided here, not assumed solved by giving English its own layout.',
      'Records the cold-load KB budget for each English route kind (landing, course page, lesson) as this card\'s output, per docs/handoff.md\'s Performance boundary.',
    ],
  },
  {
    key: 'OPS-012',
    title: 'Remove Sentry',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2025,
    dependsOn: [],
    goal:
      'docs/decisions/0046 (SHELL-006): Sentry has never been wired to a ' +
      'monitored destination anyone acts on, so its ongoing cost — bundle ' +
      'bytes on every route including every future English route, a CSP ' +
      'connect-src allowance, and the lib/sentryScrub.ts PII-scrubbing ' +
      'surface that has to be kept correct — is being paid for no realized ' +
      'benefit. Owner-approved dependency removal.',
    acceptance: [
      'instrumentation-client.ts, the server/edge Sentry init (sentry.server.config.ts, sentry.edge.config.ts), instrumentation.ts\'s register() call into them, and next.config.ts\'s Sentry wrapper are removed.',
      'Sentry calls in app/(main)/error.tsx and any other error boundary are removed; the boundaries keep their existing user-facing behavior otherwise.',
      'lib/sentryScrub.ts and lib/sentryScrub.test.ts are deleted — nothing else imports it (confirmed with rg before deleting).',
      'The CSP connect-src entry for Sentry ingest (next.config.ts headers()) is removed.',
      'The @sentry/nextjs dependency is removed from package.json; NEXT_PUBLIC_SENTRY_DSN and any other Sentry env var references are removed from .env.example and deployment config notes.',
      'docs/release/legal/subprocessors.md and privacy-policy.md are updated in the same commit to drop Sentry as a subprocessor/data recipient.',
      'Evidence: `npm run budget` on /login before and after the removal, printed, showing the byte delta. `rg -i sentry` finds nothing outside git history. `npm run check && npm test` green.',
    ],
  },
  {
    key: 'OPS-013',
    title: 'Guard against cross-route commons-chunk leaks into the English surface',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2041,
    dependsOn: ['SHELL-007'],
    goal:
      'OPS-012 (issue #118) found that a throwaway English-shaped stub route ' +
      'shipped ~5.17 KB of lucide-react\'s shared Icon base component despite ' +
      'importing nothing from lucide-react — confirmed by grepping the built ' +
      '.next/static/chunks/*.js, not inferred from size. Turbopack\'s own ' +
      'commons-chunk splitting shares popular-enough pieces of a dependency ' +
      'across the whole build regardless of per-route need, which is a leak ' +
      'OPS-006\'s no-restricted-imports ESLint rule cannot see — that rule only ' +
      'catches an explicit import statement in app/(english)/**, not a shared ' +
      'chunk assembled by the bundler. Ranked after SHELL-007 because the real ' +
      'chunk graph — and therefore what actually leaks — changes once the ' +
      'English route group is built for real instead of measured against a ' +
      'one-page stub.',
    acceptance: [
      'First check, before building anything: does app/components/lesson-player/** (or anything else a real English route renders) already import lucide-react? If yes, state that the base Icon component reaching English routes is then EXPECTED, not a leak, and narrow this card\'s remaining scope accordingly rather than treating it as still open.',
      'npm run budget is extended to also scan each configured route\'s actual shipped chunks for forbidden-package content signatures (recharts, katex, framer-motion, @supabase/ssr — the same list OPS-006\'s no-restricted-imports rule names) and fail the run on a hit, catching commons-chunk leakage that rule cannot see. Demonstrated failing once on a deliberately reintroduced signature, then passing without it — both outputs printed.',
      'The stub (or, once it exists, a real English route) is re-measured after SHELL-007 lands, and the run records whether unrelated Colloquiz-only commits still move the English floor — docs/decisions/0046\'s addendum (253.0 KB → 229.28 KB, drift unrelated to Sentry, issue #118) is the reference precedent for what "drift" looks like here.',
      'Findings and any config change (e.g. tuning Turbopack\'s chunk-splitting for app/(english)/**, or accepting a small leak as noise) are recorded in a decision file — a type:decision card is opened instead if the right fix is not obvious from this card\'s own findings.',
    ],
  },
  {
    key: 'SHELL-014',
    title: 'Colloquiz gets its own root layout',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2030,
    dependsOn: ['OPS-012'],
    goal:
      'docs/decisions/0046 (SHELL-006): the English surface gets its own ' +
      'root layout, which means no shared app/layout.tsx can remain — ' +
      'Colloquiz moves into its own root group ' +
      '(e.g. app/(colloquiz)/layout.tsx wrapping (main), (auth), (legal)) ' +
      'with zero behavior change. URLs are unchanged; this is a pure move.',
    acceptance: [
      'app/layout.tsx\'s content (ThemeProvider, Geist Sans + Geist Mono, Analytics, SpeedInsights, katex CSS, metadata) moves to a new Colloquiz root layout wrapping (main), (auth) and (legal). No top-level app/layout.tsx remains (per Next docs, layout.md: a top-level root layout is optional once multiple root layouts exist via route groups).',
      'app/not-found.tsx becomes the Colloquiz root\'s not-found.tsx (or is moved accordingly per SHELL-006\'s not-found decision); app/global-error.tsx stays a single shared file per docs/decisions/0046.',
      'app/icon.tsx, apple-icon.tsx and opengraph-image.tsx are confirmed still correct at their current location (per-route-segment, not tied to a root layout — docs/decisions/0046) or moved if the audit says otherwise.',
      'Evidence: /login and /app budget within noise of their pre-move numbers (npm run budget, before and after, both printed). Manual smoke of /app, /login, /privacy and a duel page. Theme toggle still works.',
    ],
  },
  {
    key: 'SHELL-005',
    title: 'English URL scheme and the public-path rule',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'decision',
    rank: 2020,
    dependsOn: [],
    goal:
      'Telegram posts link directly to a course or a lesson (settled input ' +
      '2), so the URL shape has to be decided before any public route exists ' +
      'to link to.',
    acceptance: [
      'Choice recorded between /c/[course]/[lesson] and /courses/[course]/[lesson], and whether a lesson slug is unique per course — lessons.slug is already unique PER COURSE, not globally (migration 043), so a cross-course-unique scheme would need a second key.',
      'proxy.ts\'s exact-match publicRoutes (today: /terms, /privacy, /subprocessors, /robots.txt — proxy.ts:47) is replaced by a prefix rule admitting the chosen English path shape, unauthenticated.',
      'Decides whether an anonymous English request skips the Supabase session refresh in proxy.ts (server latency only — no client JS either way, since the session refresh already happens server-side before any response).',
      'URLs are stated to never change when a lesson is reordered — lessons.ordinal carries no uniqueness constraint and is explicitly display-order-only (migration 041 comment), so the chosen scheme must key off something that doesn\'t move, i.e. slug.',
    ],
  },
  {
    key: 'ANON-001',
    title: 'Attempt storage and the anonymous→account migration',
    milestone: 'M2',
    epic: 'ANON',
    type: 'decision',
    rank: 2030,
    dependsOn: [],
    goal:
      'Progress lives in the in-app browser\'s localStorage (Instagram or ' +
      'Telegram). The email-confirmation link usually opens in the system ' +
      'browser, whose storage is empty — "migrate after registration" can ' +
      'find nothing there. Redesigned 2026-09-24 (owner) for confirmations ' +
      'ON at launch: the hosted project has them OFF today only temporarily.',
    acceptance: [
      'Compares exactly two options — (b) a claim token carried in emailRedirectTo, vs (c) Supabase anonymous users created lazily at lesson end, kept off the critical path. Option (a) ("upload local attempts when the signup form is submitted") is dropped: with confirmations ON there is no live, confirmed session at the moment the form submits, so nothing proves the anonymous attempts belong to the not-yet-real account.',
      'Settles the attempt record shape, keyed (lesson_version_id, block_id) per 0018.',
      'Settles that client-computed scores are accepted (0018: answer keys ship to the client; there is no English leaderboard), with the server capping earned at possible.',
      'Settles how "best score" behaves across republished versions.',
    ],
    notes:
      'Hosted project\'s "Confirm email" is OFF today and will be ON at ' +
      'launch (owner, 2026-09-24) — design for ON. ANON-004\'s cross-browser ' +
      'test and OPS-010\'s launch rehearsal both depend on this being real.',
  },
  {
    key: 'SHELL-007',
    title: 'English route group, layout and Russian strings module',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2040,
    dependsOn: ['SHELL-005', 'SHELL-006', 'SHELL-014'],
    goal:
      'The route group SHELL-005/SHELL-006 decided, built for real, with no ' +
      'Colloquiz weight riding along.',
    acceptance: [
      'app/(english)/ exists with its own root layout per docs/decisions/0046: <html lang="ru">, Geist Sans, globals.css, <SpeedInsights/>. No ThemeProvider, Geist Mono, <Analytics/> or katex CSS. Dark mode via a small inline script reading prefers-color-scheme, no toggle.',
      'experimental.globalNotFound is enabled and app/global-not-found.tsx is Russian-first with a link to `/`, per docs/decisions/0046. Each root layout also has its own in-segment not-found.tsx for notFound() calls.',
      'proxy.ts lets its paths through anonymously per SHELL-005\'s prefix rule.',
      'All learner-facing chrome strings live in one module (e.g. lib/alliengll/copy.ts), in Russian — landing, catalogue, course page, player buttons, completion screen, signup offer (docs/handoff.md, Audience and language, 2026-09-24 delta). Nothing selects a locale.',
      'A route under it renders with no Supabase session and no @supabase/ssr in its client chunks — verified in the actual build output, not asserted.',
      'Cold-load KB budget printed via `npm run budget` (OPS-006), including <SpeedInsights/>\'s bytes — re-measured for real, not copied from SHELL-006\'s stub figure.',
    ],
  },
  {
    key: 'CNT-009',
    title: 'Catalogue fields: course cover and short summary',
    milestone: 'M2',
    epic: 'CNT',
    type: 'task',
    rank: 2050,
    dependsOn: [],
    goal:
      'The catalogue is course cards — cover, title, short summary (owner, ' +
      '2026-09-24) — and neither field exists on `courses` today (confirmed ' +
      'against migrations 041-045: only author_id, level and slug were ' +
      'added/kept; description stays the long-form text on the course page).',
    acceptance: [
      'A migration (written, not applied) adds a cover-image reference and a short summary to courses.',
      'Decided inside the card and recorded in a decision file: the column names; whether a published course requires a cover (NOT NULL at publish, like level in 042) or falls back to a placeholder; which bucket covers live in (reuse lesson-images or a new one).',
      'Anonymous read of the new columns is verified on a seeded published course, and a draft course\'s fields stay invisible to anon — checked against seeded rows in both states, not an empty table.',
    ],
  },
  {
    key: 'AUTH-008',
    title: 'Authoring: edit summary, description and cover',
    milestone: 'M2',
    epic: 'AUTH',
    type: 'task',
    rank: 2060,
    dependsOn: ['CNT-009', 'AUTH-004'],
    goal:
      'The partner can set a course\'s summary, long description and cover ' +
      'from the authoring UI, and replace the cover. Today\'s CourseDetailView ' +
      'edits only title, description and level (confirmed by reading the ' +
      'component) — summary and cover are net-new fields with no editor.',
    acceptance: [
      'The partner can set a course\'s summary, long description and cover from the authoring UI, and replace the cover.',
      'Upload reuses the AUTH-004 path, limits and deferred-deletion rule (0037).',
      'The editor shows the catalogue card as it will render.',
    ],
    notes:
      'Renamed from a draft "AUTH-007" — AUTH-007 was already taken by the ' +
      '2026-09-24 "Open course authoring to delegated editors" card (closed) ' +
      'before this card was drafted. Renaming avoids bootstrap-board.mjs\'s ' +
      'title-prefix matching silently overwriting that closed issue.',
  },
  {
    key: 'PLAY-008',
    title: 'Per-sub-part explanations: result + "Why?" in place, numbered sub-parts',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2061,
    dependsOn: [],
    goal:
      'After submitting, the learner reads each explanation next to the sub-part it explains, instead of ' +
      'matching a list of red text below the exercise back to a statement (partner review note 3).',
    acceptance: [
      'The block-level explanation list in LessonPlayer.tsx (lines 107-111, text-destructive-text) is removed; explanations reach renderers through the practiceRenderer slot, keyed by subResultId (0009, 0017).',
      'After submission each sub-part shows its result and, when it has an explanation, a "Why?" control that expands the explanation directly beneath that sub-part and collapses it again. Collapsed by default.',
      'STOP AND ASK before implementing: resolveExplanations (lib/items/explanations.ts:117-120) returns explanations for WRONG sub-parts only. Authored explanations like "Real. Edison did believe this…" are useful on a correct answer too. Showing "Why?" on correct sub-parts changes that lib contract and revisits 0017 — present the change and its test impact, Gleb decides.',
      'Applies to every renderer with sub-parts: selection_grid rows, matching rows, ordering elements, slots gaps, and selection options where 0029 Decision 2 marks per-option.',
      'Explanation text uses a neutral existing token, not destructive-*. The incorrect state stays signalled by the existing row tint and ✗/✓ marker, never by colour alone.',
      'selection_grid rows and matching rows are visibly numbered 1, 2, 3 … in display order. Evidence this matters: the self_check after a-predictions (future-imperfect.json:111) asks about "items 1, 4 and 7", which today point at nothing. selection_grid rows are not shuffled (SelectionGridRenderer.tsx:15), so display order = authored order = the numbers the content uses; confirm the same for matching rows before numbering them.',
      'The disclosure is a real <button> with aria-expanded and a 44px target (0029 Decision 4 precedent).',
      'Recorded in docs/ui-decisions.md in the same commit; a decision file covers how explanations enter the renderer contract.',
      'State how PLAY-007\'s end-of-lesson explanation review will read explanations after this change.',
    ],
    notes: 'PLAY-002/003/004 acceptance already asked for "each sub-part shows correct or incorrect plus its resolved explanation"; the block-level list under-delivered on that.',
  },
  {
    key: 'PLAY-009',
    title: 'Ordering: numbered positions, grip handle as the only pointer control',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2062,
    dependsOn: [],
    goal: 'One way to reorder instead of three (grip, ▲, ▼), with visible positions (partner review note 2).',
    acceptance: [
      'Each row shows its current position number (1, 2, 3 …), updating as rows move. Numbers are positions, not authored ids — ordering display is shuffled (lib/items/ordering.ts, 0007).',
      'The ▲/▼ move buttons are removed; the existing grip handle stays as the drag affordance.',
      'Keyboard reordering still works through the existing KeyboardSensor + sortableKeyboardCoordinates (useLessonPlayerSensors.ts): focus the handle, pick up, move, drop, with a visible focus state. Verified by an RTL test driving the keyboard path, not by inspection.',
      'Touch: the 200ms press-and-hold activation (TouchSensor delay) is now the only touch path — a short visible hint tells the learner to hold and drag.',
      'Decision file supersedes 0030 Decision 1 and the part of 0032 that keeps the move buttons as the fallback; both get a "Superseded in part by" note.',
      'Recorded in docs/ui-decisions.md.',
    ],
  },
  {
    key: 'PLAY-010',
    title: 'Matching layout for long answers and parallel columns',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'decision',
    rank: 2063,
    dependsOn: [],
    goal:
      'Decide how matching shows long right-side content and whether rows and bank sit side by side ' +
      '(partner review notes 1 and 4), knowing what 0039 was protecting.',
    acceptance: [
      'Starting fact (confirmed from the partner\'s screenshot): the answer slot is min-h-11 w-28 (MatchingRenderer.tsx:228). A long placed answer ("Pair 4", future-imperfect.json:944) wraps to one or two words per line and grows the row vertically — so 0039 Decision 1\'s "row height never moves" already fails for long content. Say so in the decision; don\'t defend a guarantee that doesn\'t hold.',
      'Evidence: the longest right-side text across the 10 matching items in future-imperfect.json, printed; which items are "long-answer" (Pair 2-4, converted from written tasks) and which are short (expression ↔ meaning).',
      'Width constraint: LessonPlayer caps the whole player at max-w-xl (LessonPlayer.tsx:93). Two columns inside ~576px, and whether that cap should change for practice blocks, is part of this decision — not something to discover during implementation.',
      'Options laid out with trade-offs, at least: (a) the placed answer moves under the left content at full row width; (b) two columns — rows left, bank right — from a breakpoint up, current stacked layout below it (vs 0039 Decision 5); (c) layout chosen per item by content length; (d) a combination.',
      'State the tension between the two notes: parallel columns narrow long answers further, so note 4\'s fix can make note 1 worse.',
      'Gleb makes the call; the chosen option becomes a task card.',
    ],
  },
  {
    key: 'PLAY-011',
    title: 'Categorisation presentation for many-to-one matching',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'decision',
    rank: 2064,
    dependsOn: ['PLAY-010'],
    goal:
      '"Sort into categories" items should look like sorting into visible groups, not like another ' +
      '"Tap to match" (partner review note 5; example g1-sort in future-imperfect.json: 4 predictions → 3 categories).',
    acceptance: [
      'Evidence: count the matching items in the course file that are categorisations (few right elements, many-to-one); printed, not estimated.',
      'Options laid out, at least: (i) the renderer infers a bucket layout from the payload shape; (ii) an explicit authored presentation hint on the matching payload (parse change in lib/items/matching.ts; validator, importer and PracticeItemForm must carry it; scoring unchanged); (iii) a new item type (a new item type is a stop-and-ask per CLAUDE.md).',
      'For the bucket layout: category areas always visible; a statement placed into an area appears inside it; tap-to-place alternative to drag; how 0039 Decision 2\'s reusable-bank reasoning maps when categories are the targets.',
      'Gleb makes the call; the chosen option becomes a task card.',
    ],
  },
  {
    key: 'PLAY-011a',
    title: 'Matching presentation field, contract only',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2065,
    dependsOn: ['PLAY-011'],
    goal:
      'docs/decisions/0060: an optional presentation: "pairs" | "sort" hint on matching\'s payload, ' +
      'defaulting to "pairs", scoring untouched — the schema/pipeline half of the categorisation decision.',
    acceptance: [
      'MatchingPayloadSchema accepts an optional presentation: "pairs" | "sort" that defaults to "pairs". Tests: omitted -> "pairs", valid values parse, an invalid value is rejected, and "sort" with fewer than 2 right elements is rejected.',
      'score() output is byte-identical for the same pairs under either presentation (test).',
      'The field is carried through the validator, import-lesson.ts and PracticeItemForm. It round-trips through import -> stored JSON -> editor -> save (show the evidence).',
      'The import/validate warning (a matching item with some right element reused by 2+ pairs and no presentation field) fires on f5-sort/g1-sort without the field, and stays silent once presentation is set to either value — an explicit "pairs" is how an author silences it on a legitimate many-to-one item (0013). Show a run where a reused-right item with "pairs" set emits no warning, and a run where it stays silent on all 8 ordinary matching items in future-imperfect.json (non-empty run printed).',
      'f5-sort and g1-sort in future-imperfect.json carry "presentation": "sort".',
      'No rendering change: MatchingRenderer ignores the field.',
    ],
  },
  {
    key: 'PLAY-011b',
    title: 'Bucket renderer for presentation: "sort"',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2066,
    dependsOn: ['PLAY-011a'],
    goal:
      'The rendering half of docs/decisions/0060: matching items authored with presentation: "sort" ' +
      'look like sorting into visible groups, not "tap to match" (partner review note 5).',
    acceptance: [
      'Layout: category buckets are always visible and act as the drop targets, above or beside a pool of unplaced statements. A placed statement renders inside its bucket, grouped with the other statements there. Buckets grow with their contents rather than having a fixed height, since f5-sort puts 4 in one bucket. On narrow widths they stack vertically, with no horizontal scroll.',
      'Interaction: a statement can be dragged into a bucket, moved to another bucket, or returned to the pool. The tap/keyboard flow is select a statement, then select a bucket; selecting a bucket first does nothing. This mirrors the existing row/bank tap fallback.',
      'Topology (inverts 0039 Decision 2, cite it): categories never close, disable or filter, while statements are used up one placement at a time. Every placement, including the last statement, still offers every category, so elimination doesn\'t return.',
      'Feedback: a per-statement correct/incorrect mark on the statement where the learner put it. In review, a wrong statement stays in the learner\'s bucket with a note naming the correct one. It is NOT moved, because moving it hides what the learner chose.',
      'Stored answer shape unchanged: still the same left->right mapping score() consumes today, with identical subResults for the same placements (test).',
      'No new npm dependency; npm run budget for the lesson player route stays within its budget (print before/after).',
      'Components and classes come only from existing app/components/ and token colours, with no new hex values (npm run check hex guard). A docs/ui-decisions.md entry is added in the same commit.',
      '"pairs" rendering is unchanged (show b-match-1 before and after).',
    ],
  },
  {
    key: 'PLAY-012',
    title: 'Per-type code-splitting for practice renderers',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2062,
    dependsOn: ['PLAY-006'],
    goal:
      'practiceRenderer (app/components/lesson-player/practice/index.tsx) statically imports all five ' +
      'renderers unconditionally, so every lesson pays for dnd-kit and all five renderers regardless of ' +
      'which item types its own document uses — found and measured while itemizing PLAY-006\'s budget ' +
      '(docs/decisions/0056, 0057). Scope is settled by 0057: per-type code-splitting only, not ' +
      'near-viewport deferral, which was prototyped and measured WORSE on the real free-sample lesson ' +
      '(its practice block already sits above the fold).',
    acceptance: [
      'practiceRenderer dispatches to a lazy import per item type actually present in the parsed document — not a blanket next/dynamic on the whole practice slot (docs/decisions/0057 measured that backfiring).',
      'Evidence is a FRESH `npm run budget` run against /courses/future-imperfect/true-or-false taken AFTER the real code-split lands — not the renderer-stripping prototype 0057 used to estimate the saving. The printed number includes whatever dynamic-import loader overhead the real implementation adds, and clears the 260 KB target for real. The run also states which item type(s) this lesson contains (selection_grid only, per 0057 — confirm this still holds).',
      '260 KB is scoped (docs/decisions/0057): it is the reel entry point\'s budget — a course\'s FIRST FREE lesson — not a budget for every lesson. A second scripts/budget.ts route is added for a drag-heavy seeded lesson (future-imperfect\'s applied-practice: matching + ordering + selection, 25 blocks) with its OWN regression budget, set to that lesson\'s measured POST-SPLIT size plus a stated headroom (not 260 KB, and not left unbudgeted) — so a future regression on the drag-heavy path is caught even though it will never clear 260 KB itself.',
      'The drag-heavy seeded lesson (applied-practice) still renders and scores correctly with the split code loaded on demand — matching, ordering and selection items all exercised.',
    ],
  },
  {
    key: 'PLAY-006',
    title: 'Public lesson page',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2070,
    dependsOn: ['SHELL-007', 'CNT-010'],
    goal:
      'The first genuinely public read path — anonymous, no session, ' +
      'entitlement-gated by can_read_lesson (migration 041).',
    acceptance: [
      'The server reads the published version with the anon key and no session. attemptId is generated on the server (0029).',
      'A free lesson opens the player. An unpublished lesson returns 404. An invalid stored document shows a visible author error, not a crash.',
      'A paid lesson without entitlement renders nothing playable. In M2 this is a plain "not available" state; the real preview screen is M3.',
      'Full protocol, because this is the first public read path. Seed a free lesson, a paid lesson, a draft lesson and one entitlement row, then check anon, signed-in and entitled callers against each. Every result is printed — a check against empty tables is a failure.',
      'Cold-load KB budget printed via `npm run budget`.',
    ],
  },
  {
    key: 'PLAY-007',
    title: 'Lesson completion screen',
    milestone: 'M2',
    epic: 'PLAY',
    type: 'task',
    rank: 2080,
    dependsOn: ['PLAY-006'],
    goal:
      'Closes the loop after a lesson without ever reading as a failure ' +
      '(handoff: scoring principles).',
    acceptance: [
      'Shows the lesson score and the explanation review, plus a link to the next lesson (by ordinal, never forced).',
      'Has a slot for the registration offer (ANON-004).',
      'Nothing on it blocks, and nothing says "failed".',
      'Russian chrome, from the shared strings module (SHELL-007).',
    ],
  },
  {
    key: 'SHELL-008',
    title: 'Course page (the target of a catalogue card)',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2090,
    dependsOn: ['SHELL-007', 'CNT-009'],
    goal: 'The page a catalogue card opens into.',
    acceptance: [
      'Shows the cover, title, level and long description.',
      'Lesson list: title, description, item count, estimated_minutes, and the learner\'s best score where one exists.',
      'One tap from this page to the first free lesson. No locks and no forced order.',
      'Course progress is the two numbers as text (lessons attempted / total; average over attempted lessons only), never blended into one (docs/handoff.md, Scoring and progress).',
      'Cold-load KB budget printed via `npm run budget`.',
    ],
  },
  {
    key: 'SHELL-012',
    title: 'English is the default surface; Colloquiz behind a footer link',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2100,
    dependsOn: ['SHELL-007'],
    goal:
      'Settled input 7 (owner, 2026-09-24): Colloquiz is reachable only ' +
      'through a footer link; signed-in users land on / after login, not ' +
      '/app. This card verifies the REDIRECT LOGIC only — that every login, ' +
      'signup, OAuth-callback and email-confirm path is configured to send a ' +
      'signed-in user to /. Whether a real, live English surface actually sits ' +
      'at / in production is a separate claim: `/` still 307-redirects to ' +
      '/app until SHELL-010 removes that redirect entirely once the landing ' +
      'is real content. That end-to-end, on-production confirmation belongs ' +
      'to OPS-010\'s launch rehearsal, not this card — otherwise this card ' +
      'would transitively depend on the partner\'s landing-page copy (SHELL-010\'s ' +
      'own external dependency), inverting the section B/C/D build order.',
    acceptance: [
      'The English surface has its own lightweight navigation. AppSidebar, NotificationBell and DuelRealtime never appear in any English route (checked with rg against the English route group\'s imports, and in the build chunks).',
      'A footer link is the only way from the English surface to /app.',
      'Every redirect target found in the phase-1 audit (proxy.ts:66-85: unauthenticated bounce, signed-in-on-auth-route bounce, stray-code forwarding) is reviewed against the SHELL-005/SHELL-007 English paths and updated to send a signed-in user to / — verified against a build with SHELL-013\'s temporary redirect disabled locally, since production `/` still redirects to /app until SHELL-010.',
      'Existing Colloquiz entry points (duel invites, notifications, share links) still go to /app.',
      'Production confirmation that a signed-in user actually lands on live English content at / is explicitly OUT of this card\'s acceptance — it is OPS-010\'s job.',
    ],
  },
  {
    key: 'ANON-002',
    title: 'localStorage attempt store (lib/)',
    milestone: 'M2',
    epic: 'ANON',
    type: 'task',
    rank: 2110,
    dependsOn: ['ANON-001'],
    goal: 'The client-side half of whatever ANON-001 decides.',
    acceptance: [
      'A versioned schema, as decided in ANON-001 (0048).',
      'Keeps the best score and never lowers a visible number.',
      'Never throws: when storage is unavailable or full, it falls back to memory. Tested under lib/, including an unparseable and an old-version payload.',
      'Each stored attempt carries a client-generated UUID, unique, for idempotent upload (0048 Decision 3).',
      'Uploads local attempts through the ANON-003 record RPC whenever an authenticated Supabase session exists in the browser (0048 Decision 1 — the default path: covers OAuth, a same-browser email confirmation, and any later login on a browser still holding unsynced attempts), then clears local storage on success.',
    ],
  },
  {
    key: 'ANON-003',
    title: 'lesson_attempts table and record RPC',
    milestone: 'M2',
    epic: 'ANON',
    type: 'task',
    rank: 2120,
    dependsOn: ['ANON-001'],
    goal:
      'The server-side attempt record. Neither lib/accountExport.ts (covers ' +
      'profiles, results, user_achievements, group_members, get_my_duels()) ' +
      'nor lib/accountDelete.ts covers this table today — confirmed by ' +
      'reading both, phase-1 audit.',
    acceptance: [
      'Migration written, not applied. The RPC is SECURITY DEFINER, checks can_read_lesson for each attempt, and caps earned at possible.',
      'The RPC enforces the client-attempt-UUID uniqueness from ANON-002, so a duplicate upload is a no-op rather than a second row or an error.',
      'The RPC is callable both from a live authenticated session\'s direct upload (ANON-002\'s default path) and from ANON-006\'s claim callback — it is the only writer of lesson_attempts either way; pending_claims never writes the table directly (0048 Decision 2).',
      'The table is added to account export and account deletion. Full protocol, on seeded rows: export contains them, and deletion removes/anonymises them per the existing docs/adr/0002 pattern.',
    ],
  },
  {
    key: 'ANON-006',
    title: 'pending_claims: cross-browser claim mechanism',
    milestone: 'M2',
    epic: 'ANON',
    type: 'task',
    rank: 2125,
    dependsOn: ['ANON-003'],
    goal:
      'The cross-browser half of 0048\'s mechanism: the email-confirmation ' +
      'link normally opens in the system browser, whose localStorage is ' +
      'empty, so the local attempts have to travel through the server via a ' +
      'claim token rather than through storage.',
    acceptance: [
      'pending_claims migration (written, not applied): hashed 128-bit random token, ~7-day expiry, a payload size cap, per-IP rate limit on creation.',
      'Unauthenticated create endpoint, called at signup submission: writes the local attempts payload keyed by the token, and returns the token for emailRedirectTo. The create path deletes already-expired pending_claims rows before inserting (lazy sweep — 0048 Decision 7; no cron).',
      'Authenticated claim endpoint, called from the confirmation callback: looks up the token, feeds its attempts through the ANON-003 record RPC (never writes lesson_attempts directly), and consumes the row so it cannot be claimed twice.',
      'Full protocol, on seeded data: a valid claim succeeds once; a replayed token is a no-op; an expired token is refused; an oversized payload is refused; the rate limit trips; a claimed attempt for a lesson the account cannot read is rejected by the record RPC, not silently accepted. Every result printed.',
    ],
  },
  {
    key: 'ANON-004',
    title: 'Registration offer and progress migration',
    milestone: 'M2',
    epic: 'ANON',
    type: 'task',
    rank: 2130,
    dependsOn: ['ANON-002', 'ANON-003', 'ANON-006', 'PLAY-007', 'SHELL-012'],
    goal: 'The conversion moment — after value has been delivered, not before.',
    acceptance: [
      'Shown after a completed lesson, never before one.',
      'The signup form on the English surface is in Russian and returns to the lesson.',
      'At submission, calls ANON-006\'s create endpoint with the local attempts and threads the returned token through emailRedirectTo (0048 Decision 2); on the confirmation callback, calls ANON-006\'s claim endpoint. Demonstrated end to end in the cross-browser case, WITH EMAIL CONFIRMATION ON: play in browser A, confirm the email in browser B, and the attempts are visible in B. The hosted project has confirmations OFF today (temporary) — this test runs against a local build with `enable_confirmations = true` set in supabase/config.toml for the run, not the current hosted default.',
      'OAuth buttons are hidden, or come with a warning, inside in-app browsers. Google rejects OAuth in embedded webviews; this is verified on a device in OPS-007, not assumed.',
    ],
  },
  {
    key: 'ANON-005',
    title: 'Signed-in learners record attempts directly',
    milestone: 'M2',
    epic: 'ANON',
    type: 'task',
    rank: 2140,
    dependsOn: ['ANON-003', 'PLAY-006'],
    goal: 'The steady-state path once ANON-004 has converted someone.',
    acceptance: [
      'A signed-in learner\'s completed lesson writes a lesson_attempts row, and the course page shows their best score from the server.',
    ],
  },
  {
    key: 'SHELL-009',
    title: 'Per-page share metadata (OG) for Telegram',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2150,
    dependsOn: ['SHELL-008', 'CNT-009'],
    goal:
      'Telegram renders rich link previews (settled input 2), so per-page OG ' +
      'metadata is a real feature here, not polish.',
    acceptance: [
      'Course and lesson pages carry a Russian title, a description and the course cover as the OG image — built as opengraph-image.tsx files scoped to the relevant route segment (confirmed per-segment in SHELL-006\'s audit), not the single app-root file.',
      'A real Telegram post of each URL type shows a rich preview (screenshot attached).',
      'If app/robots.ts\'s blanket disallow (app/robots.ts:11-18) blocks the preview fetcher, the card says so with evidence and proposes the smallest fix as a separate card — this was flagged unknown in the phase-1 audit and is exactly what this card tests empirically.',
    ],
  },
  {
    key: 'OPS-007',
    title: 'Spike: devices inside the Instagram and Telegram in-app browsers',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2160,
    dependsOn: ['PLAY-006'],
    goal:
      'Real-device verification of every in-app-browser assumption this ' +
      'backlog makes. Deliberately run in TWO PASSES, not gated by a formal ' +
      'dependsOn edge on ANON-004: OPS-007\'s OAuth-in-webview finding is an ' +
      'INPUT to ANON-004\'s "hide or warn" decision, so OPS-007 has to start ' +
      'before ANON-004 exists — but one of its own rows (the signup → ' +
      'confirm round trip) needs ANON-004\'s actual signup form to test ' +
      'against. A dependsOn: [\'ANON-004\'] edge would block the whole card, ' +
      'including the part ANON-004 is waiting on — so instead that row is a ' +
      'named partial, closed in a second pass on this same card rather than a ' +
      'hidden or circular dependency.',
    acceptance: [
      'First pass (before ANON-004): the matrix covers iOS and Android × Instagram and Telegram for every item type, with dnd-kit drag against page scrolling; inline inputs with the on-screen keyboard; whether localStorage survives closing and reopening the in-app browser; whether the OAuth buttons work against a bare Supabase OAuth link (no signup flow needed for this row — it does not require ANON-004 to exist).',
      'NAMED PARTIAL, second pass (after ANON-004 ships): the signup → email-confirm round trip, with confirmations ON (per ANON-001), re-run against ANON-004\'s real form. Left explicitly unchecked when this card first closes; completed as a follow-up on this same card, not a new one, and not silently skipped.',
      'Recorded as a table in a decision file, one row per matrix cell plus the named partial. Every failure becomes a proposed card.',
    ],
    notes: 'ANON-004\'s last acceptance row depends on this card\'s OAuth-in-webview finding.',
  },
  {
    key: 'OPS-008',
    title: 'Minimal funnel events',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2170,
    dependsOn: ['SHELL-007'],
    goal: 'Minimal funnel analytics are in M2 (settled input 3).',
    acceptance: [
      'Record the choice inside the card: a first-party events table through a route handler, or Vercel custom events (check the plan they require).',
      'Four events: landing view, lesson start, lesson complete, signup. Each records its source (utm_source or referrer: instagram, telegram, direct).',
      'A privacy-page change goes in the same commit if the chosen route adds a processor or a new category of data.',
      'Shown firing once each on a preview deployment.',
    ],
  },
  {
    key: 'SHELL-010',
    title: 'Russian landing page with the catalogue (built once, late)',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2180,
    dependsOn: ['SHELL-008', 'AUTH-008', 'SHELL-009'],
    goal:
      'docs/handoff.md, Visual work §1 exception: the landing page IS the ' +
      'function, built once, late. "Do not build a placeholder landing page."',
    acceptance: [
      'A hero section, then a catalogue of course cards (cover, title, summary). Tapping a card opens its course page.',
      'From the bio link to the first free lesson takes at most one tap after / loads.',
      'The / → /app redirect (SHELL-013\'s temporary 307) is removed entirely from next.config.ts: `curl -I /` returns 200, and the redirect entry is gone.',
      'Cold-load KB budget printed via `npm run budget`. No placeholder version ships before this card.',
    ],
    notes:
      'Depends on the partner\'s copy and visuals — a named external ' +
      'dependency, per the original draft. Cannot be scheduled purely by ' +
      'engineering rank.',
  },
  {
    key: 'SHELL-011',
    title: 'Visual polish pass on the English surface',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2190,
    dependsOn: ['SHELL-010'],
    goal: 'docs/handoff.md, Visual work §3 — brand and aesthetic polish, end of M2.',
    acceptance: [
      'Typography, spacing and the player\'s look.',
      'Every deliberate change has an entry in ui-decisions.md, and every colour is a token.',
    ],
  },
  {
    key: 'OPS-009',
    title: 'Legal copy changes',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2200,
    dependsOn: ['ANON-003', 'OPS-008'],
    goal: 'Lesson attempts, localStorage progress and funnel events are new categories of data the legal pages don\'t cover yet.',
    acceptance: [
      'The privacy page covers lesson attempts, localStorage progress and the analytics events.',
      'Open question, recorded rather than decided: do the legal pages need a Russian version for this audience?',
    ],
  },
  {
    key: 'SHELL-015',
    title: 'Reset-password page requires a recovery session',
    milestone: 'M2',
    epic: 'SHELL',
    type: 'task',
    rank: 2205,
    dependsOn: ['SHELL-007'],
    goal:
      'Discovered during SHELL-007\'s full-protocol audit of its proxy.ts ' +
      'change (docs/decisions/0049): narrowing the unauthenticated bounce to ' +
      '/app made /reset-password reachable anonymously, where before it was ' +
      '307\'d to /login (it\'s in neither authRoutes nor /app). Not a ' +
      'security hole — ResetPasswordScreen does no server-side read or ' +
      'write of its own; its only action is a client-side ' +
      'supabase.auth.updateUser({password}) call that fails outright without ' +
      'a live recovery session — but it is a UX regression: an anonymous or ' +
      'stale-link visitor now sees a form that will error instead of a clear ' +
      'message. Low priority: no exploit path, not required for the M2 ' +
      'launch bar (not in OPS-010\'s dependsOn).',
    acceptance: [
      'With no recovery session, the page shows an expired-link message and a link to request a new reset email, instead of the update-password form.',
      'With a recovery session, the page behaves exactly as today — unchanged.',
      'The distinction is NOT made via proxy.ts\'s authRoutes list. That list also bounces a SIGNED-IN user away from auth routes (proxy.ts: the `user && isAuthRoute` guard) — and a recovery session IS a signed-in session (Supabase issues it real access/refresh tokens), so adding /reset-password there would bounce a legitimate recovery visit straight to /app before the learner can set a new password. The check belongs in the component or a page-level server check, not the route gate.',
      'Recorded in docs/ui-decisions.md if the resulting UI diverges from the existing AuthScreen error-box precedent it should reuse.',
    ],
  },
  {
    key: 'OPS-010',
    title: 'Launch rehearsal (M2 exit)',
    milestone: 'M2',
    epic: 'OPS',
    type: 'task',
    rank: 2210,
    dependsOn: [
      'SHELL-010', 'SHELL-011', 'SHELL-012', 'SHELL-013', 'ANON-004', 'ANON-005',
      'OPS-006', 'OPS-007', 'OPS-008', 'OPS-009', 'PLAY-007', 'INFRA-001',
    ],
    goal:
      'M2\'s bar, proven end to end on production: a reel viewer can play a ' +
      'free lesson with no account.',
    acceptance: [
      'On production: tap the bio link and a Telegram post on a real phone; play a free lesson anonymously; register and see the progress carried over.',
      'Hosted "Confirm email" is ON (owner, 2026-09-24 — it is OFF today only temporarily); the rehearsal\'s signup goes through a real confirmation email opened in a different browser than the one that played the lesson — this is what SHELL-012\'s production-landing claim and ANON-004\'s cross-browser claim both resolve to in the end.',
      'The production `npm run budget` output is pasted (pointed at the deployed URL, per OPS-006\'s base-URL override).',
      'The first course is published and all its lessons are free (settled input 1), with counts printed.',
    ],
  },

  // -------------------------------------------------------------- INFRA ---
  {
    key: 'INFRA-001',
    title: 'Measure storage, egress and plan',
    epic: 'INFRA',
    type: 'task',
    rank: 3000,
    dependsOn: ['OPS-011'],
    goal:
      'Outside the milestones (see OPS-011 for why this card has no ' +
      'milestone field). Self-hosting Postgres on AWS is explicitly NOT the ' +
      'starting point; measurement is.',
    acceptance: [
      'Print the database size, each bucket\'s size, monthly egress, and the Supabase plan.',
      'On the free plan, record the inactivity-pause behaviour as a launch risk.',
      'Set trigger thresholds (e.g. 60% of any limit) that open INFRA-003.',
      'Must run before OPS-010.',
    ],
  },
  {
    key: 'INFRA-002',
    title: 'Resize and convert images at upload',
    epic: 'INFRA',
    type: 'task',
    rank: 3010,
    dependsOn: ['INFRA-001'],
    goal: 'Bound per-image storage and egress cost before volume grows.',
    acceptance: [
      'Lesson images and covers are resized to a maximum width and converted to WebP on upload.',
      'Before/after byte sizes for the existing bucket contents are printed.',
      'New npm dependency (e.g. sharp), so stop and ask.',
    ],
  },
  {
    key: 'INFRA-003',
    title: 'Storage and hosting when a threshold fires',
    epic: 'INFRA',
    type: 'decision',
    rank: 3020,
    dependsOn: ['INFRA-001'],
    goal: 'Opened only by INFRA-001\'s trigger.',
    acceptance: [
      'Options, in order: upgrade the Supabase plan; move images to an egress-free object store; self-host.',
      'Self-hosting costs rebuilding auth, RLS roles (auth.uid(), anon, authenticated), PostgREST and Storage. That cost is stated with evidence.',
      'Local Docker Postgres already exists through the Supabase CLI (supabase start), so "easier local testing" is not an argument for it.',
    ],
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
