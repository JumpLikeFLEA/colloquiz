# 0018 — Alliengll content model: schema, lesson document, publish, entitlement, import

## Context

M1 opens with the six content-model decisions `docs/handoff.md` lists as
blocked on the M1 audit (Phase 1 report, 2026-09-21). The audit established:

- The Colloquiz course schema (028/029/032/035/039) was live: Calculus I
  published, 2 enrollments, 95 `visibility='course'` questions, 23 theory
  versions. The learner routes were dark (`COURSES_ENABLED = false`).
- Its shape is the opposite of English lessons: pool-drawn variant checks,
  enrollment-gated RLS and exact-string MCQ in `questions`. English lessons
  need fixed authored sequences, a public read path for anonymous play, and
  `lib/items` scoring.
- `TheoryBlock` has no inline formatting, and its `formula` block pulls
  KaTeX, which is banned from English routes by the performance boundary.

"Alliengll" is the **internal** name for the English mini-courses surface
from this decision onward. It appears in docs, decision files and code
comments only. It never appears in user-facing strings, route segments,
metadata or OG images. `docs/handoff.md`'s branding line stands: user-facing,
the English platform is simply Colloquiz.

Decided by the owner on 2026-09-21. This file records those decisions and
the reasoning behind them. It does not re-open them.

## Decision 1 — Retire Colloquiz courses; reuse the parts of the schema that fit

Both existing courses are deleted completely: Calculus I (published) and
`human-behavioral-biology` (draft), with all their data and the Colloquiz
course feature built around them. Migration `039_theory_heading_block.sql`
was written but never applied. It extends the retired theory schema, so its
file is deleted rather than applied. With no live course left, the objection to
reusing the schema disappears (it was that reuse would mean entitlement
surgery on a live table). What remains is whether each table fits the new
shape.

| Existing object | Fate | Why |
|---|---|---|
| `courses` | **kept, reshaped** | Slug/title/description/status fit as they are. `access` is dropped (see Decision 6). `author_id` is added (handoff: "content carries an author id from day one"). |
| `course_editors`, `can_edit_course()`, `grant/revoke_course_editor` | **kept** | Per-course author delegation is exactly what Alliengll needs. |
| `course_stages`, `course_stage_theory`, `course_stage_theory_versions`, `course_stage_exercises` | **dropped** | Replaced by `lessons` + `lesson_versions` (Decision 2). With every row deleted, creating fresh tables is cleaner than renaming ones whose columns mean something else. |
| `course_enrollments`, `enroll_in_course()` | **dropped** | Enrollment has no place in a model with no locks and anonymous play. M3's purchases get their own table (Decision 6). |
| `course_stage_progress`, `course_check_attempts`, `course_variant_seen`, `draw_practice_item`, `start_stage_check`, `submit_stage_check` | **dropped** | Pool-draw and stage-check machinery. Attempt storage for Alliengll is M2's design, not a rename of this. |
| `questions` course columns (`course_stage_id`, `variant_group`, `variant_ordinal`, `authored_key`, the `'course'` visibility value) and the 95 course questions | **dropped** | Alliengll items live in the lesson document, not in `questions`. |
| `scripts/import-course.ts`, `lib/courseContent.ts` (`TheoryBlock`), `lib/theoryValidate.ts`, the course learner/authoring routes, `COURSES_ENABLED` | **removed** | Their conventions carry forward (below); their code does not. |

Conventions carried forward on purpose:
- `authored_key` idempotent upserts.
- The `updated_by` / `--adopt` protection against an import overwriting
  in-app edits.
- Append-only versions.
- Draft preview.

KaTeX stays wherever Colloquiz *quiz* questions use it. Only the course path
loses it.

## Decision 2 — One lesson document per lesson, theory and practice blocks in order

A lesson's content is **one JSONB document**: an ordered array of blocks, each
either a **theory** block or a **practice** block (a `lib/items` item). This
matches the authored shape ("short theory block, then a couple of exercises,
repeated"), gives the editor a single concurrency token, and makes export
close to the document itself.

- **`lessons`**: `id`, `course_id`, `ordinal`, `title`, `description`,
  `in_free_sample`, `published_version_id`, `published_item_count`.
  - `ordinal` is display order only. It is never read by entitlement.
  - `published_item_count` is written by the publish action, so a paid
    lesson's item count is readable without reading its document (handoff:
    title, description and item count are visible for every lesson).
- **`lesson_versions`**: append-only. `id`, `lesson_id`, `document`,
  `source` (`'import' | 'editor'`), `created_by`, `created_at`.
  - Every save appends a row.
  - The latest row is the draft, and its id is the concurrency token.
  - Rows are never updated. This gives practice blocks the revert history
    that Calculus exercises lacked.
- Every block carries an **authored-stable id**, unique within the lesson. An
  attempt (M2) references `(lesson_version_id, block_id)`. There are no
  per-item foreign keys, which is the accepted cost of the document model.
- **Theory blocks are a new, KaTeX-free set.** At minimum: heading, prose,
  example, callout, list, image, video (YouTube, decorative, never required to
  score). Prose-bearing fields support a minimal inline markup: emphasis and an
  English-span, which renders as `lang="en"`. The exact field shapes are the
  validator card's decision, recorded in its own file.
