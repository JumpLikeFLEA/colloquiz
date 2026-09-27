"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { fireFunnelEvent, isFunnelOptedOut } from "@/lib/funnelSource";

const LANDING_FIRED_KEY = "colloquiz_funnel_landing_fired";

/**
 * OPS-008 / docs/decisions/0069 — fires `landing_view` once per tab, on
 * whichever English-surface page the visitor actually lands on first. Not
 * tied to a specific route on purpose: mounted once here, at the shared
 * layout, so it already covers every page under app/(english)/ — including
 * the course page today and SHELL-010's future `/` landing page, with no
 * further wiring needed once that page exists.
 *
 * The sessionStorage flag (separate from funnelSource.ts's own source cache)
 * is what makes this "once per visit" rather than "once per page": a
 * learner who arrives on the course page and then opens a lesson must not
 * fire a second landing_view for the lesson page's own mount of this same
 * component.
 */
export function EntryViewBeacon() {
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // docs/decisions/0069 — under GPC/DNT opt-out, skip the "already fired"
    // flag too, not only the source cache: an opted-out visitor leaves no
    // trace of the check in sessionStorage at all. The accepted trade is
    // that landing_view can then fire more than once per visit for an
    // opted-out learner (nothing here persists across this component's
    // remounts to prevent it) — over-counting, never under-counting, and
    // never a stored identifier either way.
    const optedOut = isFunnelOptedOut(navigator);
    if (!optedOut) {
      try {
        if (sessionStorage.getItem(LANDING_FIRED_KEY)) return;
        sessionStorage.setItem(LANDING_FIRED_KEY, "1");
      } catch {
        // sessionStorage unavailable (private mode, blocked storage) — fire
        // once for this mount anyway rather than silently dropping the
        // event; a later navigation in the same tab may fire it again,
        // which is an acceptable over-count next to under-counting every
        // such visitor.
      }
    }
    fireFunnelEvent("landing_view", pathname);
    // Intentionally NOT depending on `pathname` beyond this first run: this
    // must fire once per tab, not once per route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
