"use client";

import { useEffect, useState, type ReactNode } from "react";
import { segmentMath, KATEX_BASE } from "@/lib/richTextSegment";

/**
 * Client-side live KaTeX renderer.
 *
 * The server-side pipeline (lib/richText.ts) statically imports katex because
 * it runs during SSR and route handlers, where the ~80 KB module cost never
 * reaches the browser. Client surfaces that want live math preview (the course
 * theory editor's per-block preview, first) must NOT drag katex into their
 * chunk — hence the dynamic import here, isolated to this module and cached
 * once per session so N previewing fields share a single fetch.
 *
 * Segmentation is imported from `lib/richTextSegment` (the katex-free half
 * shared with the server), so a client-rendered field is guaranteed to split
 * text vs. math the same way the server's renderToHtml does. Only the KaTeX
 * call is duplicated, and it spreads the same KATEX_BASE — no options drift.
 *
 * throwOnError:false, matching the server's renderMath: broken LaTeX renders
 * in KaTeX's red inline error rather than throwing (the editor already surfaces
 * validation errors from the server preview; the client renderer must not blank
 * the field on a mid-typing partial expression).
 *
 * Render shape is ReactNode[], not an HTML string. React escapes text nodes
 * automatically, so a stray `<` or `&` in author prose stays literal without a
 * client-side escapeHtml duplicate; only KaTeX's own output is injected via
 * dangerouslySetInnerHTML, the same standing invariant as MathHtml/RichText.
 */

type KatexModule = typeof import("katex")["default"];

let katexMod: KatexModule | null = null;
let loadPromise: Promise<KatexModule> | null = null;

export function loadKatex(): Promise<KatexModule> {
  if (katexMod) return Promise.resolve(katexMod);
  if (!loadPromise) {
    loadPromise = import("katex").then((m) => {
      // Some bundler + ESM-interop modes wrap the default under `.default`;
      // others expose the module namespace directly. Accept both — a runtime
      // that returns the namespace object still has renderToString on it.
      katexMod = (m.default ?? (m as unknown as KatexModule));
      return katexMod;
    });
  }
  return loadPromise;
}

/**
 * Pure render: caller must already hold a loaded katex module (obtained from
 * loadKatex()). Kept separate from the component so it stays synchronous and
 * unit-testable, and so callers that already awaited loadKatex once can
 * render many fields without re-entering the promise machinery.
 */
export function renderRichTextNodes(text: string, katex: KatexModule): ReactNode[] {
  return segmentMath(text).map((seg, i) => {
    if (seg.type === "text") {
      return <span key={i}>{seg.value}</span>;
    }
    const html = katex.renderToString(seg.value, {
      ...KATEX_BASE,
      throwOnError: false,
      displayMode: seg.type === "block",
    });
    return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

/**
 * Component wrapper: awaits loadKatex on mount, then renders. While the
 * dynamic import is in flight the raw text is shown (rather than an empty
 * span) so the field never looks blank — after katex loads, the same string
 * flips to rendered form. Subsequent mounts anywhere in the app resolve
 * synchronously because katexMod is already cached.
 */
export function ClientMath({ text, className }: { text: string; className?: string }) {
  const [katex, setKatex] = useState<KatexModule | null>(katexMod);

  useEffect(() => {
    if (katex) return;
    let cancelled = false;
    void loadKatex().then((mod) => {
      if (!cancelled) setKatex(mod);
    });
    return () => {
      cancelled = true;
    };
  }, [katex]);

  if (!katex) {
    return <span className={className}>{text}</span>;
  }
  return <span className={className}>{renderRichTextNodes(text, katex)}</span>;
}

export default ClientMath;
