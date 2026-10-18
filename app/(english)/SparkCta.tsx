"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import ClickSpark from "@/app/components/react-bits/ClickSpark";

/**
 * The landing's "Start for free" buttons throw violet sparks when pressed
 * (VIS-004, docs/decisions/0174). `ClickSpark` is the vendored react-bits
 * component, used as shipped; this file only feeds it a colour and keeps its
 * wrapper from changing the button's box.
 *
 * Colour: the canvas cannot read a CSS variable, so the spark colour is the
 * resolved `--brand-text` (the violet in light, the light violet in dark under
 * `surface-alina`). It is read from the page, not copied into the code, and
 * re-read when the scheme flips: `.dark` is toggled on <html> by the layout's
 * inline script, and a change of the OS scheme re-runs it. Until it has a
 * value (server render) the sparks are `disabled`, so the vendored default
 * colour (white) is never used.
 *
 * Box: ClickSpark's root is `div.relative.isolate.h-full.w-full`. `flex` makes
 * it block-level with no line-box gap around the link, and `w-auto!`/`h-auto!`
 * beat its `w-full`/`h-full` so it shrink-wraps the button like the button's
 * own flex slot did.
 */

function readSparkColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--brand-text").trim();
}

function subscribe(onChange: () => void): () => void {
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    scheme.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

export function SparkCta({ children }: { children: ReactNode }) {
  const color = useSyncExternalStore(subscribe, readSparkColor, () => "");

  return (
    <ClickSpark
      className="flex h-auto! w-auto!"
      sparkColor={color}
      sparkCount={10}
      sparkRadius={34}
      sparkSize={12}
      duration={520}
      disabled={color === ""}
    >
      {children}
    </ClickSpark>
  );
}
