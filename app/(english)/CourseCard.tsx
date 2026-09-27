import Image from "next/image";
import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { CatalogueCourse } from "@/lib/courseCatalogue";

/**
 * SHELL-010 — one catalogue card: cover, title, summary
 * (docs/handoff.md, "Catalogue shape"). Cover/text layout mirrors the
 * `/courses/[courseSlug]` page's own cover block (aspect-video, rounded-2xl,
 * bg-muted fallback) so a tap into the course page reads as the same visual
 * object growing, not a different design taking over.
 */
export function CourseCard({ course }: { course: CatalogueCourse }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        {course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {alliengllCopy.course.noCover}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text">
          {course.level}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{course.title}</h2>
        {course.subtitle && <p className="text-xs text-muted-foreground">{course.subtitle}</p>}
      </div>
    </Link>
  );
}
