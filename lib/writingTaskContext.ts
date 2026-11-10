import { failSoft } from "@/lib/failSoft";
import { createClient } from "@/lib/supabase/server";
import {
  parseWritingState,
  PRACTICE_STATE,
  sendingWritingBlockIds,
  type WritingTasksContext,
} from "@/lib/writing/state";

/**
 * WRITE-002 (docs/decisions/0225 Decision 7) — the lesson page's read of the
 * writing tasks that are sent to a teacher. Called only for a signed-in
 * visitor on a lesson whose document has such a task, so every other lesson
 * makes no extra read. writing_task_state calls the same _writing_route as
 * submit_writing_answer, so the card only ever offers what the send accepts.
 *
 * Fails soft: a task whose read fails (or whose migration 109 is not applied
 * yet, 0225 Decision 14) is practice mode, as WRITE-001 drew it.
 */
export async function getWritingTasksContext(
  lessonId: string,
  document: readonly unknown[],
): Promise<WritingTasksContext | undefined> {
  const ids = sendingWritingBlockIds(document);
  if (ids.length === 0) return undefined;
  const supabase = await createClient();
  const entries = await Promise.all(
    ids.map(async (blockId) => {
      const state = await failSoft(
        `failed to read writing_task_state for ${blockId}`,
        async () => {
          const { data, error } = await supabase.rpc("writing_task_state", { p_lesson_id: lessonId, p_block_id: blockId });
          if (error) throw new Error(error.message);
          return parseWritingState(data);
        },
        PRACTICE_STATE,
      );
      return [blockId, state] as const;
    }),
  );
  return { lessonId, blocks: Object.fromEntries(entries) };
}