- **Practice blocks** are validated by `parseItem`. The explanation coverage
  (0017) and every other item invariant apply unchanged.

**Validation path.** Saving goes through a server route that runs the lesson
validator, then calls the save RPC. The player also parses on read, so an
invalid stored document shows as a visible author error, not a crash. The
residual risk is that an editor calling the RPC directly can store an invalid
draft. That risk is bounded to trusted editors and is accepted.

**Answer keys ship to the client.** Anonymous play keeps progress in
localStorage, so scoring runs client-side, and any lesson a visitor may read
exposes its own answer key. This is accepted for an entertainment product:
entitlement still governs whether the lesson is readable at all.

## Decision 3 — Import pipeline: PDF → LLM draft → import → UI editing

1. The partner's PDF is converted by an LLM drafting step into a lesson
   document in exactly the stored shape.
2. The importer writes it as a new `lesson_versions` row with
   `source='import'`. That row is a **draft**; nothing is published by import.
3. The partner corrects the draft in the authoring UI and publishes.

The partner never sees JSON.

**Overwrite protection.** A re-import appends a version only if the lesson's
latest version is itself `source='import'`, meaning no editor save has
happened since. Otherwise it refuses unless run with `--adopt`. This is the
`updated_by` precedent, restated for the version model.

The drafting prompt is gated on a real lesson PDF from the partner (requested
2026-09-21).

## Decision 4 — Versioned publish

`lessons.published_version_id` points at one immutable version. Editing a
published lesson appends drafts that learners never see until the author
publishes again.

- A course is visible when its `status` is published.
- A lesson is playable when it has a `published_version_id`.
- `in_free_sample` changes only through an explicit action, never as a side
  effect of saving or publishing content (handoff: author intent is frozen
  into data).
- A new course's first lesson is created with `in_free_sample = true`. That
  is a default *written as data* at creation time, not a rule derived from
  ordinal 1 at read time.

## Decision 5 — Content language: plain strings, no locale maps; fonts must cover Cyrillic

Content is not translated. Each string is written in the language it is read
in, frequently mixed (a Russian explanation with English examples). So there
are no `{ru, en}` maps, because no translation relationship exists to model.
The English-span inline mark (Decision 2) is the only language structure.

**No fallback to a system font is allowed.** The served webfont must cover:
- the Russian alphabet including `Ёё`;
- the typography Russian text actually uses: `« » — – №`;
- straight and curly quotes.

This must be proven from the font files served, not assumed from a subset
name. If Geist cannot cover it, choosing a font is a separate decision. It is
not a silent substitute.

Authoring UI chrome is English-only.

## Decision 6 — Entitlement function, written for M3 now

One function decides whether a lesson's content is readable. RLS and the UI
both call it.

```
can_read_lesson(p_lesson_id) returns boolean   -- STABLE, SECURITY DEFINER
  true when
    can_edit_course(course)                            -- authors see drafts too
  or (
    course.status = 'published'
    and lesson.published_version_id is not null
    and (
      lesson.in_free_sample
      or exists (select 1 from course_entitlements
                 where user_id = auth.uid() and course_id = lesson.course_id)
    )
  )
```

- **`course_entitlements`** (`user_id`, `course_id`, `granted_at`, `source`,
  `source_ref`) is created in M1 and **stays empty until M3**, whose
  merchant-of-record webhook becomes its only writer (service role).
  - It has no expiry column and no app delete path, because purchasers keep
    access indefinitely (handoff).
  - Chargeback revocation is an M3 decision. A nullable `revoked_at` added
    then is additive.
- `auth.uid()` is null for anonymous visitors, so they get exactly the free
  sample. M2 therefore needs no change to this function, only anon-facing
  routes.
- `courses.access` is dropped. A course whose every lesson is
  `in_free_sample` is free. A second flag would be a second place that can
  disagree.
- RLS:
  - Published course and lesson metadata is readable by `anon` and
    `authenticated`.
  - A `lesson_versions` row is readable when it is its lesson's published
    version and `can_read_lesson` is true, or when the caller can edit the
    course.
- **Verification must use non-empty tables.** Seed an entitlement row, a
  free-sample lesson, a paid lesson and a draft, then check each role
  (handoff: a check that passes on an empty result proves nothing).

**Images** go in a public storage bucket with editor-scoped writes. The
bucket is public because free-sample images must load for anonymous visitors.
The accepted consequence is that a paid lesson's image URL is guessable-once-
seen: low stakes, the content text stays gated.

## What would make us revisit this

- A partner PDF whose lessons don't fit "theory, then practice, repeated" as
  an ordered block list. That would reopen Decision 2 before any importer is
  built.
- A need to reference one item across lessons (a reusable exercise bank).
  The document model deliberately has no item table to share from.
- Geist failing the Cyrillic coverage check. That would mean a font decision,
  recorded separately.
- M3 revealing that the merchant of record needs time-limited or revocable
  access. Extend `course_entitlements` additively; don't fork a second
  entitlement check.
- A second trusted-editor population (more than one partner). The accepted
  "RPC callable directly with an invalid draft" risk would need a server-only
  write path instead.
