import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, FilePenLine, MessageSquare, Mic, type LucideIcon } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import {
  ageLabel,
  CALL_WINDOW_DAYS,
  finalDraftGroups,
  upcomingCalls,
  voiceDraftGroups,
  waitingGroups,
  type InboxGroup,
} from "@/lib/studio/inbox";
import { LocalTime, LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { weekLabel } from "./reviews/statusLabels";
import { threadPath, unansweredThreads } from "@/lib/messages/messages";
import { getDraftRows, getEditorCalls, getTeacherThreads, getWaitingRows } from "./inboxData";

// /studio — the "Needs attention" inbox (AUTH-012, docs/decisions/0109
// Decision 5, 0118), across every course the caller edits. Rows come from
// review_queue() / review_final_comments() (062) and course_calls() (058),
// which return only courses the caller edits; getCourseAccess() is the page
// gate (the layout's too), not the data boundary. The waiting list and the
// nav badge read the same cached call (inboxData.ts).

export const metadata = { title: "Inbox" };

const EMPTY_BOX =
  "flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4";

function plural(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/** Course · run. An untitled run is named by its start date, so two
 * untitled runs of one course don't read as the same row. */
function RunLabel({ g }: { g: { courseTitle: string; runTitle: string | null; runStartsAt: string } }) {
  return (
    <>
      {g.courseTitle} ·{" "}
      {g.runTitle || (
        <>
          run from <LocalTime iso={g.runStartsAt} dateOnly />
        </>
      )}
    </>
  );
}

function RowLink({
  href,
  icon: Icon,
  title,
  detail,
  pill,
}: {
  href: string;
  icon: LucideIcon;
  title: React.ReactNode;
  detail: React.ReactNode;
  pill?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
        <Icon size={16} />
      </div>
      {/* The pill drops under the text below sm: beside it, it squeezed the
          title into a narrow column at 360px. */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground break-words">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {pill && (
          <span className="self-start sm:self-auto text-xs px-2 py-0.5 rounded-full shrink-0 bg-warning-subtle text-warning">
            {pill}
          </span>
        )}
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </Link>
  );
}

function GroupRow({
  group,
  icon,
  noun,
  nouns,
  verb,
  showWeek = true,
  now,
}: {
  group: InboxGroup;
  icon: LucideIcon;
  noun: string;
  nouns: string;
  verb: string;
  /** Final comments belong to a run, not a week. */
  showWeek?: boolean;
  now: Date;
}) {
  const title = (
    <>
      <RunLabel g={group} />
      {showWeek && <> · {weekLabel(group.week)}</>}
    </>
  );
  return (
    <RowLink
      href={group.href}
      icon={icon}
      title={title}
      detail={`Oldest ${verb} ${ageLabel(group.oldestAt, now)} ago`}
      pill={plural(group.count, noun, nouns)}
    />
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        {title} <span className="text-muted-foreground font-normal">({count})</span>
      </h2>
      {children}
    </section>
  );
}

export default async function StudioInbox() {
  const access = await getCourseAccess();
  if (!access.isAdmin && access.editableCourseIds.length === 0) notFound();

  const [waitingRows, drafts, calls, threads] = await Promise.all([
    getWaitingRows(),
    getDraftRows(),
    getEditorCalls(access),
    getTeacherThreads(),
  ]);
  // The request's clock, read once so every age and the call window agree.
  const now = new Date();

  const waiting = waitingGroups(waitingRows);
  const waitingTotal = waiting.reduce((n, g) => n + g.count, 0);
  const voiceDrafts = voiceDraftGroups(drafts.voice);
  const finalDrafts = finalDraftGroups(drafts.final);
  const draftTotal = [...voiceDrafts, ...finalDrafts].reduce((n, g) => n + g.count, 0);
  const soon = upcomingCalls(calls, now);

  // "Unanswered" is decided in SQL (message_threads, 079): the last message is
  // the student's and the link is live. null: the read failed (see inboxData).
  const questions = threads ? unansweredThreads(threads) : null;

  const nothing =
    waiting.length === 0 &&
    voiceDrafts.length === 0 &&
    finalDrafts.length === 0 &&
    soon.length === 0 &&
    questions !== null &&
    questions.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Needs attention</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recordings waiting for your feedback, questions from your students, drafts you haven&apos;t published, and
          calls coming up, across every course you edit.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Times are in your timezone (<LocalTimeZone />).
        </p>
      </div>

      {nothing ? (
        <div className={EMPTY_BOX}>
          Nothing needs your attention. New recordings, drafts and calls in the next {CALL_WINDOW_DAYS} days show up
          here.
        </div>
      ) : (
        <>
          <Section title="Waiting for feedback" count={waitingTotal}>
            {waiting.length === 0 ? (
              <div className={EMPTY_BOX}>No recordings waiting for feedback.</div>
            ) : (
              <div className="space-y-2">
                {waiting.map((g) => (
                  <GroupRow
                    key={g.href}
                    group={g}
                    icon={Mic}
                    noun="recording"
                    nouns="recordings"
                    verb="sent"
                    now={now}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Unanswered questions" count={questions?.length ?? 0}>
            {questions === null ? (
              <div className={EMPTY_BOX}>Couldn&apos;t load your students&apos; messages. Try again in a moment.</div>
            ) : questions.length === 0 ? (
              <div className={EMPTY_BOX}>No unanswered questions.</div>
            ) : (
              <div className="space-y-2">
                {questions.map((t) => (
                  <RowLink
                    key={t.peerId}
                    href={threadPath("teacher", t.peerId)}
                    icon={MessageSquare}
                    title={t.peerLabel}
                    detail={t.lastAt ? `Last message ${ageLabel(t.lastAt, now)} ago` : "No messages yet"}
                    pill={t.unreadCount > 0 ? `${t.unreadCount} unread` : undefined}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Unpublished drafts" count={draftTotal}>
            {voiceDrafts.length === 0 && finalDrafts.length === 0 ? (
              <div className={EMPTY_BOX}>No unpublished drafts.</div>
            ) : (
              <div className="space-y-2">
                {voiceDrafts.map((g) => (
                  <GroupRow
                    key={g.href}
                    group={g}
                    icon={FilePenLine}
                    noun="feedback draft"
                    nouns="feedback drafts"
                    verb="saved"
                    now={now}
                  />
                ))}
                {finalDrafts.map((g) => (
                  <GroupRow
                    key={g.href}
                    group={g}
                    icon={FilePenLine}
                    noun="final comment"
                    nouns="final comments"
                    verb="saved"
                    showWeek={false}
                    now={now}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title={`Calls in the next ${CALL_WINDOW_DAYS} days`} count={soon.length}>
            {soon.length === 0 ? (
              <div className={EMPTY_BOX}>No calls in the next {CALL_WINDOW_DAYS} days.</div>
            ) : (
              <div className="space-y-2">
                {soon.map((c) => (
                  <RowLink
                    key={c.callId}
                    href={`/studio/courses/${c.courseId}/runs`}
                    icon={CalendarClock}
                    title={c.title || "Call"}
                    detail={
                      <>
                        <LocalTime iso={c.startsAt} /> · <RunLabel g={c} />
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
