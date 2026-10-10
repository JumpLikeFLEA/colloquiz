# 0100 — VOICE-003: the voice task block

Decided unattended under `--no-approval` on VOICE-003 (#159). Each decision
below is one the issue left open.

## Context

Voice tasks are reviewed by a person and never scored, so they are not an
item type (docs/handoff.md, "Item types"). The issue asks for a third block
kind, an exhaustive player switch, at most one "before" and one "after"
voice task per course enforced at publish, an editor form, a preview
placeholder, importer and drafting-prompt support, and a plain-text
rendering. The recorder itself is VOICE-005; storage is VOICE-004.

## Decision 1 — shape: `{ id, kind: "task", type: "voice", prompt, maxSeconds, compare? }`

- `kind: "task"` with a `type` discriminator (`lib/lessons/taskBlocks.ts`),
  as the issue's example suggests. A later human-reviewed task gets a new
  `type`, not a fourth `kind`.
- `prompt` is `InlineContent`, like a theory block's text, so the partner
  can emphasise a phrase and the editor reuses `InlineEditor`.
- `maxSeconds` is required in the document and has no schema default. The
  author's limit is frozen into data, so a later change of default cannot
  move an existing task's limit.
- Strict object, like every theory block.
- Bounds are 15–600 s. 15 catches "3" typed meaning minutes. 600 keeps a
  take near 2.4 MB at 0097's 32 kbps (~240 KB/min, measured). That is
  derived, not measured on a phone.

Options considered: making the voice task a theory block, as `self_check`
is. Rejected: the issue asks for a third kind, and 055's teaser already
treats any non-`theory` kind as the cut. A theory-typed voice task would
need its own clause there, and a migration.

## Decision 2 — default limit: 180 s

0097 leaves the max duration as "a product call" and gives 3 min ≈ 0.72 MB
"for scale only". The editor default is 180 s, the drafting prompt's too.
Each block carries its own value, so this is only what a new block starts
with. Revisit when VOICE-007 has the partner's view on length.

## Decision 3 — before/after uniqueness is enforced in the publish route, not SQL

`voiceCompareConflicts` (`lib/lessons/voiceCompare.ts`, pure, tested across
two lessons) is called by `POST .../publish`. The route only calls it when
the version being published has a compare slot. It checks:

- two blocks with the same slot inside the lesson itself;
- the slot already held by any other lesson's PUBLISHED version in the same
  course. The course is read from the lesson row, not the URL.

Details:

- Archived lessons are included. Unarchiving must not bring back a second
  "before".
- Drafts are excluded, so an abandoned draft cannot lock the slot.
- The publishing lesson's own current version is skipped, because a
  republish replaces it.
- It fails closed. If a published version can't be read, the publish
  errors instead of treating the missing version as "no voice task".
- It answers 422 with a sentence naming the other lesson. Not 409:
  `PreviewClient` reads every 409 as "stale, reload".

Options considered: a check inside `publish_lesson`. That would hold even
against a direct RPC call, but it is a migration that re-emits
`publish_lesson`, and the stakes don't call for one. A duplicate slot is an
authoring mistake, not an access or payment hole. The worst case, an editor
calling the RPC directly to publish a second "before", leaves COH-005 with
two candidates. It does not expose anything.

**Revisit** if COH-005 or VOICE-004 needs the invariant in SQL. For example,
if the submit RPC keys the before/after pair by slot, a duplicate would
then be a data bug rather than an authoring one. Fold the check into the
next migration that re-emits `publish_lesson` at that point.

## Decision 4 — no migration, and none needed by 055

055's `lesson_teaser` cuts at the first block whose `kind` is not `theory`
(055_lesson_access_levels.sql:244). A voice task is therefore a cut point,
and it is never returned in a teaser. That function's whitelist excludes
it a second time. `published_item_count` comes from `countPracticeBlocks`,
which counts `kind === "practice"` only.

## Decision 5 — the player and preview show a placeholder recorder

`VoiceTaskBlockView` (`app/components/lesson-player/blocks/VoiceTaskBlock.tsx`)
draws the exercise card with:

- a "Voice task" pill instead of "Exercise N of M";
- the prompt;
- "Up to 3 min";
- a disabled Record button with "Recording isn't available yet."

The public player and the admin preview render the same view (the preview is
the learner's view, 0079 D6). VOICE-005 replaces the disabled button. The
strings are English lesson chrome (0080 Decision 5) in `lib/alliengll/copy.ts`.

The voice task is not numbered among exercises and not counted in the
progress strip. Completion does not wait for it (docs/handoff.md).

## Decision 6 — "insert anywhere" means append, then move

The editor's "Add block" menu gains "Voice task" below a separator. Like
every other block, it is appended and moved with drag or the up/down
buttons. There is no "insert here" control for any block type. Adding one
only for voice tasks would make the editor inconsistent, and adding one for
all types is out of this card's scope.

## Decision 7 — the importer gets no compare-uniqueness check of its own

`import-lesson.ts` and `validate-course-file.ts` validate through
`parseLessonDocument`, so they accept the block with no change. Shown by
`validate-course-file.ts` on a two-lesson file: a bad `maxSeconds` was
rejected with `[v2: maxSeconds]`, and the corrected file passed.

The importer writes drafts and never publishes, so the publish check is the
one that counts. A file-level warning could come later; it is not proposed
as a card.

## Script audit (M3 audit item 6)

`rg -n '\bkind\b'` over the eight modules, results printed in the session:

| module | handles / doesn't care |
|---|---|
| import-lesson | validates via `parseLessonDocument`; its only own `kind` branch is the matching-presentation warning (practice only) |
| validate-course-file | same; shown on a file with voice tasks |
| seed-local-fixtures | fixtures hold only theory/practice; its invalid fixture uses `kind: "not-a-real-kind"`, still invalid |
| sweep-lesson-images / lessonImages | raw scan picks theory images and matching content only; test: a voice task beside an image yields just the image |
| perfReport | `kind` there is `"route" \| "rpc"`, unrelated to lessons |
| session (lib/lessonPlayer) | filters `kind === "practice"`; tests: count, score, progress and explanations unchanged by a voice task |
| blockWidth | `task` → reading width; test added |

`scripts/session/` (the context guard) has no lesson code; `rg` over it for
`kind` printed nothing.

## Budget

`npm run budget` after this card, all within budget: `/login` 286.3 / 380,
`/` 178.3 / 180, `true-or-false` 258.6 / 260, `applied-practice` 285.9 / 290,
`/courses/future-imperfect` 172.0 / 182 KB. The last recorded
`true-or-false` figure was 257.9 KB (0092). This card's own share of the
+0.7 KB was not isolated: CNT-012 landed in between and was not measured
here. 1.4 KB of headroom is left on that route. VOICE-005's real recorder
will need either a lazy chunk or a budget decision.
