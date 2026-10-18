"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import ShapeGrid from "@/app/components/react-bits/ShapeGrid";
import { subscribeScheme } from "./schemeStore";

/**
 * The landing's living grid paper (VIS-005, docs/decisions/0175): one fixed,
 * viewport-sized layer behind the whole page, never a document-height canvas.
 * It drifts slowly, lights the cell under the cursor and ripples about eight
 * cells out from a click on empty paper. Loaded only through `LivePaper`'s
 * gate, so it is never part of a phone's download.
 *
 * Colours. A canvas cannot read a CSS variable: the line colour
 * (`--grid-line-live`), the glow colour (`--brand-text`) and the ground
 * (`--paper`, via `bg-paper`) come from the tokens. The first two are resolved
 * from `<html>` at mount and again whenever the scheme changes (`schemeStore`).
 * None is a literal here.
 *
 * Quiet zones. Anything that is a control, and the two blocks marked
 * `data-paper-quiet`, lights nothing under the cursor and starts no ripple
 * (the `ignoreSelector` patch to the vendored ShapeGrid). The layer itself has
 * `pointer-events: none`; ShapeGrid listens on `window`, so nothing in the page
 * is covered.
 *
 * Hand-over. The still CSS grid (`.grid-paper` on the landing wrapper) stays
 * until the canvas has drawn. The layer starts `invisible`. ShapeGrid draws its
 * first frame inside a `requestAnimationFrame` it schedules in its own mount
 * effect; this component's effect runs after the child's, so the callback
 * scheduled here runs after that draw, in the same frame. In that callback the
 * layer becomes visible and `<html>` gets `data-paper-live`, which makes the
 * wrapper transparent (app/globals.css). Both changes land in one style
 * recalculation, so no frame shows both grids or neither. If the tab is hidden
 * no frame runs and the still grid simply stays.
 */
const QUIET_SELECTOR =
  "a, button, input, select, textarea, label, summary, [role=button], [role=tab], [data-paper-quiet]";

function readTokens(): string {
  const style = getComputedStyle(document.documentElement);
  return [style.getPropertyValue("--grid-line-live").trim(), style.getPropertyValue("--brand-text").trim()].join("|");
}

export default function PaperLayer() {
  const tokens = useSyncExternalStore(subscribeScheme, readTokens, () => "");
  const layerRef = useRef<HTMLDivElement>(null);
  const [lineColor, hoverColor] = tokens.split("|");

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const root = document.documentElement;
    const frame = requestAnimationFrame(() => {
      layer.classList.remove("invisible");
      root.setAttribute("data-paper-live", "");
    });
    return () => {
      cancelAnimationFrame(frame);
      root.removeAttribute("data-paper-live");
    };
  }, []);

  return (
    // `invisible` is removed imperatively by the effect above; React never
    // re-applies it because this className does not change.
    <div ref={layerRef} aria-hidden="true" className="pointer-events-none invisible fixed inset-0 -z-10 bg-paper">
      <ShapeGrid
        shape="square"
        cellSize={25}
        lineWidth={1}
        direction="diagonal"
        speed={0.18}
        lineColor={lineColor}
        hoverColor={hoverColor}
        fillOpacity={0.14}
        trail={0.5}
        glow={0.12}
        radius={1.4}
        fade={0}
        clickCascade
        cascadeReach={8}
        ignoreSelector={QUIET_SELECTOR}
        intro={false}
      />
    </div>
  );
}
