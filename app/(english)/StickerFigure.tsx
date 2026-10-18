import Counter from "@/app/components/react-bits/Counter";

/**
 * The sticker's "10–15" as two rolling counters (VIS-004,
 * docs/decisions/0174). The figure still comes from `landingCopy`
 * (`sticker.figure`); this splits it at its dash, and a figure of any other
 * shape falls back to plain text, so a copy change cannot break the sticker.
 *
 * `Counter` is the vendored react-bits component. It renders its final digits
 * on the server, so the pre-hydration markup already reads 10–15 (no 0, no
 * empty box). Its intro then spins each digit one full turn back onto the same
 * value, once, when the counter is half in view, and not at all under
 * prefers-reduced-motion (the component checks it itself).
 *
 * Size: both counters take `fontSize="inherit"`, so the 18px / 22px
 * breakpoint is the ordinary `text-[18px] sm:text-[22px]` on this wrapper.
 * Colour is not passed either: `textColor` defaults to `inherit`, which is the
 * sticker's `--highlight-foreground`.
 *
 * Screen readers: the visual row is `aria-hidden` and one `sr-only` span says
 * the whole figure, so it reads "10–15" once rather than "10", "–", "15" (the
 * unit under it is a separate, visible span).
 */

const RANGE = /^(\d+)(\D+)(\d+)$/;

export function StickerFigure({ figure }: { figure: string }) {
  const match = RANGE.exec(figure);
  if (!match) return <span>{figure}</span>;

  const [, from, dash, to] = match;
  return (
    <>
      <span className="sr-only">{figure}</span>
      <span aria-hidden="true" className="inline-flex items-baseline text-[18px] sm:text-[22px]">
        <Counter value={Number(from)} fontSize="inherit" fontWeight={800} duration={1.1} stagger={0.08} intro />
        <span>{dash}</span>
        <Counter value={Number(to)} fontSize="inherit" fontWeight={800} duration={1.3} stagger={0.08} intro />
      </span>
    </>
  );
}
