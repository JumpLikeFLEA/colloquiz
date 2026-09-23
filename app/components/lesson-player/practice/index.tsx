import type { PracticeRendererProps } from "../LessonPlayer";
import { PracticeBlockPlaceholder } from "../PracticeBlockPlaceholder";
import { MatchingRenderer } from "./MatchingRenderer";
import { OrderingRenderer } from "./OrderingRenderer";
import { SelectionGridRenderer } from "./SelectionGridRenderer";
import { SelectionRenderer } from "./SelectionRenderer";

/**
 * PLAY-002/003 — the real `practiceRenderer` for `LessonPlayer`, dispatching
 * on `block.item.type`. `selection`/`selection_grid`/`ordering`/`matching`
 * have interactive renderers now; `slots` falls back to the PLAY-001
 * placeholder until PLAY-004 lands, same "renders something for every
 * authored block in order" contract PracticeBlockPlaceholder documents.
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
    default:
      return <PracticeBlockPlaceholder block={block} />;
  }
}
