// AUTH-023 (docs/decisions/0214 era review, OPS-035 sibling) — the Studio's shared class strings, defined once.
// The costs page's classes (OPS-032) were folded in. No new colours: brand, border, muted and the
// warning/destructive sets only. Pages that need a different look name it here instead of copying.

export const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
/** The recordings page's taller, rounder secondary button (44px target). */
export const SECONDARY_BUTTON_TALL =
  "cursor-pointer inline-flex min-h-11 items-center justify-center gap-1.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
/** A row's icon button (runs, calendar events): padded, never shrinks. */
export const ICON_BUTTON =
  "cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50";
/** The costs page's fixed 36px square icon button. */
export const ICON_BUTTON_SQUARE =
  "cursor-pointer inline-flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";
export const INPUT = "w-full min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground";
export const LABEL = "text-xs text-muted-foreground";
export const PILL = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
export const CARD = "rounded-2xl border border-border bg-card px-4 py-3";
export const ERROR_BOX =
  "px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text";
