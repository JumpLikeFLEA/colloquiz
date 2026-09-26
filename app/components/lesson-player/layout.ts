/**
 * Lesson player column/width classes (ad-hoc adaptive-width task, 2026-09-26,
 * docs/decisions/0043). Written as full literal class strings, never
 * composed at runtime, because Tailwind only picks up complete class names
 * from source.
 *
 * Below `lg` (1024px) nothing here changes rendered output — every class
 * pair keeps its mobile half identical to pre-change `max-w-xl`.
 */

/** The player's own root column. Grows from 576px to ~1024px at `lg`. */
export const LESSON_COLUMN_CLASS = "mx-auto flex w-full max-w-xl lg:max-w-5xl flex-col gap-4 px-4 py-4";

/** Same column width, for the headers above the player (PreviewClient, the
 * lesson-player-demo page) that don't share LessonPlayer's flex/gap. */
export const LESSON_HEADER_COLUMN_CLASS = "mx-auto max-w-xl lg:max-w-5xl px-4";

/**
 * Reading-measure wrapper for theory/practice blocks that should NOT grow to
 * the full column at `lg`+. `w-full` is required alongside `lg:mx-auto`: the
 * column is `flex-col`, and a non-stretched flex child with auto cross-axis
 * margins shrinks to its content width instead of filling the row, which
 * would left-drift short blocks (headings, short callouts, practice cards)
 * instead of centring them.
 */
export const READING_WIDTH_CLASS = "w-full lg:max-w-2xl lg:mx-auto";

/** The one-line revert point for the `text-base`-at-`lg` experiment
 * (docs/decisions/0043) — theory body text only; captions stay `text-xs`. */
export const THEORY_BODY_TEXT_CLASS = "text-sm lg:text-base";
