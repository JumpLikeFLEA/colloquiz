# 0203 — Authors import a course file from Studio (AUTH-021, CNT-018, CNT-019, OPS-030)

Status: decided (owner, 2026-10-24). Not built. Cards AUTH-021, CNT-018, CNT-019, OPS-030.

## Context

A course reaches the database by one path today. The maintainer pastes `prompts/draft-lesson.md`
and the PDF into a chat, checks the JSON with `scripts/validate-course-file.ts`, and writes it with
`scripts/import-lesson.ts`, which uses the service role. Every new course therefore goes through
the maintainer. M4 opens Studio to teachers on seats (0141, 0154), so that becomes a bottleneck.

The owner asked for an author to start the import themselves, from Studio, behind a grant only an
admin can give.

This reverses three recorded positions:

- **0125:** "No import UI and no assistant UI is added." Reversed for import. An assistant UI
  (chat-style editing) is still not added.
- **`docs/handoff.md`, "The two surfaces":** the PDF -> JSON -> import path "stays, run by the
  maintainer, with no Studio UI". Reversed. The maintainer's script stays as well.
- **0028** dropped the scripted drafting step. Its revisit trigger was course volume rising well past
  two or three courses. Outside teachers authoring on seats are that trigger. 0028's other point, that
  a human-watched chat catches truncation and malformed output at once, is answered here by
  validation in code: 0027's hardening list (stop_reason check, truncation, output validation,
  writing results step by step) becomes acceptance on CNT-018.

## Decisions

1. **An admin-only grant: `author_seats.can_import`** (AUTH-021). It defaults to false and is
   set only by `set_author_seat_import` (an `is_admin` check), from a switch on the seat card at
   `/studio/authors`. `_can_import(p_user)` is `is_admin(p_user) OR (_author_seat_active(p_user)
   AND can_import)`, so a lapsed seat cannot import, the same rule as `_studio_can_write` (0155).
   A column on the seat, not a new grant table: a seat is the only thing an admin manages per
   teacher today, and a single boolean does not need a table.
2. **Formats: PDF, DOCX, Markdown and plain text** (owner's choice). PDF goes to Claude as a
   document. Markdown and text go as text. DOCX is converted to HTML on our side with `mammoth`
   (a new npm dependency, owner-approved here) and sent as text. Embedded images are dropped and
   a QA note says so. PPTX is not supported.
3. **An import creates a new draft course and touches nothing else** (owner's choice). Since
   nothing existing is written, the script's editor-protection and slug-matching rules don't apply.
   The author is the course's `author_id` and gets a `course_editors` row. Every lesson is a draft
   version with `source = 'import'`. Nothing is published, and the course is unlisted (0171).
4. **The model is `claude-opus-5-5` at effort `high`, with no bake-off** (owner's choice). The
   reasons:
   - The task is hard: page layout, tables, answer keys, rewriting paper-only tasks as items, and
     about forty strict rules from `draft-lesson.md`.
   - The volume is low.
   - Every validation failure or weak explanation costs the author editing time.

   The model comes from env `COURSE_IMPORT_MODEL`, like `VOICE_ANALYSIS_MODEL`. Cost, an
   **estimate, not measured**: about $2.2 per 30-page course on Opus 5.5 and about $1.1 on Sonnet
   5.5. It assumes 60-90K input tokens, the file cached across about 7 calls, and about 80K tokens
   of output and thinking. CNT-018 replaces this with `count_tokens` and the stored `usage`.
5. **A job in steps, under a lease** (CNT-018). This is the voice-analysis pattern
   (`lib/voice/analysis/pipeline.ts`): one row per import, one short invocation per step
   (extract, plan, one call per lesson, commit), started with `after()` and reclaimed by the
   status poll.
   - **Upload:** the file goes straight to a private bucket through a signed upload URL, because a
     Vercel request body is capped at 4.5 MB.
   - **Validation:** each lesson is checked with `LessonFileSchema` and `parseLessonDocument`. A
     lesson that fails gets one repair turn with the errors.
   - **Commit:** all or nothing. `course_import_commit` is granted to `service_role` only and checks
     the grant and the seat again.
6. **Caps and a kill switch.**
   - Caps: 3 imports per 24 h and 10 per 30 days per user, in SQL (the 096 trigger shape). Admins
     are exempt.
   - Kill switch: `COURSE_IMPORT_MODE=off|on`. It stays `off` in production until OPS-030 publishes
     the legal revision, because Anthropic would receive files uploaded by users, a purpose
     `subprocessors.md` does not list today.

## Not done here

- Re-importing into an existing course.
- Extracting images into `lesson-images`.
- PPTX.
- A bake-off between models.
- The maintainer's script and `prompts/draft-lesson.md` stay as they are.

## Revisit if

- Authors routinely need to re-import into an existing course.
- Imports fail validation often enough that the repair turn is not enough.
- The stored `usage` shows a cost far from the estimate in Decision 4.
- A teacher asks for slide decks.
