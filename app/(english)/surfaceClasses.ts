/**
 * Class strings shared by the English surface's gradient pages — the landing
 * hero (docs/decisions/0078) and the course/lesson bands that follow its
 * vocabulary (docs/decisions/0079). Full literal strings, never composed at
 * runtime, because Tailwind only sees complete class names in source.
 */

/** The full-bleed brand gradient. Dark in both themes, so white text on it
 * needs no dark-mode variant (0078 Decision 1). Pair with `GradientBackdrop`
 * (HeroDecor.tsx) inside a `relative overflow-hidden` parent. */
export const GRADIENT_BAND_CLASS =
  "relative overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-accent text-white";

/** Entry animation for hero text (tw-animate-css, CSS only). `fill-mode-both`
 * holds each line at its start state through its stagger delay instead of
 * flashing in place first. */
export const HERO_ENTER_CLASS =
  "animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none";

/** The white primary CTA on a gradient band. */
export const WHITE_CTA_CLASS =
  "group inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-deep shadow-lg shadow-brand-deep/30 outline-none transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** A translucent pill on a gradient band (eyebrows, level, "free" chips). */
export const GLASS_PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/20";

/** A tappable card on the page background that lifts on hover — the
 * catalogue card's interaction (0078), reused by the course page's lesson
 * rows. */
export const LIFT_CARD_CLASS =
  "group rounded-2xl border border-border bg-card outline-none transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10 focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";
