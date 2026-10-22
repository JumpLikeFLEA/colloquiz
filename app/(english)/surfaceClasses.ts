/**
 * Class strings shared by the English surface's pages — the landing hero
 * (docs/decisions/0078), the Alina Cher paper vocabulary that replaced its
 * gradient bands (0165, 0166, 0191, 0192). Full literal strings, never
 * composed at runtime, because Tailwind only sees complete class names in
 * source.
 */

/** Entry animation for hero text (tw-animate-css, CSS only). `fill-mode-both`
 * holds each line at its start state through its stagger delay instead of
 * flashing in place first. */
export const HERO_ENTER_CLASS =
  "animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none";

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
 * the card colour, for the pills on the course and lesson bands. */
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

/** An empty or closed state on the paper ground: a dashed ink outline, no fill. */
export const PAPER_EMPTY_BOX_CLASS = "rounded-2xl border-2 border-dashed border-ink/40";

/** The secondary button on paper or on the marker yellow: ink outline, card
 * fill. */
export const OUTLINE_CTA_CLASS =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-5 py-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
