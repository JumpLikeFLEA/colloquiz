import { Caveat, Unbounded } from "next/font/google";

// Alina Cher's two display faces (SHELL-026, docs/decisions/0162, 0163), both
// with the cyrillic subset. Unbounded 800 is the headline face and preloads
// (it is above the fold on the landing). Caveat 600 is the handwritten accent,
// ~97 KB for both subsets, so it is NOT preloaded: it loads when a page first
// paints text in it. Weights are pinned so next/font requests one instance,
// not the whole variable axis.
//
// One definition, imported by the English root layout and by the sign-in
// screens' paper frame (VIS-006, docs/decisions/0222), following app/bodyFont.ts
// (0219 Decision 4): a second definition would emit the same files under other
// URLs and be downloaded twice.
export const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: "800",
  display: "swap",
});

export const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  weight: "600",
  display: "swap",
  preload: false,
});
