/**
 * Injects a pre-rendered math HTML string (from `renderToHtml` in
 * lib/richText, built server-side) as inline content.
 *
 * Deliberately imports NO katex: this is the client-safe half of the
 * server-render-then-inject split, so a client component (QuizSession) can show
 * KaTeX output without pulling ~80 KB of KaTeX JS into the learner bundle. The
 * string it receives is already safe — author text HTML-escaped, only KaTeX's
 * own output injected verbatim — so `dangerouslySetInnerHTML` here is the same
 * standing invariant as RichText's, one boundary further along.
 */
export function MathHtml({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default MathHtml;
