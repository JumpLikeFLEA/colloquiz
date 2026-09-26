import dynamic from "next/dynamic";
import type { PracticeRendererProps } from "../LessonPlayer";
import { PracticeBlockPlaceholder } from "../PracticeBlockPlaceholder";

// PLAY-012/0057 — each renderer is its own chunk, loaded only when a block of
// that item type is actually rendered. `selection`/`selection_grid` need no
// drag interaction; `ordering`/`matching`/`slots` pull in dnd-kit. Splitting
// per type (rather than one `next/dynamic` around the whole practice slot,
// which 0057 measured making the real free-sample lesson WORSE) means a
// lesson using only the first two types never downloads dnd-kit at all.
const SelectionRenderer = dynamic(() =>
  import("./SelectionRenderer").then((m) => m.SelectionRenderer),
);
const SelectionGridRenderer = dynamic(() =>
  import("./SelectionGridRenderer").then((m) => m.SelectionGridRenderer),
);
const OrderingRenderer = dynamic(() =>
  import("./OrderingRenderer").then((m) => m.OrderingRenderer),
);
const MatchingRenderer = dynamic(() =>
  import("./MatchingRenderer").then((m) => m.MatchingRenderer),
);
const SlotsRenderer = dynamic(() =>
  import("./SlotsRenderer").then((m) => m.SlotsRenderer),
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
