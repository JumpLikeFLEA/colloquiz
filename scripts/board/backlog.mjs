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
];

export function rankOf(key) {
  const card = CARDS.find((c) => c.key === key);
  if (!card) throw new Error(`Unknown card key: ${key}`);
  return card.rank;
}

export function cardsInMilestone(milestoneKey) {
  return CARDS.filter((c) => c.milestone === milestoneKey).sort((a, b) => a.rank - b.rank);
}
