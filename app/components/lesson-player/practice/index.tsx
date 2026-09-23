import type { PracticeRendererProps } from "../LessonPlayer";
import { PracticeBlockPlaceholder } from "../PracticeBlockPlaceholder";
import { MatchingRenderer } from "./MatchingRenderer";
import { OrderingRenderer } from "./OrderingRenderer";
import { SelectionGridRenderer } from "./SelectionGridRenderer";
import { SelectionRenderer } from "./SelectionRenderer";
import { SlotsRenderer } from "./SlotsRenderer";

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
