import Link from "next/link";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { learnerLabel } from "@/lib/reviews/queue";
import type { AcquisitionSource, RosterRow } from "@/lib/learners/roster";

// One row of learner_roster() (063): a learner in one course (and one run,
// if enrolled). Every number comes from SQL; this only lays it out. The
// label opens the learner page (AUTH-013). The
// fields are privacy-policy.md section 5's "Course authors" list, no more:
// no scores (docs/decisions/0109 Decision 8).

const SOURCE_LABEL: Record<AcquisitionSource, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  direct: "Direct link",
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function LearnerCard({ row }: { row: RosterRow }) {
  const label = learnerLabel(row);
  const revoked = row.enrolmentRevokedAt !== null;

  return (
    <article className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground break-all">
            <Link href={`/studio/learners/${row.userId}`} className="hover:underline">
              {label}
            </Link>
          </h3>
          {row.tier && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
              {row.tier === "extended" ? "Extended" : "Basic"}
            </span>
          )}
          {revoked && (
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">Revoked</span>
          )}
        </div>
        {(label !== row.learnerEmail || row.inviteeContact) && (
          <p className="text-xs text-muted-foreground break-all">
            {label !== row.learnerEmail && row.learnerEmail}
            {label !== row.learnerEmail && row.inviteeContact && " · "}
            {row.inviteeContact}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {row.courseTitle} · {row.enrolmentId ? row.runTitle || "Untitled run" : "Not in a run"}
        </p>
        <p className="text-xs text-muted-foreground">
          Came from:{" "}
          {row.acquisitionSource ? (
            <>
              {SOURCE_LABEL[row.acquisitionSource]}
              {row.acquisitionCourseTitle && <> · {row.acquisitionCourseTitle}</>}
            </>
          ) : (
            "not recorded"
          )}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
        <Stat label="Lessons opened">
          {row.lessonsOpened} of {row.lessonsTotal}
        </Stat>
        <Stat label="Lessons completed">
          {row.lessonsCompleted} of {row.lessonsTotal}
        </Stat>
        <Stat label="Recordings">
          {row.enrolmentId ? (
            <>
              {row.voicesSent} sent · {row.voicesAnswered} answered
            </>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Last active">{row.lastActivityAt ? <LocalTime iso={row.lastActivityAt} /> : "—"}</Stat>
      </dl>
    </article>
  );
}
