/**
 * The decorative layer for the English surface's gradient bands (the course
 * hero, the lesson band, the invite, join, runs and /my bands; docs/decisions/
 * 0078, 0079). A Server Component. The landing no longer uses it: SHELL-027
 * (docs/decisions/0165) moved `/` onto grid paper and removed the hero's word
 * chips and the value strip's icons that used to live in this file.
 *
 * Same visual vocabulary as the Colloquiz sign-in panel's `AuthLeftPanel`
 * (dot grid, white glow orb), rebuilt here rather than imported because that
 * panel animates with framer-motion, which is a forbidden signature on English
 * routes (scripts/budget.ts). The dot grid is a CSS radial gradient rather than
 * AuthLeftPanel's SVG <pattern>, so it can be rendered more than once on a page
 * without colliding pattern ids.
 */

/** Clips itself, so the band around it need not clip vertically (see
 * `GRADIENT_BAND_CLASS`). */
export function GradientBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle,white_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-[0.08]" />
      <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-brand-accent/40 blur-3xl" />
    </div>
  );
}
