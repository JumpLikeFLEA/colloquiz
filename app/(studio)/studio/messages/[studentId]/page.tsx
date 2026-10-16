import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authUserFrom } from "@/lib/auth";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import { getConversationMessages, getThreads, markConversationRead } from "@/lib/messages/messagesServer";
import { PEER_ID_PATTERN } from "@/lib/messages/messages";
import { MessageComposer, type ComposerLabels } from "@/app/components/messages/MessageComposer";
import { MessageThread } from "@/app/components/messages/MessageThread";
import { attachmentLabelsEn } from "@/lib/alliengll/askTeacherCopy";

// /studio/messages/[studentId] — one conversation, as the TEACHER, keyed by
// the student's profile id (TCH-004, docs/decisions/0151 Decision 3). Keying by
// the student, not by a conversation id, is what lets the teacher write first:
// there is no conversation row until the first message. A student id that is
// neither linked to the caller nor in a conversation with them is a 404, the
// same answer as an id that does not exist. The thread and whether it is still
// open come from message_threads('teacher') and conversation_messages (079).
//
// The messages are read first so "New" can be shown, then marked read.

export const metadata = { title: "Messages" };

// Studio's chrome is English (docs/decisions/0109).
const COMPOSER: ComposerLabels = {
  label: "Your message",
  bold: "Bold",
  hint: "**bold** · blank line = new paragraph",
  send: "Send",
  sending: "Sending…",
  counter: "{n} / {max}",
  failed: "Could not send. Please try again.",
};

export default async function StudioMessageThread({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!PEER_ID_PATTERN.test(studentId)) notFound();

  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) notFound();

  const [threads, messages] = await Promise.all([getThreads("teacher"), getConversationMessages(user.id, studentId)]);
  const thread = threads.find((t) => t.peerId === studentId);
  if (!thread) notFound();

  if (messages.some((m) => !m.read)) await markConversationRead(user.id, studentId);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-3">
        <Link
          href="/studio/messages"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} aria-hidden />
          Messages
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground break-all">{thread.peerLabel}</h1>
          <p className="text-sm text-muted-foreground">Only you and this student can read this conversation.</p>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No messages yet. Write the first one.
        </div>
      ) : (
        <MessageThread
          messages={messages}
          locale="en-GB"
          labels={{
            you: "You",
            them: thread.peerLabel,
            newMessage: "New",
            unreadable: "This message can’t be shown.",
            attachment: attachmentLabelsEn,
            attachmentUnreadable: attachmentLabelsEn.unreadableAttachment,
          }}
        />
      )}

      {thread.isOpen ? (
        <MessageComposer teacherId={user.id} studentId={studentId} labels={COMPOSER} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          This conversation is closed: this student is no longer linked to you. You can read it, but it takes no new
          messages.
        </p>
      )}
    </div>
  );
}
