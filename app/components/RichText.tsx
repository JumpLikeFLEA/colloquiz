import { memo } from "react";
import { renderSegments } from "@/lib/richText";

/**
 * Renders math-aware text: `\(…\)` inline and `\[…\]` display LaTeX via KaTeX,
 * everything else as plain JSX text nodes.
 *
 * This is a server-capable component with no `'use client'`. That is the point:
 * KaTeX output is inert HTML+CSS needing no runtime JS, so the server renders to
 * HTML strings here and client surfaces inject those strings (see
 * `PlayableQuestion.*Html` built in the quiz `page.tsx`), keeping client-side
 * KaTeX at zero. Importing this into a client component would drag `katex`
 * (~80 KB gzip JS) into the client graph — don't.
 *
 * `dangerouslySetInnerHTML` receives KaTeX's own output and NOTHING else, ever.
 * With `trust: false` (KATEX_BASE) KaTeX cannot emit anchors or raw HTML, so its
 * output is safe by construction; author *text* segments stay JSX text nodes.
 *
 * Render-only. `shuffleOptions()` and the `correct_answer` equality check must
 * keep operating on the raw stored strings — never round-trip a value through
 * KaTeX and compare the result.
 */
function RichTextImpl({ text, className }: { text: string; className?: string }) {
  const segments = renderSegments(text);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />
        ),
      )}
    </span>
  );
}

// Memoised: the same instance re-rendering with an unchanged string skips work;
// the module-level cache in lib/richText covers a new instance rendering content
// rendered before.
export const RichText = memo(RichTextImpl);
export default RichText;
