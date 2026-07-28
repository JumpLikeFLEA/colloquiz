"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Mounts next-themes for the whole app.
 *
 * `attribute="class"` is what makes this work with the Tailwind v4 dark variant
 * declared in globals.css (`@custom-variant dark (&:is(.dark *))`) — next-themes
 * puts `class="dark"` on <html>, and every descendant then matches `.dark *`.
 * The token blocks in globals.css hang off the same `.dark` selector, so the
 * custom properties are redefined on <html> and inherit down from there.
 *
 * This must render high enough in <body> that the inline script next-themes
 * emits (its first child, before `children`) runs before anything paints —
 * see the note in app/layout.tsx.
 *
 * `disableTransitionOnChange` suppresses transitions for one frame while the
 * class swaps. The app uses `transition-colors` widely, so without it every
 * border and background cross-fades on a theme switch, which reads as a slow
 * repaint rather than a mode change.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
