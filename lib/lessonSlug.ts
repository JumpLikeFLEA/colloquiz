/**
 * The single source of truth for turning a lesson title into a slug
 * (CNT-010). Previously mirrored `create_lesson`'s own SQL slugify step
 * (migration 044); that step is gone as of migration 046 — the RPC now
 * takes the slug as a parameter and only validates format + suffixes on
 * collision, because an ASCII-only regexp (the RPC's old approach) collapses
 * a Cyrillic-only title — the norm for this audience, not the exception
 * (docs/handoff.md) — to the empty-title fallback, deduped only by creation
 * order (docs/decisions/0044 addendum, 2026-09-26). This module is now what
 * both the create-lesson form and the create_lesson RPC call site (the
 * lessons API route) run before a lesson exists to slug, and what
 * scripts/import-lesson.ts's authored-file schema validates an
 * author-supplied slug's format against (see `LESSON_SLUG_RE`).
 */

// A practical, common Cyrillic -> Latin transliteration (not ISO 9 or GOST,
// which optimise for round-trip reversibility Colloquiz doesn't need — this
// optimises for a URL segment a reader can sound out). Applied to lowercase
// Cyrillic only; `slugifyLessonTitle` lowercases the whole title first, and
// JS's `toLowerCase()` already folds uppercase Cyrillic correctly.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(input: string): string {
  return input.replace(/[а-яё]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
}

export function slugifyLessonTitle(title: string): string {
  const base = transliterate(title.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "lesson" : base;
}

/** Matches `lessons_slug_check` (migration 043) exactly — the format every
 * layer (this module, `create_lesson`/`update_lesson_slug`, the authored-file
 * schema) must agree on, since only the database CHECK constraint is the
 * actual enforcement backstop. */
export const LESSON_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidLessonSlugFormat(slug: string): boolean {
  return LESSON_SLUG_RE.test(slug);
}
