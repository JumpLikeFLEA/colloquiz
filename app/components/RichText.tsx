import { Fragment, memo } from "react";
import { renderSegments } from "@/lib/richText";
import { splitParagraphs, renderLinesToNodes } from "@/lib/renderLineBreaks";

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
  // Approach A + B: paragraph boundary lives OUTSIDE segmentation. Split first.
  //   - <= 1 paragraph → BARE branch: emit segments directly with NO <p>
  //     wrapper, so single-line callers (definition, quiz, every existing
  //     consumer) get byte-identical DOM to pre-change. A lone \n still
  //     becomes <br>.
  //   - >= 2 paragraphs → per-paragraph <p>, except a paragraph containing
  //     any block (\[…\]) segment renders WITHOUT a <p> wrapper (KaTeX block
  //     output can't nest in <p>). Must match renderToHtml (server) and
  //     renderRichTextNodes (editor preview) structurally.
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length <= 1) {
    const segments = renderSegments(paragraphs[0] ?? "");
    return (
      <span className={className}>
        {segments.map((seg, si) =>
          seg.type === "text" ? (
            <span key={si}>{renderLinesToNodes(seg.value, `s${si}`)}</span>
          ) : (
            <span key={si} dangerouslySetInnerHTML={{ __html: seg.html }} />
          ),
        )}
      </span>
    );
  }
  // Multi-paragraph wrapper is <div>, not <span>: a <span> is inline and
  // cannot legally contain <p> children — the browser would hoist the <p>s
  // out and any block-affecting className would silently stop applying. Every
  // caller today passes className undefined, so this is DOM-neutral in
  // practice; the <div> preserves the className contract for any future
  // caller that does pass one. The bare (single-paragraph) branch above keeps
  // <span> because its children are inline and the bare case sits inside
  // callers' <p> wrappers (e.g. results / review pages).
  return (
    <div className={className}>
      {paragraphs.map((paragraph, pi) => {
        const segments = renderSegments(paragraph);
        const hasBlockMath = segments.some((s) => s.type === "block");
        const inner = segments.map((seg, si) =>
          seg.type === "text" ? (
            <span key={si}>{renderLinesToNodes(seg.value, `p${pi}-s${si}`)}</span>
          ) : (
            <span key={si} dangerouslySetInnerHTML={{ __html: seg.html }} />
          ),
        );
        return hasBlockMath ? (
          <Fragment key={pi}>{inner}</Fragment>
        ) : (
          <p key={pi}>{inner}</p>
        );
      })}
    </div>
  );
}

// Memoised: the same instance re-rendering with an unchanged string skips work;
// the module-level cache in lib/richText covers a new instance rendering content
// rendered before.
export const RichText = memo(RichTextImpl);
export default RichText;
