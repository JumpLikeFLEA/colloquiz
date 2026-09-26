import dynamic from "next/dynamic";
import type { PracticeRendererProps } from "../LessonPlayer";
import { PracticeBlockPlaceholder } from "../PracticeBlockPlaceholder";

// PLAY-007/0057 addendum — a height-reserving, text-free skeleton (no locale
// concerns, since it carries no copy) for the moment between a client-side
// navigation to a lesson (e.g. the completion screen's "next lesson" link)
// and that lesson's practice-renderer chunk finishing its fetch. 0057 found
// every renderer is `ssr: true` with no `loading` fallback, which is fine for
// the SSR-cold-load case it measured (the finished block is already in the
// initial HTML) but leaves exactly this client-navigation gap unaddressed —
// see that decision's "Addendum" section.
function PracticeRendererLoading() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
}

// PLAY-012/0057 — each renderer is its own chunk, loaded only when a block of
// that item type is actually rendered. `selection`/`selection_grid` need no
// drag interaction; `ordering`/`matching`/`slots` pull in dnd-kit. Splitting
// per type (rather than one `next/dynamic` around the whole practice slot,
// which 0057 measured making the real free-sample lesson WORSE) means a
// lesson using only the first two types never downloads dnd-kit at all.
const SelectionRenderer = dynamic(
  () => import("./SelectionRenderer").then((m) => m.SelectionRenderer),
  { loading: PracticeRendererLoading },
);
const SelectionGridRenderer = dynamic(
  () => import("./SelectionGridRenderer").then((m) => m.SelectionGridRenderer),
  { loading: PracticeRendererLoading },
);
const OrderingRenderer = dynamic(
  () => import("./OrderingRenderer").then((m) => m.OrderingRenderer),
  { loading: PracticeRendererLoading },
);
const MatchingRenderer = dynamic(
  () => import("./MatchingRenderer").then((m) => m.MatchingRenderer),
  { loading: PracticeRendererLoading },
);
const SlotsRenderer = dynamic(
  () => import("./SlotsRenderer").then((m) => m.SlotsRenderer),
  { loading: PracticeRendererLoading },
);

/**
 * PLAY-002..004 — the real `practiceRenderer` for `LessonPlayer`, dispatching
 * on `block.item.type`. All five item types have interactive renderers now;
 * `default` stays as the PLAY-001 placeholder for forward-compatibility with
 * a future sixth type (`free_text`, deferred per docs/handoff.md), same
 * "renders something for every authored block in order" contract
 * PracticeBlockPlaceholder documents.
 */
export function practiceRenderer({ block, attemptId, onScore }: PracticeRendererProps) {
  switch (block.item.type) {
    case "selection":
      return <SelectionRenderer item={block.item} attemptId={attemptId} onScore={onScore} />;
    case "selection_grid":
      return <SelectionGridRenderer item={block.item} onScore={onScore} />;
    case "ordering":
      return <OrderingRenderer item={block.item} attemptId={attemptId} onScore={onScore} />;
    case "matching":
      return <MatchingRenderer item={block.item} attemptId={attemptId} onScore={onScore} />;
    case "slots":
      return <SlotsRenderer item={block.item} attemptId={attemptId} onScore={onScore} />;
    default:
      return <PracticeBlockPlaceholder block={block} />;
  }
}
