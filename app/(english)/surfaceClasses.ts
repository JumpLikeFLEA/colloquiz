/**
 * Class strings shared by the English surface's gradient pages — the landing
 * hero (docs/decisions/0078) and the course/lesson bands that follow its
 * vocabulary (docs/decisions/0079). Full literal strings, never composed at
 * runtime, because Tailwind only sees complete class names in source.
 */

/** The full-bleed brand gradient. Dark in both themes, so white text on it
 * needs no dark-mode variant (0078 Decision 1). Pair with `GradientBackdrop`
 * (HeroDecor.tsx), which clips its own glow orbs. The band clips only
 * horizontally (`overflow-x-clip`, which unlike `overflow-x-hidden` leaves
 * the y axis `visible`): the account menu's card hangs below a compact band
 * and was cut off when the band clipped both axes. */
export const GRADIENT_BAND_CLASS =
  "relative overflow-x-clip bg-gradient-to-br from-brand-deep via-brand to-brand-accent text-white";

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

/** The Alina Cher primary button on the paper ground (SHELL-027, docs/decisions/
 * 0165): violet fill, ink outline, the hard offset shadow. It presses down on
 * `active`; the lift and press are dropped under prefers-reduced-motion. */
export const OFFSET_CTA_CLASS =
  "group inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-ink bg-brand px-6 py-3 text-base font-semibold text-white shadow-offset outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--offset-shadow)] active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0";

/** A pill on the paper ground (SHELL-028, docs/decisions/0166): ink outline on
 * the card colour, the course and lesson bands' counterpart to
 * `GLASS_PILL_CLASS`. */
export const PAPER_PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs font-semibold text-foreground";

/** The same pill on the marker yellow (level, "lesson N of M"). The text is
 * `--highlight-foreground`, fixed ink in both themes, never `--ink`. */
export const PAPER_PILL_HIGHLIGHT_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-highlight px-3 py-1 text-xs font-semibold text-highlight-foreground";

/** A tappable row or tile on the paper ground: ink outline and the hard offset
 * shadow, lifting on hover. The catalogue card's treatment (SHELL-027, 0165)
 * for the course page's lesson rows. */
export const PAPER_CARD_CLASS =
  "group rounded-2xl border-2 border-ink bg-card shadow-offset outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--offset-shadow)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** A static card on the paper ground: the same frame without the hover. */
export const PAPER_PANEL_CLASS = "rounded-2xl border-2 border-ink bg-card shadow-offset";

/** The secondary button on paper or on the marker yellow: ink outline, card
 * fill. */
export const OUTLINE_CTA_CLASS =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-5 py-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
