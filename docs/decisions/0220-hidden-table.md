# 0220 — A table can be hidden until the learner opens it

Status: decided by the owner (scope and wording, 2026-11-05) and in the session that built it
(the rest), ad hoc, not a board card. No migration.

## Context

The owner sent a phone screenshot of a Tricky Pairs lesson (2026-11-05). Under "Listen once
without the text. Then listen again with the text if you want." the "Audio script" table
(Who / Line) was fully open, so a learner reads before listening. The owner asked for the
script to be hidden by default: learners may use it to check themselves, but the lesson
wants them to listen first. No block could be hidden; 0217's proposed cards already named "a
collapsible block".

## Decisions

1. **One optional field on the table block, `collapsed`** (`lib/lessons/theoryBlocks.ts`).
   Tables only (owner's choice over tables and lists, or most theory blocks): the script is
   a table, and the field is cheap to add to another block later. Absent means open, so
   every table saved before this renders as it did, and there is one way to write each
   state: the editor removes the key rather than storing `false`.
2. **The closed row reads "Show the text"; open, "Hide the text"** (owner's choice over
   "Show the table" and an author-written label). It repeats the lesson's own "listen again
   with the text". Fixed English lesson chrome (0080 Decision 5), in `alliengllCopy.theory`.
   The heading above ("Audio script") is a separate block and stays visible.
3. **A native `<details>`, closed by default** (`TableBlock.tsx`), so opening it needs no
   JS of ours; the label and the ▼ arrow follow `open` through Tailwind `group-open:`. It
   reuses the voice feedback's summary classes (`min-h-11`, `text-brand-text`, the brand
   focus ring) and the results page's rotating ▼, so no lucide icon is added to the lesson
   chunk. It does not remember being opened: a reload closes it again, which suits "listen
   first" on a second visit too.
4. **The sign-in teaser and the Studio preview show it closed too.** `lesson_teaser`
   (055:251) passes a table block on whole, and `TeaserBlock` renders `TableBlockView`, so
   the field reaches the teaser with no SQL change. The preview is the learner's view.
5. **Studio**: the table form opens with a switch, "Hidden until the learner opens it", and
   one muted line; the list form's "Ordered" switch is the precedent. The block row says
   "· hidden". The Studio Guide's lesson article says how to use it.

## Measured

- Tests: `lib/lessons/theoryBlocks.test.ts` gained two cases (`collapsed: true` parses and a
  table without it parses with the field undefined; a string is refused). The first failed
  before the schema change (`1 failed | 41 passed`), then `42 passed`.
  `TableBlock.test.tsx`: a collapsed table is a closed `<details>` holding the table, with
  "Show the text"; a plain table has no `<details>` (2 passed). Full suite: `189 passed`
  files, `2225 passed` tests. `npm run check` exit 0.
- Local stack, a scratch published course `hidden-table-check` (a lesson open to anyone with
  a hidden script table and a plain table, and a sign-in lesson whose teaser holds a hidden
  table), deleted afterwards:
  - `npm run viewport360 -- --expect="Show the text"`: `/courses/hidden-table-check/listen |
    200 | scrollWidth/innerWidth 360/360`, `/courses/hidden-table-check/teaser | 200 |
    scrollWidth/innerWidth 360/360`.
  - Edge, 360 and 1280: closed, the table is not visible (`isVisible` false) and the label is
    "Show the text"; after a click it is visible and reads "Hide the text"; Enter on the
    focused summary closes it and Space opens it again. Summary 44 px tall. Document 360/360
    and 1280/1280 closed and open. The plain table stays outside any `<details>`.
  - Teaser at 360, signed out: closed, "Show the text", 360/360 closed and open.
  - Studio preview (`?version=`): one closed `<details>`, "Show the text", 360/360.
  - Studio editor as an admin: the row reads "The scene, line by line. · hidden"; the form
    opens with the switch on; switching it off drops "· hidden". Document 360/360 and
    1280/1280. The editor's own scroll area reads `main 470/360` at 360, from the header's
    Preview / History / Save row; it read the same `470/360` with the BlockForm and BlockList
    changes stashed, so it is the pre-existing width 0186 and 0217 recorded, not this form.
- `npm run budget`, local stack, before (every change stashed) → after:
  - `/courses/future-imperfect/true-or-false`: 257.8 → 258.0 KB (limit 260).
  - `applied-practice`: 285.5 → 285.7 (limit 290).
  - Every other route: identical.
  - `/runs/…f1a1`: 180.8 of 179, over before and after (0207, 0217).
- Not measured: dark mode, a phone, an in-app browser, Safari's `<details>`.

## Revisit when

- An author wants another block hidden (the Words list 0217 mentions): the same field on
  that block.
- A table hidden for self-testing reads oddly with "Show the text": an author label.
- The course import should mark audio scripts hidden: `prompts/course-import/system-v1.md`
  does not know the field (proposed below).

## Proposed cards (not built here)

- **Course import marks an audio script hidden.** Acceptance: a new import prompt version
  describes `collapsed`, and a file whose listening scene has a transcript table imports
  with that table hidden; earlier prompt versions are unchanged.
