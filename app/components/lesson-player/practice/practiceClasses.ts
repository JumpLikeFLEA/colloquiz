/**
 * Class strings shared by every practice renderer (docs/decisions/0079 D6).
 * Full literal strings, never composed at runtime, because Tailwind only
 * sees complete class names in source.
 *
 * The card AROUND a practice block is not here: `LessonPlayer` draws it
 * once (`PRACTICE_CARD_CLASS` in ../columnLayout.ts) with the
 * "Exercise N of M" pill, so the six renderers render only their contents.
 */

/** "Check". The landing's CTA shape (rounded-xl, 44px touch target,
 * tinted shadow) in the brand fill, since it sits on a card, not on the
 * gradient. Carries no margin: each renderer spaces it from its own
 * content. `disabled:` styles are inert on renderers that never disable it. */
export const SUBMIT_BUTTON_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 outline-none transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-brand";

/** An exercise's prompt line, one step up from body text so it reads as
 * the card's title under the "Exercise N" pill. Margin stays per renderer
 * (ordering's prompt is followed by a hint line, not the options). */
export const PROMPT_TEXT_CLASS = "text-sm font-semibold text-foreground sm:text-base";
