import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  toMessage,
  toThread,
  type ConversationMessage,
  type MessageRow,
  type Thread,
  type ThreadRole,
  type ThreadRow,
} from "./messages";

// TCH-004 — the reads behind /my/messages, /studio/messages and the unread
// dot (079, docs/decisions/0151). teacher_conversations and teacher_messages
// have no grants: every read goes through a SECURITY DEFINER function that
// scopes by auth.uid() being a party to the conversation.

/** The caller's threads in one role. cache(): the Studio layout's badge and
 * the inbox page read the same rows in one request (0151 Decision 7). */
export const getThreads = cache(async (role: ThreadRole): Promise<Thread[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("message_threads", { p_as: role });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ThreadRow[]).map(toThread);
});

/** The messages of one (teacher, student) conversation, oldest first. Empty
 * for anyone who isn't a party. */
export async function getConversationMessages(teacherId: string, studentId: string): Promise<ConversationMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conversation_messages", {
    p_teacher: teacherId,
    p_student: studentId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

/** Marks the other party's messages read. Call it AFTER the read above, so the
 * page still knows which messages were new. A failure is logged, not thrown:
 * a message left unread is cheaper than a thread that won't open. */
export async function markConversationRead(teacherId: string, studentId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_conversation_read", { p_teacher: teacherId, p_student: studentId });
  if (error) console.error("mark_conversation_read failed", error.message);
}

/**
 * Unread teacher replies for the signed-in learner, for the account chip's dot
 * and /my. Fail-soft on purpose: this runs in the chrome of every English page
 * for a signed-in user, so a missing function (079 not yet applied) or a
 * transient error must cost a dot, not the page.
 */
export async function getUnreadMessageCount(
  supabase?: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  try {
    const client = supabase ?? (await createClient());
    const { data, error } = await client.rpc("my_unread_message_count");
    if (error) {
      console.error("my_unread_message_count failed", error.message);
      return 0;
    }
    return typeof data === "number" && data > 0 ? data : 0;
  } catch (e) {
    console.error("my_unread_message_count threw", e);
    return 0;
  }
}
