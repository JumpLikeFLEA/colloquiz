// Feature flags — flip one boolean to turn a whole surface on or off.
//
// This module is intentionally dependency-free (plain constants, no server- or
// client-only imports) so both server components / route handlers and client
// components can import it.

// Courses (structured, stage-by-stage learning) is fully built and its Calculus I
// content is imported, but it is NOT released yet. Every Courses surface is gated
// on this one constant: the sidebar entry (app/components/AppSidebar.tsx), the
// /courses pages (which 404 when off), and the /api/courses routes (which 404 when
// off). Set to `true` to release; set back to `false` to fully hide it again —
// same single-switch pattern as SHOW_AUTHOR_NAV.
//
// The promoted sibling questions already in the public Mathematics bank are data,
// not code, and are unaffected by this flag (they remain ordinary quick-play
// questions regardless of its value).
//
// Typed `boolean` (not the `false` literal) on purpose: the guards below use it in
// `if (!COURSES_ENABLED) notFound()`, and a literal type would let tsc treat the
// rest of each handler as unreachable. A flag meant to be flipped is a boolean.
export const COURSES_ENABLED: boolean = false;
