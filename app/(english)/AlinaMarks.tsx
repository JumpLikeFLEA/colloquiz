import type { ReactNode } from "react";

// Alina Cher's two hand-made marks (SHELL-026, docs/decisions/0163). Both are
// Server Components over the tokens in app/globals.css: no client JS, no hex.
// The grid paper is the `.grid-paper` class, not a component.

/** The yellow highlighter behind a word (`.marker` in globals.css). */
export function Marker({ children }: { children: ReactNode }) {
  return <span className="marker">{children}</span>;
}

/**
 * A hand-drawn, slightly open oval around a word, in the violet text colour.
 * The SVG stretches to the word's box (`preserveAspectRatio="none"`) and the
 * stroke stays 3px at any size (`vector-effect`), so it fits a short or a long
 * word without thinning. Decorative: hidden from assistive tech.
 */
export function HandOval({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-[0.35em] py-[0.1em]">
      {children}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-brand-text"
      >
        <path
          d="M52 3 C 25 1, 3 9, 4 21 C 5 33, 30 38, 56 37 C 82 36, 98 29, 96 17 C 94 7, 74 2, 46 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
