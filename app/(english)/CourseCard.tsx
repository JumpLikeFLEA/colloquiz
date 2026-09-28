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
 *
 * Below `sm` this renders as a compact row (small square cover, text beside
 * it) instead of the stacked card, per the landing-page design import
 * (2026-09-28, option 1a "Catalogue-first") — a column of full-width stacked
 * cards on a 390px screen was mostly whitespace per card. `sm:` and up is
 * the original stacked layout, unchanged. No free/paid badge was ported from
 * that design: `CatalogueCourse` carries no such field, and decision 0070
 * scoped the card to cover/title/description only.
 */
export function CourseCard({ course }: { course: CatalogueCourse }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex flex-row gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-accent sm:flex-col sm:gap-3 sm:p-4"
    >
      <div className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-muted sm:aspect-video sm:h-auto sm:w-full">
        {course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 80px"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground sm:text-sm">
            {alliengllCopy.course.noCover}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text">
          {course.level}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{course.title}</h2>
        {course.subtitle && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{course.subtitle}</p>
        )}
      </div>
    </Link>
  );
}
