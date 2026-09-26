"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CloudUpload } from "lucide-react";
import { LESSON_HEADER_COLUMN_CLASS, LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

// AUTH-005 — preview through the REAL player (not a separate preview
// renderer, not sessionStorage): this is the same LessonPlayer/
// practiceRenderer pair the dev demo page uses (see
// LessonPlayerDemoClient.tsx, docs/decisions/0029 Decision 5 for why the
// function prop has to be wired up on the client side of the RSC boundary).
// `document` and `attemptId` are plain JSON, generated server-side in
// page.tsx and forwarded down unchanged.
//
// "Publish this version" lives HERE, not on the editor screen, so there is
// never any ambiguity about which version a click publishes — it is always
// exactly the `versionId` this screen was loaded with (page.tsx fetched that
// version's document by id, not "whatever's latest"). A newer draft saved
// after this screen loaded makes the publish call come back `stale`
// (migration 045's p_expected_version_id check), shown as a banner, not a
// silent publish of the wrong content.
export function PreviewClient({
  courseId,
  lessonId,
  versionId,
  document,
  attemptId,
}: {
  courseId: string;
  lessonId: string;
  versionId: string;
  document: unknown;
  attemptId: string;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [stale, setStale] = useState(false);
  const [published, setPublished] = useState(false);

  async function publish() {
    setPublishing(true);
    setStale(false);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/lessons/${lessonId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersionId: versionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setStale(true);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Could not publish.");
        return;
      }
      setPublished(true);
      toast.success("Published.");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="py-8">
      <div className={`${LESSON_HEADER_COLUMN_CLASS} mb-4 flex items-start justify-between gap-4`}>
        <div>
          <Link
            href={`/app/admin/courses/${courseId}/lessons/${lessonId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Back to editor
          </Link>
          <h1 className="text-xl font-semibold mt-1">Preview</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Exactly what publishing this version would show a learner.
          </p>
        </div>
        <button
          type="button"
          onClick={publish}
          disabled={publishing || published}
          className="cursor-pointer disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          <CloudUpload size={14} />
          {published ? "Published" : publishing ? "Publishing…" : "Publish this version"}
        </button>
      </div>

      {stale && (
        <div className={`${LESSON_HEADER_COLUMN_CLASS} mb-4`}>
          <div className="rounded-lg border border-destructive-border bg-destructive-subtle text-destructive-text px-4 py-3 text-sm flex items-center justify-between gap-3">
            <span>A newer draft was saved since this preview opened — reload and preview it before publishing.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer shrink-0 px-3 py-1.5 rounded-lg border border-destructive-border text-xs font-medium hover:bg-destructive-subtle-hover transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      <LessonPlayer document={document} attemptId={attemptId} practiceRenderer={practiceRenderer} />
    </div>
  );
}
