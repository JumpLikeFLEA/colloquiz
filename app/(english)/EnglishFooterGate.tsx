"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Renders the shared, Russian-only `EnglishFooter` on every English route
 * EXCEPT `/`, which renders its own bilingual `LandingFooter` (reactive to
 * the landing page's EN/RU toggle — the static `EnglishFooter` can't be,
 * it's a Server Component with no access to that client-side state). A
 * client boundary at the very bottom of the root layout, not further up: it
 * costs only `usePathname` (part of Next's own router runtime already
 * shipped, not new bytes) — the rest of app/(english)/layout.tsx stays a
 * Server Component.
 *
 * The footer arrives as `children`, already rendered on the server by the
 * layout, rather than being imported here (docs/decisions/0079, "Budget").
 * Importing `EnglishFooter` made it, and lib/alliengll/copy.ts with it, part
 * of this client boundary: the whole strings object (~2.2 KB gzip) shipped
 * on every English route, including `/`, which never shows this footer.
 */
export function EnglishFooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return children;
}
