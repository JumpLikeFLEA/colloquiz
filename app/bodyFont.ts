import { Montserrat } from "next/font/google";

// The body face of the English surface and Studio (owner, 2026-11-05,
// docs/decisions/0219): Montserrat, every language. globals.css reads
// `--font-montserrat` into `--font-sans`, falling back to Geist where it is
// unset, so Colloquiz (which never puts this variable on an element) is
// unchanged. Variable font: one file per subset covers every weight the app
// uses (400-700).
//
// One definition, imported by every place that uses it (next/font docs, "Using
// a font definitions file"), so they all point at the same file URLs and a
// learner's browser downloads each file once. A second definition with
// `preload: false` was tried for the sign-in screen and measured: it emits the
// same font under different URLs (`…-s.p.…woff2` vs `…-s.…woff2`), so the
// sign-in screen downloaded both files again (0219 "Measured").
//
// `subsets: ["latin"]` picks only what is PRELOADED (docs/decisions/0021): the
// cyrillic @font-face ships either way and is fetched when Cyrillic text
// renders, as Geist's was on this surface. Preloading it too would add 21 KB to
// every route's first load, and next/font's preloads follow Next's merged CSS
// chunks, not the layouts that use a font, so they reach Colloquiz routes as
// well (0219 "Preloads").
export const bodyFont = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});
