import type { PracticeRendererProps } from "../LessonPlayer";
import { PracticeBlockPlaceholder } from "../PracticeBlockPlaceholder";
import { SelectionGridRenderer } from "./SelectionGridRenderer";
import { SelectionRenderer } from "./SelectionRenderer";

/**
 * PLAY-002 — the real `practiceRenderer` for `LessonPlayer`, dispatching on
 * `block.item.type`. Only `selection`/`selection_grid` have interactive
 * renderers so far; `ordering`/`matching`/`slots` fall back to the PLAY-001
 * placeholder until PLAY-003/004 land, same "renders something for every
 * authored block in order" contract PracticeBlockPlaceholder documents.
 */
export function practiceRenderer({ block, attemptId, onScore }: PracticeRendererProps) {
  switch (block.item.type) {
    case "selection":
      return <SelectionRenderer item={block.item} attemptId={attemptId} onScore={onScore} />;
    case "selection_grid":
      return <SelectionGridRenderer item={block.item} onScore={onScore} />;
    default:
      return <PracticeBlockPlaceholder block={block} />;
  }
}
