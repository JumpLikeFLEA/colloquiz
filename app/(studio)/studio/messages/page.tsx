import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MessageSquare } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { ageLabel } from "@/lib/studio/inbox";
import { getThreads } from "@/lib/messages/messagesServer";
import { threadPath, type Thread } from "@/lib/messages/messages";

// /studio/messages — the teacher's conversations, newest first, then the
// linked students they have not written to yet (TCH-004, docs/decisions/0151).
// Every row comes from message_threads('teacher') (079): who is a party, whether
// the link is live and what "unanswered" means are decided there. The nav badge
// and the inbox read the same call. getCourseAccess() is the page gate (the
// layout's too), not the data boundary.

export const metadata = { title: "Messages" };

const EMPTY_BOX =
  "flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4";

function detail(t: Thread, now: Date): string {
  if (!t.lastAt) return "No messages yet. Write the first one.";
  const age = `${ageLabel(t.lastAt, now)} ago`;
  return t.lastIsMine ? `You wrote last, ${age}` : `Last message ${age}`;
}

function ThreadRow({ t, now }: { t: Thread; now: Date }) {
  return (
    <Link
      href={threadPath("teacher", t.peerId)}
      prefetch={false}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
        <MessageSquare size={16} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground break-words">{t.peerLabel}</p>
          <p className="text-xs text-muted-foreground">{detail(t, now)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.unanswered && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-warning-subtle text-warning">Unanswered</span>
          )}
          {t.unreadCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text">
              {t.unreadCount} unread
            </span>
          )}
          {!t.isOpen && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">Closed</span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </Link>
  );
}

export default async function StudioMessages() {
  const access = await getCourseAccess();
  if (!access.isAdmin && access.editableCourseIds.length === 0) notFound();

  const threads = await getThreads("teacher");
  // The request's clock, read once so every age agrees.
  const now = new Date();
  const started = threads.filter((t) => t.conversationId);
  const notStarted = threads.filter((t) => !t.conversationId);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One conversation per linked student. Only you and the student can read it. A student who is no longer
          linked stays in the list, closed: readable, with no new messages.
        </p>
      </div>

      {threads.length === 0 ? (
        <div className={EMPTY_BOX}>
          No conversations yet. Students who link to you with your student link can write to you, and you can write
          to them first.
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Conversations <span className="text-muted-foreground font-normal">({started.length})</span>
            </h2>
            {started.length === 0 ? (
              <div className={EMPTY_BOX}>No conversations yet.</div>
            ) : (
              <div className="space-y-2">
                {started.map((t) => (
                  <ThreadRow key={t.peerId} t={t} now={now} />
                ))}
              </div>
            )}
          </section>

          {notStarted.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                Linked students you haven&apos;t written to{" "}
                <span className="text-muted-foreground font-normal">({notStarted.length})</span>
              </h2>
              <div className="space-y-2">
                {notStarted.map((t) => (
                  <ThreadRow key={t.peerId} t={t} now={now} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
