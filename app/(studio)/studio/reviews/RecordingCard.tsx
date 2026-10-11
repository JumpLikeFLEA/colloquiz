"use client";

import { useRouter } from "next/navigation";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { learnerLabel, type ReviewRow } from "@/lib/reviews/queue";
import { FeedbackEditor } from "./FeedbackEditor";
import { SignedAudio } from "@/app/components/voice/SignedAudio";
import { STATUS_LABEL, STATUS_PILL, weekLabel } from "./statusLabels";

// One row of review_queue() (062): a learner's voice task in one week. A
// take gets the player and the VOICE-002 editor; a slot with no take shows
// only its status. Saving goes through save_voice_feedback (060), which
// checks can_edit_course itself; the page then refreshes so the row's status
// and the learner × week table move with it.

export type RecordingCardRow = ReviewRow & { promptText: string; playbackUrl: string | null };

export function RecordingCard({ row }: { row: RecordingCardRow }) {
  const router = useRouter();
  const label = learnerLabel(row);

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground break-all">{label}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_PILL[row.status]}`}>
            {STATUS_LABEL[row.status]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground break-all">
          {label !== row.learnerEmail && <>{row.learnerEmail} · </>}
          {row.inviteeContact && <>{row.inviteeContact} · </>}
          {row.tier === "extended" ? "Extended" : "Basic"}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.courseTitle} · {row.runTitle || "Untitled run"} · {weekLabel(row.week)} · {row.lessonTitle}
        </p>
        {row.submittedAt ? (
          <p className="text-xs text-muted-foreground">
            Sent <LocalTime iso={row.submittedAt} />
          </p>
        ) : row.status === "not_open" ? (
          <p className="text-xs text-muted-foreground">
            Opens <LocalTime iso={row.opensAt} />
          </p>
        ) : null}
      </div>

      {row.promptText && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Task</p>
          <p className="text-sm text-foreground whitespace-pre-line">{row.promptText}</p>
        </div>
      )}

      {row.submissionId && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {row.recordingRemoved ? (
            <p className="text-sm text-muted-foreground">
              This recording was removed: recordings are deleted 6 months after the run ends.
            </p>
          ) : (
            <SignedAudio submissionId={row.submissionId} initialUrl={row.playbackUrl} />
          )}
          <FeedbackEditor
            initial={row.feedbackBody}
            publishedAt={row.feedbackPublishedAt}
            label={`Feedback for ${label}`}
            publishHint="Publishing shows it to the learner and locks their recording."
            onSave={async (body, publish) => {
              await postJson("/api/studio/reviews/feedback", { submissionId: row.submissionId, body, publish });
              router.refresh();
            }}
          />
        </div>
      )}
    </article>
  );
}
