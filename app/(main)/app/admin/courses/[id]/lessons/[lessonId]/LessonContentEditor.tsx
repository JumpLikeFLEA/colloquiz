"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Eye, History } from "lucide-react";
import { parseLessonDocument, serializeLessonDocument, type LessonBlock } from "@/lib/lessons";
import { mapParseErrorsToFieldErrors, type LessonFieldErrorMap } from "@/lib/lessonEditorErrors";
import {
  LESSON_IMAGE_BUCKET,
  lessonImageObjectPath,
  lessonImagePathFromUrl,
  validateLessonImageFile,
} from "@/lib/lessonImages";
import { lessonPublishStatus } from "@/lib/lessonPublishStatus";
import { createClient } from "@/lib/supabase/client";
import type { LessonContentDraft, LessonVersionSummary } from "@/lib/lessonContentAuthoring";
import { BlockList } from "./BlockList";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import type { UploadLessonImage } from "./LessonImageUploadButton";

// Orchestrates the AUTH-002 block editor: holds the working document as
// plain client state (matching update_lesson's "whole document, not a
// per-block PATCH" convention already used by the lesson-list editor), and
// owns save (runs CNT-003, then save_lesson_version), the stale-save banner,
// and the version-history panel.

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function initialBlocks(document: unknown[]): LessonBlock[] {
  const parsed = parseLessonDocument(document);
  return parsed.ok ? parsed.document : [];
}

export function LessonContentEditor({
  courseId,
  draft,
  initialVersions,
}: {
  courseId: string;
  draft: LessonContentDraft;
  initialVersions: LessonVersionSummary[];
}) {
  const [blocks, setBlocks] = useState<LessonBlock[]>(() => initialBlocks(draft.document));
  const [baseVersionId, setBaseVersionId] = useState<string | null>(draft.baseVersionId);
  const [versions, setVersions] = useState<LessonVersionSummary[]>(initialVersions);
  const [fieldErrors, setFieldErrors] = useState<LessonFieldErrorMap>(new Map());
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Storage paths of images a save has replaced — see uploadLessonImage. Not
  // deleted immediately: an unsaved edit must not remove an object the
  // lesson's last SAVED version still points at. Cleared (best-effort) once
  // the save that replaced them actually succeeds.
  const [pendingImageDeletions, setPendingImageDeletions] = useState<string[]>([]);

  const documentErrors = fieldErrors.get("")?.get("") ?? [];
  const publishStatus = lessonPublishStatus(baseVersionId, draft.publishedVersionId);
  const PUBLISH_STATUS_LABEL: Record<typeof publishStatus, string> = {
    unpublished: "Unpublished",
    "published-current": "Published",
    "published-stale": "Unpublished changes",
  };
  const PUBLISH_STATUS_CLASS: Record<typeof publishStatus, string> = {
    unpublished: "bg-muted text-muted-foreground",
    "published-current": "bg-brand-subtle text-brand-text",
    "published-stale": "bg-warning-subtle text-warning",
  };

  function updateBlocks(next: LessonBlock[]) {
    setBlocks(next);
    setDirty(true);
  }

  const uploadLessonImage: UploadLessonImage = async (file, previousUrl) => {
    // Re-checked here (not just in the picker UI) so a caller can never skip
    // the client-side limits by constructing its own File. The bucket itself
    // (migration 041) enforces the same limits a third time.
    const reason = validateLessonImageFile(file);
    if (reason) return { error: reason };

    const supabase = createClient();
    const path = lessonImageObjectPath(courseId, file.type, crypto.randomUUID());
    const { error: uploadError } = await supabase.storage
      .from(LESSON_IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { data: pub } = supabase.storage.from(LESSON_IMAGE_BUCKET).getPublicUrl(path);
    const previousPath = lessonImagePathFromUrl(previousUrl);
    if (previousPath) setPendingImageDeletions((paths) => [...paths, previousPath]);
    return { url: pub.publicUrl };
  };

  async function refreshVersions() {
    const res = await fetch(`/api/admin/courses/${courseId}/lessons/${draft.lessonId}/versions`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setVersions(data.versions ?? []);
  }

  async function save() {
    setSaving(true);
    setStale(false);
    setFieldErrors(new Map());
    try {
      const { res, data } = await postJson(`/api/admin/courses/${courseId}/lessons/${draft.lessonId}/content`, {
        document: serializeLessonDocument(blocks),
        baseVersionId,
      });
      if (res.status === 422) {
        setFieldErrors(mapParseErrorsToFieldErrors(data.errors ?? []));
        toast.error("Some blocks have errors — see below.");
        return;
      }
      if (res.status === 409) {
        setStale(true);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Could not save.");
        return;
      }
      setBaseVersionId(data.versionId);
      setDirty(false);
      toast.success("Saved.");
      refreshVersions();

      if (pendingImageDeletions.length > 0) {
        // Best-effort, same as the avatar precedent: a failure here costs a
        // stray file in the bucket, not correctness of the saved lesson.
        const supabase = createClient();
        await supabase.storage.from(LESSON_IMAGE_BUCKET).remove(pendingImageDeletions);
        setPendingImageDeletions([]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function restore(versionId: string) {
    setRestoringId(versionId);
    try {
      const versionRes = await fetch(
        `/api/admin/courses/${courseId}/lessons/${draft.lessonId}/versions/${versionId}`,
      );
      const versionData = await versionRes.json().catch(() => ({}));
      if (!versionRes.ok) {
        toast.error(versionData.error ?? "Could not load that version.");
        return;
      }

      const { res, data } = await postJson(`/api/admin/courses/${courseId}/lessons/${draft.lessonId}/content`, {
        document: versionData.document,
        baseVersionId,
      });
      if (res.status === 409) {
        setStale(true);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Could not restore that version.");
        return;
      }

      setBlocks(initialBlocks(versionData.document));
      setBaseVersionId(data.versionId);
      setDirty(false);
      setFieldErrors(new Map());
      setHistoryOpen(false);
      toast.success("Restored as a new draft.");
      refreshVersions();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/app/admin/courses/${courseId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Back to course
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-bold text-foreground">{draft.lessonTitle}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PUBLISH_STATUS_CLASS[publishStatus]}`}>
              {PUBLISH_STATUS_LABEL[publishStatus]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {baseVersionId && (
            <Link
              href={`/app/admin/courses/${courseId}/lessons/${draft.lessonId}/preview?version=${baseVersionId}`}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
            >
              <Eye size={14} />
              Preview
            </Link>
          )}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            <History size={14} />
            History
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {stale && (
        <div className="rounded-lg border border-destructive-border bg-destructive-subtle text-destructive-text px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>This lesson changed elsewhere — reload and try again.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer shrink-0 px-3 py-1.5 rounded-lg border border-destructive-border text-xs font-medium hover:bg-destructive-subtle-hover transition-colors"
          >
            Reload
          </button>
        </div>
      )}

      {documentErrors.length > 0 && (
        <div className="rounded-lg border border-destructive-border bg-destructive-subtle text-destructive-text px-4 py-3 text-sm space-y-1">
          {documentErrors.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      )}

      <BlockList blocks={blocks} onChange={updateBlocks} fieldErrors={fieldErrors} onUploadImage={uploadLessonImage} />

      <VersionHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        versions={versions}
        currentVersionId={baseVersionId}
        onRestore={restore}
        restoringId={restoringId}
      />
    </div>
  );
}
