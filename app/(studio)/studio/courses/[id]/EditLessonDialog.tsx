"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { isValidLessonSlugFormat } from "@/lib/lessonSlug";
import type { AuthoredLesson } from "@/lib/courseAuthoring";
import { postJson } from "./postJson";

export function EditLessonDialog({
  courseId,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string;
  lesson: AuthoredLesson;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(lesson.estimatedMinutes?.toString() ?? "");
  const [slug, setSlug] = useState(lesson.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frozen = lesson.slugFrozenAt !== null;

  async function save() {
    if (!title.trim()) return;
    if (!frozen && !isValidLessonSlugFormat(slug)) {
      setError("Slug must be lowercase letters, numbers and hyphens only.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!frozen && slug !== lesson.slug) {
        await postJson(`/api/admin/courses/${courseId}/lessons/${lesson.id}/slug`, { slug });
      }
      const minutes = estimatedMinutes.trim() ? Number(estimatedMinutes) : undefined;
      await postJson(
        `/api/admin/courses/${courseId}/lessons/${lesson.id}`,
        { title, description, estimatedMinutes: minutes },
        "PATCH",
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lesson</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={120}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <div className="flex flex-col gap-1">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
              disabled={frozen}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              {frozen
                ? "Locked — this lesson has been published, so its URL can't change."
                : "Lowercase letters, numbers and hyphens only. Locks the first time this lesson is published."}
            </p>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
          />
          <input
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Estimated minutes (optional)"
            inputMode="numeric"
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
