"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChartColumn, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import Image from "next/image";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/courseLevels";
import { COURSE_SUBTITLE_MAX_LENGTH } from "@/lib/courseCatalogue";
import { LESSON_IMAGE_BUCKET, lessonImageObjectPath, lessonImagePathFromUrl, validateLessonImageFile } from "@/lib/lessonImages";
import { createClient } from "@/lib/supabase/client";
import type { AuthoredCourseDetail } from "@/lib/courseAuthoring";
import { CoverImagePicker, type UploadCoverImage } from "./CoverImagePicker";
import { CourseFormatSection, type CourseRunSummary } from "./CourseFormatSection";
import { DeleteCourseSection } from "./DeleteCourseSection";
import { DuplicateDialog, type DuplicateTarget } from "./DuplicateDialog";
import { postJson } from "./postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";
import { EditorsSection } from "./EditorsSection";
import { LessonsSection } from "./LessonsSection";

function CourseDetailViewInner({
  detail,
  isAdmin,
  runs,
  deleteBlockers,
}: {
  detail: AuthoredCourseDetail;
  isAdmin: boolean;
  runs: CourseRunSummary;
  deleteBlockers: string[] | null;
}) {
  const router = useRouter();
  const { course, lessons, editors } = detail;
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState<DuplicateTarget | null>(null);

  // Course metadata form
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [level, setLevel] = useState<CefrLevel>(course.level);
  // subtitle is the catalogue-card short summary (CNT-009/AUTH-008; see the
  // AuthoredCourse comment in lib/courseAuthoring.ts for why the column is
  // named subtitle rather than "summary").
  const [subtitle, setSubtitle] = useState(course.subtitle ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(course.coverImageUrl);
  // The object a cover upload just replaced. Deletion is deferred to a
  // successful metadata save, mirroring LessonContentEditor's
  // pendingImageDeletions (AUTH-004/0037) — an unsaved cover swap must not
  // delete an object the course's last SAVED row still points at.
  const [pendingCoverDeletion, setPendingCoverDeletion] = useState<string | null>(null);
  const dirty =
    title !== course.title ||
    description !== (course.description ?? "") ||
    level !== course.level ||
    subtitle !== (course.subtitle ?? "") ||
    coverImageUrl !== course.coverImageUrl;

  const uploadCover: UploadCoverImage = async (file, previousUrl) => {
    const reason = validateLessonImageFile(file);
    if (reason) return { error: reason };

    const supabase = createClient();
    const path = lessonImageObjectPath(course.id, file.type, crypto.randomUUID());
    const { error: uploadError } = await supabase.storage
      .from(LESSON_IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { data: pub } = supabase.storage.from(LESSON_IMAGE_BUCKET).getPublicUrl(path);
    const previousPath = lessonImagePathFromUrl(previousUrl);
    if (previousPath) setPendingCoverDeletion(previousPath);
    return { url: pub.publicUrl };
  };

  async function saveMetadata() {
    setBusy(true);
    try {
      await postJson(
        `/api/admin/courses/${course.id}`,
        { title, description, level, subtitle: subtitle.trim() || null, coverImageUrl: coverImageUrl ?? null },
        "PATCH",
      );
      toast.success("Course updated.");
      if (pendingCoverDeletion) {
        // Best-effort, same as the lesson-image precedent: a failure here
        // costs a stray file in the bucket, not correctness of the save.
        const supabase = createClient();
        await supabase.storage.from(LESSON_IMAGE_BUCKET).remove([pendingCoverDeletion]);
        setPendingCoverDeletion(null);
      }
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
      <DuplicateDialog target={duplicating} onClose={() => setDuplicating(null)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground break-words">{course.title}</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{course.slug}</p>
          {/* AUTH-014: lesson funnel and per-exercise averages (0121). */}
          <Link
            href={`/studio/courses/${course.id}/stats`}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <ChartColumn className="size-3.5" />
            Stats
          </Link>
          {/* AUTH-022 (0214): a draft copy of the course, for another level or group. */}
          <button
            onClick={() => setDuplicating({ kind: "course", courseId: course.id, title: course.title })}
            className="cursor-pointer mt-3 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Copy className="size-3.5" />
            Duplicate
          </button>
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
        <div className="flex flex-col gap-1">
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Catalogue summary (required to publish)"
            maxLength={COURSE_SUBTITLE_MAX_LENGTH}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <p className="text-xs text-muted-foreground text-right">
            {subtitle.length}/{COURSE_SUBTITLE_MAX_LENGTH}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CoverImagePicker
            currentUrl={coverImageUrl ?? undefined}
            onUploaded={(url) => setCoverImageUrl(url)}
            onUpload={uploadCover}
          />
          {!coverImageUrl && <span className="text-xs text-muted-foreground">No cover yet — required to publish</span>}
        </div>
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

      {/* Catalogue-card preview (AUTH-008) — the shape docs/handoff.md
       * "Catalogue shape" describes (cover, title, short description), not a
       * final visual design: SHELL-010 builds the real card, this only lets
       * the partner see whether her cover and summary work before she
       * publishes. Composed from existing card classes, no new tokens. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Catalogue card preview</h2>
        <div className="max-w-sm rounded-2xl border border-border bg-card overflow-hidden">
          <div className="relative aspect-video bg-muted">
            {coverImageUrl ? (
              <Image src={coverImageUrl} alt="" fill className="object-cover" sizes="384px" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                No cover
              </div>
            )}
          </div>
          <div className="p-4 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{title || "Untitled course"}</h3>
            <p className="text-xs text-muted-foreground">
              {subtitle || <span className="italic">No summary yet</span>}
            </p>
          </div>
        </div>
      </section>

      <CourseFormatSection
        courseId={course.id}
        format={course.format}
        howToJoinUrl={course.howToJoinUrl}
        runs={runs}
        onChanged={() => router.refresh()}
      />

      <LessonsSection
        courseId={course.id}
        lessons={lessons}
        cohort={course.format === "cohort"}
        onChanged={() => router.refresh()}
      />

      {isAdmin && <EditorsSection courseId={course.id} editors={editors} onChanged={() => router.refresh()} />}

      {deleteBlockers && (
        <DeleteCourseSection courseId={course.id} courseTitle={course.title} blockers={deleteBlockers} />
      )}
    </div>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function CourseDetailView(props: React.ComponentProps<typeof CourseDetailViewInner>) {
  return (
    <WriteArea>
      <CourseDetailViewInner {...props} />
    </WriteArea>
  );
}
