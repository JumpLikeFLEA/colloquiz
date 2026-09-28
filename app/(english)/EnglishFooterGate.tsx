"use client";

import { usePathname } from "next/navigation";
import { EnglishFooter } from "./EnglishFooter";

/**
 * Renders the shared, Russian-only `EnglishFooter` on every English route
 * EXCEPT `/`, which renders its own bilingual `LandingFooter` (reactive to
 * the landing page's EN/RU toggle — the static `EnglishFooter` can't be,
 * it's a Server Component with no access to that client-side state). A
 * client boundary at the very bottom of the root layout, not further up: it
 * costs only `usePathname` (part of Next's own router runtime already
 * shipped, not new bytes) — the rest of app/(english)/layout.tsx stays a
 * Server Component.
 */
export function EnglishFooterGate() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <EnglishFooter />;
}
