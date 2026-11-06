"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Blocks, Copy, Eye, Pencil, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/app/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { pluralize } from "@/lib/format";
import { LESSON_ACCESS_LEVELS, LESSON_ACCESS_LEVEL_LABELS, lessonsOpenToAnyone, type LessonAccessLevel } from "@/lib/lessonAccessLevels";
import type { AuthoredLesson } from "@/lib/courseAuthoring";
import { DuplicateDialog, type DuplicateTarget } from "./DuplicateDialog";
import { LessonWeekSelect } from "./LessonWeekSelect";
import { postJson } from "./postJson";
import { EditLessonDialog } from "./EditLessonDialog";

export function LessonsSection({
  courseId,
  lessons,
  cohort,
  onChanged,
}: {
  courseId: string;
  lessons: AuthoredLesson[];
  cohort: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AuthoredLesson | null>(null);
  // Only archiving (not restoring) is confirmed — restoring is purely
  // additive, undoing whatever archiving hid (docs/decisions/0025 Decision 4).
  const [confirmArchive, setConfirmArchive] = useState<AuthoredLesson | null>(null);
  const [duplicatingLesson, setDuplicatingLesson] = useState<DuplicateTarget | null>(null);

  async function createLesson() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons`, {
        title: newTitle,
        description: newDescription,
      });
      setAdding(false);
      setNewTitle("");
      setNewDescription("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create lesson.");
    } finally {
      setSaving(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const order = lessons.map((l) => l.id);
    [order[index], order[target]] = [order[target], order[index]];
    setPendingId(lessons[index].id);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons/reorder`, { lessonIds: order });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder lessons.");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleArchived(lesson: AuthoredLesson) {
    setPendingId(lesson.id);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons/${lesson.id}/archive`, {
        archived: !lesson.archivedAt,
      });
      toast.success(lesson.archivedAt ? "Lesson restored." : "Lesson archived.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update lesson.");
    } finally {
      setPendingId(null);
    }
  }

  // AUTH-009: set_lesson_access_level (055) is the authority. It refuses to
  // leave a published course with no lesson open to anyone, and that
  // refusal comes back here as the route's error message.
  async function setAccessLevel(lesson: AuthoredLesson, accessLevel: LessonAccessLevel) {
    if (accessLevel === lesson.accessLevel) return;
    setPendingId(lesson.id);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons/${lesson.id}/access-level`, { accessLevel });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change who can open this lesson.");
    } finally {
      setPendingId(null);
    }
  }

  // AUTH-010: set_lesson_week (058) is the authority, including the no-re-lock
  // rule (week_frozen) while a run is in progress.
  async function setWeek(lesson: AuthoredLesson, week: number | null) {
    if (week === lesson.week) return;
    setPendingId(lesson.id);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons/${lesson.id}/week`, { week });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change this lesson's week.");
    } finally {
      setPendingId(null);
    }
  }

  const openToAnyone = lessonsOpenToAnyone(lessons);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Lessons <span className="text-muted-foreground font-normal">({pluralize(lessons.length, "lesson")})</span>
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
        >
          <Plus className="size-3.5" />
          Add lesson
        </button>
      </div>

      {lessons.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Open to anyone:</span>{" "}
          {openToAnyone.length > 0
            ? openToAnyone.map((l) => l.title).join(", ")
            : cohort
              ? // 058 header §6: the open-lesson rule is self-paced only
                // (0094 Decision 2), so a cohort course may have none.
                "none."
              : "no lesson yet. A course needs at least one before it can be published."}
        </p>
      )}

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm">
          No lessons yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {lessons.map((lesson, index) => (
            <div
              key={lesson.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${pendingId === lesson.id ? "opacity-60" : ""} ${
                lesson.archivedAt ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || pendingId !== null}
                  aria-label="Move up"
                  className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === lessons.length - 1 || pendingId !== null}
                  aria-label="Move down"
                  className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="flex-1 min-w-48">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate">{lesson.title}</p>
                  {lesson.archivedAt && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      Archived
                    </span>
                  )}
                  {lesson.publishedVersionId ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text shrink-0">
                      Published · {lesson.publishedItemCount} items
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-warning-subtle text-warning shrink-0">
                      Unpublished
                    </span>
                  )}
                  {cohort && lesson.accessLevel === "entitled" && lesson.week === null && (
                    // publish_lesson refuses this lesson (week_required, 058).
                    <span className="text-xs px-2 py-0.5 rounded-full bg-warning-subtle text-warning shrink-0">
                      Needs a week
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {lesson.slug}
                  {lesson.estimatedMinutes ? ` · ${lesson.estimatedMinutes} min` : ""}
                </p>
              </div>

              {/* AUTH-009: the level control joined this row and made it
               * overflow at 390px, so the controls wrap below the title on a
               * narrow screen instead. */}
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
                {cohort && (
                  <LessonWeekSelect
                    lessonTitle={lesson.title}
                    week={lesson.week}
                    disabled={pendingId !== null}
                    onChange={(week) => setWeek(lesson, week)}
                  />
                )}
                <Select
                  value={lesson.accessLevel}
                  onValueChange={(v) => setAccessLevel(lesson, v as LessonAccessLevel)}
                  disabled={pendingId !== null}
                >
                  <SelectTrigger size="sm" className="w-40 shrink-0 text-xs" aria-label={`Who can open ${lesson.title}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_ACCESS_LEVELS.map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">
                        {LESSON_ACCESS_LEVEL_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {lesson.accessLevel !== "anyone" && (
                  <Link
                    href={`/studio/courses/${courseId}/lessons/${lesson.id}/visitor`}
                    aria-label={`What a visitor sees on ${lesson.title}`}
                    title="Visitor view"
                    className="cursor-pointer shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Eye size={14} />
                  </Link>
                )}

                <Link
                  href={`/studio/courses/${courseId}/lessons/${lesson.id}`}
                  aria-label={`Edit content for ${lesson.title}`}
                  className="cursor-pointer shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Blocks size={14} />
                </Link>
                <button
                  onClick={() => setEditing(lesson)}
                  aria-label={`Edit ${lesson.title}`}
                  className="cursor-pointer shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Pencil size={14} />
                </button>
                {!lesson.archivedAt && (
                  <button
                    onClick={() => setDuplicatingLesson({ kind: "lesson", courseId, lessonId: lesson.id, title: lesson.title })}
                    disabled={pendingId !== null}
                    aria-label={`Duplicate ${lesson.title}`}
                    title="Duplicate"
                    className="cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Copy size={14} />
                  </button>
                )}
                <button
                  onClick={() => (lesson.archivedAt ? toggleArchived(lesson) : setConfirmArchive(lesson))}
                  disabled={pendingId !== null}
                  aria-label={lesson.archivedAt ? `Restore ${lesson.title}` : `Archive ${lesson.title}`}
                  className="cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {lesson.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lesson</DialogTitle>
            <DialogDescription>
              The lesson&rsquo;s slug starts from its title. You can edit it afterwards — it locks the
              first time this lesson is published.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              maxLength={120}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
            />
            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setAdding(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createLesson}
              disabled={saving || !newTitle.trim()}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add lesson"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditLessonDialog
          courseId={courseId}
          lesson={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <DuplicateDialog target={duplicatingLesson} onClose={() => setDuplicatingLesson(null)} />

      <AlertDialog open={confirmArchive !== null} onOpenChange={(open) => { if (!open) setConfirmArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {confirmArchive?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the lesson from the catalogue and from visitors. Existing purchasers
              keep it — archiving never revokes access to a lesson someone already bought. You
              can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchive) toggleArchived(confirmArchive);
                setConfirmArchive(null);
              }}
              className="rounded-xl"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
