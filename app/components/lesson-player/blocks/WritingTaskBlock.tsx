import { WritingCard } from "./WritingCard";
import type { WritingTaskBlock } from "@/lib/lessons";
import { writingDraftKey } from "@/lib/writing/draftStore";

/**
 * A writing task (WRITE-001, docs/decisions/0225). LessonPlayer loads this
 * module with `next/dynamic`, so a lesson without a writing task downloads
 * none of it. This file is the chunk's entry; the card is a client component.
 *
 * Practice mode only: sending to a teacher is WRITE-002, so `sendToTeacher`
 * changes nothing the learner sees yet.
 */
export function WritingTaskBlockView({ block, lessonPath }: { block: WritingTaskBlock; lessonPath: string }) {
  return <WritingCard block={block} draftKey={lessonPath ? writingDraftKey(lessonPath, block.id) : null} />;
}
