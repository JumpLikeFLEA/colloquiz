import { Info, TriangleAlert, type LucideIcon } from "lucide-react";

/**
 * Callout tone → icon + colour chrome. The ONE place both the learner
 * renderer (app/(main)/courses/[slug]/[stage]/TheorySection.tsx) and the
 * editor preview (StageEditor.tsx) read from, so the two cannot drift.
 *
 * `className` is the colour TAIL only — bg/border/text tokens — never
 * geometry (padding, radius, flex). Geometry stays at each call site because
 * a learner card and an editor preview strip don't share it.
 *
 * Server-safe: plain data, no React tree, no katex import chain — so a client
 * component (the editor) and a server component (the learner render) can both
 * consume it without dragging katex into the client bundle.
 */
export const CALLOUT_TONE: Record<
  "note" | "warning",
  { Icon: LucideIcon; className: string }
> = {
  note: {
    Icon: Info,
    className: "bg-brand-subtle border-brand-border text-brand-text",
  },
  warning: {
    Icon: TriangleAlert,
    className: "bg-warning-subtle border-warning-border text-warning",
  },
};
