"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageLangForPath, type SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * Keeps `<html lang>` equal to the language of the visible chrome
 * (SHELL-018, docs/decisions/0091).
 *
 * The root layout renders the right value on a full load, but it persists
 * across client-side navigation, so its `<html lang>` would go stale on a
 * soft navigation between a course page (saved choice) and a lesson (always
 * English). `HtmlLangSync` re-applies `pageLangForPath` on every pathname
 * change, the same way `EnglishFooterGate` picks the footer.
 *
 * `PageLang` is for a page that knows its chrome language better than its
 * path does: the 404 and the error boundary (Russian on any path they
 * replace), and the landing, whose toggle switches its strings on the
 * client before the Server Action's re-render reaches the layout. While
 * one is mounted it wins; when it unmounts, the path's language returns.
 *
 * Module-level state rather than a context: both components are in this
 * one module, and a provider would have to wrap `{children}` in the root
 * layout for no other reason. Effects run child-first, so on a first load a
 * `PageLang` inside the page sets `claimed` before `HtmlLangSync` (a
 * sibling after `{children}`) first applies the route language, which then
 * defers to it.
 */

let claimed: SurfaceLang | null = null;
let routeLang: SurfaceLang | null = null;

function apply() {
  const lang = claimed ?? routeLang;
  if (lang && document.documentElement.lang !== lang) document.documentElement.lang = lang;
}

export function HtmlLangSync({ savedLang }: { savedLang: SurfaceLang }) {
  const pathname = usePathname();
  useEffect(() => {
    routeLang = pageLangForPath(pathname, savedLang);
    apply();
  }, [pathname, savedLang]);
  return null;
}

export function PageLang({ lang }: { lang: SurfaceLang }) {
  useEffect(() => {
    claimed = lang;
    apply();
    return () => {
      claimed = null;
      apply();
    };
  }, [lang]);
  return null;
}
