import { WritingCard } from "./WritingCard";
import type { WritingTaskBlock } from "@/lib/lessons";
import { writingDraftKey } from "@/lib/writing/draftStore";
import type { WritingTasksContext } from "@/lib/writing/state";

/**
 * A writing task (WRITE-001, WRITE-002, docs/decisions/0225). LessonPlayer
 * loads this module with `next/dynamic`, so a lesson without a writing task
 * downloads none of it. This file is the chunk's entry; the card is a client
 * component.
 *
 * `context` is what the lesson page read for a signed-in learner on a lesson
 * with a ticked task; without it (a visitor, the Studio preview, a failed
 * read) the card is practice mode.
 */
export function WritingTaskBlockView({
  block,
  lessonPath,
  context,
}: {
  block: WritingTaskBlock;
  lessonPath: string;
  context?: WritingTasksContext;
}) {
  return (
    <WritingCard
      block={block}
      draftKey={lessonPath ? writingDraftKey(lessonPath, block.id) : null}
      state={context?.blocks[block.id]}
      lessonId={context?.lessonId}
    />
  );
}
