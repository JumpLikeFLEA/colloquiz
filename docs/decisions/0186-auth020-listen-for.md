# 0186 — AUTH-020: expressions to listen for, on the voice task

Status: written 2026-10-21 (AUTH-020, #234). No migration: the lesson document is JSONB, and
the field is optional.

## Context

0156 Decision 8 puts the lesson's chunks on the voice-task block, "one per line as on the
bench", so the analysis (VOICE-012) can look for them. A new `after` task starts with a copy of
the `before` task's list. A `before` task does not show the list to the learner, and a final
or weekly task shows it as "Try to use"; that display is the learner view's job (VOICE-014),
not this card's.

## Decisions

1. **The field is `listenFor?: string[]` on `VoiceTaskBlockSchema`** (`lib/lessons/taskBlocks.ts`).
   - At most 12 items, each 1 to 60 characters after trimming, unique after trimming
     (the comparison is case-sensitive, as the card says "after trimming" and nothing more).
   - The 12 and the 60 are the card's numbers, exported as `VOICE_LISTEN_FOR_MAX_ITEMS` and
     `VOICE_LISTEN_FOR_MAX_LENGTH`; the form shows them.
   - An absent field and an empty array are both "no list". The form never stores `[]`.
2. **Trimming happens at parse, not at storage.** The content route and the importer store
   the raw document, as for every other field. The editor trims before it stores, so editor
   output is clean; a hand-written file with `" a "` stores that and parses to `"a"`. VOICE-012
   must read the list through `parseLessonDocument`, never from the raw JSON.
3. **The form is one textarea, one expression per line** (`VoiceTaskForm.tsx`), with an
   `N / 12` counter that turns `text-destructive-text` over 12. Blank lines are dropped.
   Duplicates and over-length lines are kept in the stored list on purpose, so Save returns the
   schema's message under the field instead of the editor silently repairing the author's text.
   The textarea keeps its own text, so a trailing newline survives typing.
4. **"A new after task starts with a copy of the before task's list" is done in the form, at
   the moment the author sets the slot to After**, and only while the task's own list is empty.
   - The source is the `before` task in the same lesson's current blocks if there is one, else
     the first `before` task in the course's other lessons' PUBLISHED versions
     (`getCourseBeforeListenFor`, read once by `page.tsx`). Published, because that is the
     source `voiceCompareConflicts` uses at publish; a `before` nobody has published yet is not
     found, and the author types the list.
   - The list reaches the form through a context (`BeforeListenForProvider`), because
     `BlockList` renders it three components down.
   - Rejected: copying at creation (a new block has no slot yet), and re-copying on every
     change of slot (it would overwrite the author's edits).
   - A failed read of the other lessons gives no copy and logs, rather than breaking the
     editor page: the copy is a convenience, not a gate.
5. **`otherPublishedLessons` moved from the publish route into `lib/lessonContentAuthoring.ts`**
   (exported, body unchanged, still fail-closed) so the page and the publish check read the
   other lessons the same way.
6. **Carried by the schema, with no change of their own:** Publish (`publish_lesson` publishes a stored
   version as it is; the save route has already parsed the document), `import-lesson.ts` and `validate-course-file.ts` (both
   call `parseLessonDocument`; a test runs a course file with a `listenFor` through
   `CourseFileSchema` and `parseLessonDocument`). The plain-text export gets a
   `Listen for: a; b` line (`voiceTaskPlainText`). `prompts/draft-lesson.md` documents the field
   for chat drafting, with "never invent expressions".

## Evidence

- `npx vitest run` over `lib/lessons` and the form test: see the card's evidence comment.
- Cross-lesson copy, local stack: a published `before` task in week-one with two expressions
  (set by SQL, reverted afterwards); the week-four editor, After switched from None, filled the
  field with `I used to` / `by the time`.
- Existing documents: `lib/lessons/authoredCourses.test.ts` parses every
  `authored/courses/*.json` (gitignored, so skipped on a checkout without it) and asserts a
  positive file and block count, so an empty directory cannot pass.

## Revisit when

- VOICE-012 finds the model needs more than 12 expressions or longer than 60 characters.
- An author wants the list to be case-insensitive unique.
- Authors write a `before` task in a lesson they have not yet published and expect the copy.
