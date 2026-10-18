"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

/**
 * The gate for the landing's living grid paper (VIS-005,
 * docs/decisions/0175). The layer exists only on a computer that can hover
 * with a precise pointer and has not asked for less motion. On any other
 * device, a phone first, nothing below is ever requested: `PaperLayer` (which
 * pulls in the vendored ShapeGrid) is a `next/dynamic` import with
 * `ssr: false` that is rendered only while the query matches, so its chunk is
 * not fetched until then. The match is followed live: if it stops matching
 * the layer unmounts (and `PaperLayer` hands the page back to the still CSS
 * grid); if it starts, the chunk is fetched then.
 *
 * Server and first client render are both "off", so there is no hydration
 * difference to manage; the still `.grid-paper` is what everyone sees until
 * the canvas has drawn.
 */
export const LIVE_PAPER_QUERY =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

const PaperLayer = dynamic(() => import("./PaperLayer"), { ssr: false });

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(LIVE_PAPER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function LivePaper() {
  const on = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(LIVE_PAPER_QUERY).matches,
    () => false,
  );
  return on ? <PaperLayer /> : null;
}
