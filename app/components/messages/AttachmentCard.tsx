import { attachmentPath, attachmentView, type Attachment } from "@/lib/askTeacher/snapshot";

/**
 * TCH-006 (docs/decisions/0153) — the exercise or voice task a student asked
 * about, as a read-only card: the course and lesson, "Exercise N" (or "Voice
 * task"), the prompt, what the exercise offered, and the student's answer if
 * they included it. A link to the lesson when `linked`, so a thread can take
 * either party there; the composer's preview passes `linked={false}`.
 *
 * Server-safe (no hooks): the threads render it on the server, the composer
 * dialog on the client. Everything shown is plain text from lib/askTeacher;
 * nothing is parsed as HTML and no answer key is drawn (see `exerciseLines`).
 * Labels are props so neither language ships in a bundle that doesn't need it.
 */
export type AttachmentLabels = {
  exercise: string;
  voiceTask: string;
  answer: string;
  answerNotIncluded: string;
  answerUnreadable: string;
  exerciseUnreadable: string;
};

export function AttachmentCard({
  attachment,
  labels,
  linked = true,
}: {
  attachment: Attachment;
  labels: AttachmentLabels;
  linked?: boolean;
}) {
  const view = attachmentView(attachment);
  const heading = view.kind === "voice_task" ? labels.voiceTask : `${labels.exercise} ${view.number ?? ""}`.trim();
  const header = (
    <>
      <span className="block truncate text-xs text-muted-foreground">
        {attachment.courseTitle} · {attachment.lessonTitle}
      </span>
      <span className="block text-sm font-semibold text-foreground">{heading}</span>
    </>
  );

  return (
    <div data-attachment={attachment.kind} className="min-w-0 rounded-xl border border-border bg-card p-3 text-sm text-foreground">
      {linked ? (
        <a
          href={attachmentPath(attachment)}
          className="block rounded-lg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {header}
        </a>
      ) : (
        <div>{header}</div>
      )}

      {view.prompt === "" ? (
        <p className="mt-2 text-muted-foreground">{labels.exerciseUnreadable}</p>
      ) : (
        <p className="mt-2 break-words font-medium">{view.prompt}</p>
      )}
      {view.lines.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 break-words pl-5 text-muted-foreground">
          {view.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {view.kind === "exercise" && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-xs font-semibold text-muted-foreground">{labels.answer}</p>
          {view.answer.status === "ok" ? (
            <ul className="mt-1 space-y-0.5 break-words">
              {view.answer.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {view.answer.status === "unreadable" ? labels.answerUnreadable : labels.answerNotIncluded}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
