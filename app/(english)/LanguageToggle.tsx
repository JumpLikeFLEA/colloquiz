"use client";

import { useOptimistic, useTransition } from "react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { setSurfaceLang } from "./setSurfaceLang";

/**
 * The EN/RU switch shared by the landing page and the course pages
 * (docs/decisions/0080). Lesson pages have none: their chrome is always
 * English. White-on-gradient, because both callers put it inside a
 * brand-gradient band (0078/0079); the gradient is dark in both themes, so
 * these classes need no dark-mode variant.
 *
 * Saving goes through the `setSurfaceLang` Server Action, which re-renders
 * the current page and the root layout in the new language. `useOptimistic`
 * moves the pressed state at once, so the course page, whose strings arrive
 * with that re-render, doesn't look unresponsive in between. The landing
 * page also passes `onChange` to switch its own client-side strings
 * instantly, as it did before the toggle was shared.
 */
export function LanguageToggle({
  lang,
  label,
  onChange,
}: {
  lang: SurfaceLang;
  /** Accessible name of the group ("Language" / "Язык"). */
  label: string;
  onChange?: (lang: SurfaceLang) => void;
}) {
  const [shown, setShown] = useOptimistic(lang);
  const [, startTransition] = useTransition();

  function choose(next: SurfaceLang) {
    if (next === shown) return;
    onChange?.(next);
    startTransition(async () => {
      setShown(next);
      await setSurfaceLang(next);
    });
  }

  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg bg-white/10 p-0.5 ring-1 ring-white/20">
      {(["en", "ru"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={shown === code}
          lang={code}
          className={`min-w-11 cursor-pointer rounded-md px-2.5 py-2 text-xs font-semibold tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white ${
            shown === code ? "bg-white text-brand-deep shadow-sm" : "text-white/75 hover:text-white"
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
