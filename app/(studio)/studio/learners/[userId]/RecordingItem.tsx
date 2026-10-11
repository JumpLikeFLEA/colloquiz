import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { SignedAudio } from "@/app/components/voice/SignedAudio";
import type { RecordingRow } from "@/lib/learners/detail";
import { STATUS_LABEL, STATUS_PILL, weekLabel } from "../../reviews/statusLabels";

// One voice take on the learner page (learner_recordings(), 064): the
// player, and the feedback with its draft/published state. Read-only:
// feedback is written in the review queue, which the page links to, so
// there is one editor (docs/decisions/0119). Playback is a 15-minute signed
// URL under the editor's session, no download (0109 Decision 13).

export type RecordingItemRow = RecordingRow & { promptText: string; playbackUrl: string | null };

export function feedbackStatus(r: RecordingRow): "waiting" | "draft" | "answered" {
  if (!r.feedbackBody) return "waiting";
  return r.feedbackPublishedAt ? "answered" : "draft";
}

export function RecordingItem({ row, heading }: { row: RecordingItemRow; heading?: string }) {
  const status = feedbackStatus(row);
  return (
    <div className="space-y-3 min-w-0">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {heading && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text">{heading}</span>
          )}
          <span className="text-sm font-medium text-foreground">{row.lessonTitle}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_PILL[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {weekLabel(row.week)} · Sent <LocalTime iso={row.submittedAt} />
        </p>
      </div>

      {row.promptText && <p className="text-sm text-foreground whitespace-pre-line">{row.promptText}</p>}

      {row.recordingRemoved ? (
        <p className="text-sm text-muted-foreground">
          This recording was removed: recordings are deleted 6 months after the run ends. The learner did record it.
        </p>
      ) : (
        <SignedAudio submissionId={row.submissionId} initialUrl={row.playbackUrl} />
      )}

      {row.feedbackBody ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {row.feedbackPublishedAt ? "Feedback" : "Feedback draft: the learner can't see it yet"}
          </p>
          <div className="rounded-xl bg-brand-subtle px-4 py-3 text-sm text-foreground">
            <FeedbackContentView content={row.feedbackBody} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No feedback yet.</p>
      )}
    </div>
  );
}
