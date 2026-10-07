"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { footerLangForPath, type SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * Picks which of the root layout's two server-rendered footers to show on
 * the current route (docs/decisions/0080, `footerLangForPath`): the saved
 * EN/RU choice on a course page, English on a lesson page (its chrome is
 * always English), Russian anywhere else, and nothing on `/`, whose `LandingContent` renders its own copy so
 * it can follow the landing toggle without a server round trip.
 *
 * A client boundary at the very bottom of the root layout, not further up:
 * the layout persists across client-side navigation, so only `usePathname`
 * (part of Next's own router runtime, already shipped) can tell it which
 * route it is on now. `savedLang` comes from the layout's own cookie read,
 * which the toggle's Server Action refreshes.
 *
 * Both footers arrive as props, already rendered on the server, rather than
 * being imported here (docs/decisions/0079, "Budget"): importing the footer
 * would make it, and its strings, part of this client boundary on every
 * English route.
 */
export function EnglishFooterGate({ savedLang, ru, en }: { savedLang: SurfaceLang; ru: ReactNode; en: ReactNode }) {
  const lang = footerLangForPath(usePathname(), savedLang);
  if (lang === null) return null;
  return lang === "ru" ? ru : en;
}
