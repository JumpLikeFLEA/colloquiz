# 0045 — CNT-010: lesson slug transliteration and edit-until-first-publish

## Context

CNT-010 (issue #117) fixes two problems found while working SHELL-005
(docs/decisions/0044's addendum, 2026-09-26): `create_lesson`'s ASCII-only
slug step collapses a Cyrillic-only title to a meaningless fallback, and
`EditLessonDialog` lets a title be renamed with the frozen slug never shown.
Plan approved in chat 2026-09-26 with four changes to the original proposal:
drop the separate re-slug migration in favour of citing the printed audit;
check `scripts/import-lesson.ts`'s own slug path; make `update_lesson_slug`
refuse on collision rather than suffix; lock the lessons row the same way
`publish_lesson` does. This doc records the two judgment calls the plan
still left open: the transliteration mapping itself, and keeping
`update_lesson_slug` as a separate RPC from `update_lesson`.

## Decision 1 — transliteration mapping

A practical, common Cyrillic → Latin mapping (`lib/lessonSlug.ts`), chosen
over ISO 9 or GOST transliteration standards, which optimise for lossless
round-tripping back to Cyrillic — a property this URL segment has no use
for. The mapping: single-letter for most characters (а→a … я→ya), digraphs
for х→kh, ц→ts, ч→ch, ш→sh, щ→shch, and `ъ`/`ь` dropped entirely (they carry
no sound of their own). `е`/`ё` both map to `e` (not `ye`/`yo`) to keep the
common case simple; this is the one place a different practical scheme would
give a different but equally defensible answer, and the only real
consequence anywhere in the app is slug readability, not correctness — the
format is still enforced by `LESSON_SLUG_RE` regardless of which mapping
produced it.

Verified against the two titles from the 0044 finding, run through the
actual implementation (`lib/lessonSlug.test.ts`, printed):

```
Прошедшее время: вопросы -> proshedshee-vremya-voprosy
Прошедшее время 2: вопросы -> proshedshee-vremya-2-voprosy
```

**Revisit when:** a real authored title produces a slug the partner finds
unreadable or ambiguous — this is a mapping tweak, not a redesign, since the
format contract (`LESSON_SLUG_RE`) doesn't change either way.

## Decision 2 — `update_lesson_slug` stays a separate RPC

Not folded into `update_lesson(p_lesson_id, p_title, p_description,
p_estimated_minutes)` as a fifth parameter. Reasons:

- Matches this file's own established pattern: `in_free_sample`
  (`set_lesson_free_sample`) and `archived_at` (`set_lesson_archived`) are
  each their own single-purpose RPC, not parameters on `update_lesson` —
  044's comment calls this "explicit action, not a side effect" for exactly
  this reason.
- Different error semantics: a collision on `p_slug` refuses outright
  (`lesson_slug_taken`); `update_lesson`'s fields never conflict with
  anything, so it has no analogous failure mode. Folding slug in would mean
  `update_lesson` (today unconditional-success-or-`forbidden`) suddenly
  needs a `slug_taken`/`slug_frozen` branch its other three fields never
  produce.
- `update_lesson`'s existing "full replace, not a partial patch" contract
  (044's comment: passing `NULL` clears a field) is safe for slug too — an
  author who leaves the slug field unchanged should not be forced to prove
  that by resubmitting the same value through a whole-form save whose other
  three fields already work that way. Keeping slug on its own endpoint,
  called only when the field actually changed (`CourseDetailView.tsx`'s
  `save()`: `if (!frozen && slug !== lesson.slug)`), avoids the question
  entirely rather than adding a "leave unchanged" sentinel to a contract that
  deliberately has none.

**Revisit when:** a third per-field explicit-action RPC is proposed for
`lessons` and the pattern of "one RPC per field with its own failure mode"
starts to look like it should collapse into a generic patch endpoint instead
— not expected soon, since `in_free_sample`/`archived_at`/`slug` are the only
fields with this shape today.

## What this card does not change

`courses.slug` — confirmed unaffected (author-typed, not derived from a
title; see migration 046's header for the audit). `scripts/import-lesson.ts`
— confirmed it already validates an author-supplied slug's format via the
same shared regex (`lib/lessons/courseFile.ts`'s `slugField()`, now sourced
from `lib/lessonSlug.ts`'s `LESSON_SLUG_RE` instead of its own copy) before
any write; it never derives a slug from a title, so it had no ASCII-folding
bug to fix. No re-slug migration for existing rows — the printed audit
(migration 046's header) showed all 10 real lesson rows are plain ASCII and
none published, so the new transliteration step changes nothing for them,
and any of the 10 can still be corrected through `update_lesson_slug` since
none are frozen.
