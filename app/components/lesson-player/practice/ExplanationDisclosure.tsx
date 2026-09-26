"use client";

import { useId, useState } from "react";

/**
 * PLAY-008 — the "Why?" control every sub-part renderer opens directly
 * beneath a wrong row/pair/element/gap. A real `<button>` (not a `<details>`)
 * so it can share the 44px-target / `aria-expanded` precedent 0029 Decision 4
 * already set for this player, and a real `useState` toggle rather than
 * `<details>`'s own disclosure state, which this repo has no reason to bypass
 * but which would make "collapsed by default" implicit rather than explicit.
 *
 * Neutral tokens only (`bg-muted`/`text-muted-foreground`) — the incorrect
 * state is already signalled by the row's own tint and check/cross marker
 * (docs/handoff.md: never colour alone), so this panel must not repeat that
 * signal with `destructive-*`.
 */
export function ExplanationDisclosure({ explanation }: { explanation: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="-ml-2 inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {open ? "Hide" : "Why?"}
      </button>
      {open && (
        <p id={panelId} className="mb-1 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
          {explanation}
        </p>
      )}
    </div>
  );
}
