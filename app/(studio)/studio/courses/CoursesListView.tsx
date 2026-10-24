"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, FileUp, Plus } from "lucide-react";
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
import { CEFR_LEVELS, type CefrLevel } from "@/lib/courseLevels";
import { pluralize } from "@/lib/format";
import { slugifyLessonTitle } from "@/lib/lessonSlug";
import type { AuthoredCourse } from "@/lib/courseAuthoring";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

const STATUS_STYLE: Record<AuthoredCourse["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-brand-subtle text-brand-text",
};

// Codes from create_course (067) that belong to the slug field, shown under
// it rather than in the dialog's general error box.
const SLUG_ERROR_CODES = new Set(["slug_taken", "invalid_slug"]);

// The slug follows the title (slugifyLessonTitle, docs/decisions/0125 D4)
// until the author types in the slug field. Clearing the slug field hands it
// back to the title (docs/decisions/0126).
function slugFromTitle(title: string): string {
  return title.trim() === "" ? "" : slugifyLessonTitle(title);
}

function CoursesListViewInner({ courses, canImport = false }: { courses: AuthoredCourse[]; canImport?: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!slug.trim() || !title.trim()) return;
    setSaving(true);
    setError(null);
    setSlugError(null);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, level, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ?? "Could not create the course.";
        if (SLUG_ERROR_CODES.has(data.code)) setSlugError(message);
        else setError(message);
        return;
      }
      setCreating(false);
      setSlug("");
      setSlugEdited(false);
      setTitle("");
      setDescription("");
      router.push(`/studio/courses/${data.courseId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Courses</h1>
          <p className="text-muted-foreground mt-1">
            Manage English mini-courses and their lesson lists.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* CNT-019: shown to a holder of the import grant (can_import_course(), read by the page). */}
          {canImport && (
            <Link
              href="/studio/imports/new"
              className="flex min-h-9 items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              <FileUp className="size-4" />
              Import from file
            </Link>
          )}
          <button
            onClick={() => setCreating(true)}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            <Plus className="size-4" />
            New course
          </button>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
          <BookOpen size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No courses yet. Create the first one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/studio/courses/${c.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center text-white text-xs font-medium shrink-0">
                {c.level}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[c.status]}`}>
                    {c.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.slug} · {pluralize(c.lessonCount, "lesson")}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>
              The slug becomes the course&rsquo;s URL segment and can&rsquo;t be changed later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugEdited) {
                  setSlug(slugFromTitle(e.target.value));
                  setSlugError(null);
                }
              }}
              placeholder="Title"
              maxLength={120}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
            <div className="flex flex-col gap-1">
              <input
                value={slug}
                onChange={(e) => {
                  const next = e.target.value.toLowerCase();
                  setSlugEdited(next !== "");
                  setSlug(next === "" ? slugFromTitle(title) : next);
                  setSlugError(null);
                }}
                placeholder="slug-like-this"
                aria-label="Slug"
                aria-invalid={slugError ? true : undefined}
                aria-describedby={slugError ? "new-course-slug-error" : undefined}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
                className={`px-3 py-2 rounded-lg border bg-background text-sm text-foreground outline-none font-mono ${slugError ? "border-destructive-border" : "border-border"}`}
              />
              {slugError && (
                <p id="new-course-slug-error" className="text-xs text-destructive-text">
                  {slugError}
                </p>
              )}
            </div>
            <Select value={level} onValueChange={(v) => setLevel(v as CefrLevel)}>
              <SelectTrigger className="w-full">
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
              onClick={() => setCreating(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={saving || slug.trim().length < 1 || title.trim().length < 1}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create course"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function CoursesListView(props: React.ComponentProps<typeof CoursesListViewInner>) {
  return (
    <WriteArea>
      <CoursesListViewInner {...props} />
    </WriteArea>
  );
}
