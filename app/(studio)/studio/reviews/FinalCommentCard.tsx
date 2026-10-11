"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { learnerLabel, type FinalCommentRow } from "@/lib/reviews/queue";
import { FeedbackEditor } from "./FeedbackEditor";

// COH-005's final comment, written here (VOICE-006) in VOICE-002's shape
// through save_final_comment (061), which checks can_edit_course and
// refuses a revoked enrolment. Collapsed by default: a run's comments are
// written once, at its end, so a list of open editors would bury the queue.

export function FinalCommentCard({ row }: { row: FinalCommentRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const label = learnerLabel(row);
  const state = row.publishedAt ? "Published" : row.body ? "Draft" : "Not written";
  const pill = row.publishedAt
    ? "bg-brand-subtle text-brand-text"
    : row.body
      ? "bg-warning-subtle text-warning"
      : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="cursor-pointer flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-foreground truncate">{label}</span>
          <span className="block text-xs text-muted-foreground truncate">
            {row.courseTitle} · {row.runTitle || "Untitled run"}
          </span>
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${pill}`}>{state}</span>
        <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <FeedbackEditor
            initial={row.body}
            publishedAt={row.publishedAt}
            label={`Final comment for ${label}`}
            publishHint="Publishing shows it on the learner's final screen."
            onSave={async (body, publish) => {
              await postJson("/api/studio/reviews/final-comment", { enrolmentId: row.enrolmentId, body, publish });
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
