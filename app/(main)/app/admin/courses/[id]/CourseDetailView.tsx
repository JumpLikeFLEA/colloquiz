"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Blocks, Pencil, Plus, UserMinus, UserPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/courseLevels";
import { pluralize } from "@/lib/format";
import type { AuthoredCourseDetail, AuthoredLesson } from "@/lib/courseAuthoring";

async function postJson(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function CourseDetailView({ detail, isAdmin }: { detail: AuthoredCourseDetail; isAdmin: boolean }) {
  const router = useRouter();
  const { course, lessons, editors } = detail;
  const [busy, setBusy] = useState(false);

  // Course metadata form
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [level, setLevel] = useState<CefrLevel>(course.level);
  const dirty = title !== course.title || description !== (course.description ?? "") || level !== course.level;

  async function saveMetadata() {
    setBusy(true);
    try {
      await postJson(`/api/admin/courses/${course.id}`, { title, description, level }, "PATCH");
      toast.success("Course updated.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    const next = course.status === "published" ? "draft" : "published";
    try {
      await postJson(`/api/admin/courses/${course.id}/status`, { status: next });
      toast.success(next === "published" ? "Course published." : "Course unpublished.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{course.slug}</p>
        </div>
        <button
          onClick={toggleStatus}
          disabled={busy}
          className={`cursor-pointer disabled:cursor-not-allowed shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            course.status === "published"
              ? "border border-border text-foreground hover:bg-accent"
              : "bg-brand text-white hover:bg-brand-hover"
          }`}
        >
          {course.status === "published" ? "Unpublish" : "Publish"}
        </button>
      </div>

      {/* Metadata */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Course details</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={120}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
        />
        <Select value={level} onValueChange={(v) => setLevel(v as CefrLevel)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CEFR_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={saveMetadata}
            disabled={busy || !dirty || !title.trim()}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        </div>
      </section>

      <LessonsSection courseId={course.id} lessons={lessons} onChanged={() => router.refresh()} />

      {isAdmin && <EditorsSection courseId={course.id} editors={editors} onChanged={() => router.refresh()} />}
    </div>
  );
}

function LessonsSection({
  courseId,
  lessons,
  onChanged,
}: {
  courseId: string;
  lessons: AuthoredLesson[];
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

  async function toggleFreeSample(lesson: AuthoredLesson) {
    setPendingId(lesson.id);
    try {
      await postJson(`/api/admin/courses/${courseId}/lessons/${lesson.id}/free-sample`, {
        inFreeSample: !lesson.inFreeSample,
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the free-sample flag.");
    } finally {
      setPendingId(null);
    }
  }

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

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm">
          No lessons yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {lessons.map((lesson, index) => (
            <div
              key={lesson.id}
              className={`flex items-center gap-3 px-4 py-3 ${pendingId === lesson.id ? "opacity-60" : ""} ${
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

              <div className="flex-1 min-w-0">
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
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {lesson.slug}
                  {lesson.estimatedMinutes ? ` · ${lesson.estimatedMinutes} min` : ""}
                </p>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                Free sample
                <Switch
                  checked={lesson.inFreeSample}
                  onCheckedChange={() => toggleFreeSample(lesson)}
                  disabled={pendingId !== null}
                />
              </label>

              <Link
                href={`/app/admin/courses/${courseId}/lessons/${lesson.id}`}
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
              <button
                onClick={() => (lesson.archivedAt ? toggleArchived(lesson) : setConfirmArchive(lesson))}
                disabled={pendingId !== null}
                aria-label={lesson.archivedAt ? `Restore ${lesson.title}` : `Archive ${lesson.title}`}
                className="cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                {lesson.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lesson</DialogTitle>
            <DialogDescription>The lesson&rsquo;s slug is generated from its title and can&rsquo;t change later.</DialogDescription>
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

      <AlertDialog open={confirmArchive !== null} onOpenChange={(open) => { if (!open) setConfirmArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {confirmArchive?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the lesson from the catalogue and the free sample. Existing purchasers
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

function EditLessonDialog({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
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

function EditorsSection({
  courseId,
  editors,
  onChanged,
}: {
  courseId: string;
  editors: AuthoredCourseDetail["editors"];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/admin/courses/${courseId}/editors`, { email });
      setAdding(false);
      setEmail("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add editor.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(userId: string) {
    setPendingId(userId);
    try {
      await postJson(`/api/admin/courses/${courseId}/editors/${userId}`, undefined, "DELETE");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove editor.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Editors</h2>
        <button
          onClick={() => setAdding(true)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
        >
          <UserPlus className="size-3.5" />
          Add editor
        </button>
      </div>

      {editors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No delegated editors — only admins can edit this course.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {editors.map((e) => (
            <div key={e.userId} className="flex items-center gap-3 px-4 py-3">
              <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                {e.displayName || e.fullName || e.userId}
              </p>
              <button
                onClick={() => revoke(e.userId)}
                disabled={pendingId !== null}
                aria-label={`Remove ${e.displayName || e.fullName || "editor"}`}
                className="cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive-text transition-colors disabled:opacity-50"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add editor</DialogTitle>
            <DialogDescription>They must already have a Colloquiz account.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
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
              onClick={() => setAdding(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={grant}
              disabled={saving || !email.trim()}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
