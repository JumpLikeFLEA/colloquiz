import Image from "next/image";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { CatalogueCourse } from "@/lib/courseCatalogue";
import { pluralize } from "@/lib/pluralCategory";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy } from "./landingCopy";

/**
 * SHELL-010 — one catalogue card: cover, level, title, summary
 * (docs/handoff.md, "Catalogue shape"), plus a size line — "5 lessons ·
 * ~60 min" — added by docs/decisions/0078, superseding 0070's
 * cover/title/description-only scope. The counts come from
 * lib/catalogueSummary.ts (published, non-archived lessons only); minutes
 * are omitted when any lesson has no estimate. Still no free/paid badge:
 * that is entitlement display, which is a separate decision.
 *
 * Below `sm` this renders as a compact row (small square cover, text beside
 * it) instead of the stacked card, per the landing-page design import
 * (2026-09-28, option 1a "Catalogue-first") — a column of full-width stacked
 * cards on a 390px screen was mostly whitespace per card.
 *
 * A course with no cover gets a tile showing its level (0078) instead of the
 * grey "no cover" caption, which read as a broken image in a grid of real
 * covers; since SHELL-027 (docs/decisions/0165) it is a grid-paper tile with
 * the level in the display face, not a gradient. The card has the Alina Cher
 * ink outline and offset shadow; hover lifts it and slowly zooms the cover,
 * both dropped under prefers-reduced-motion.
 */
export function CourseCard({ course, lang }: { course: CatalogueCourse; lang: SurfaceLang }) {
  const t = landingCopy[lang];
  const meta =
    course.lessonCount > 0
      ? `${course.lessonCount} ${pluralize(course.lessonCount, lang, t.lessons)}${
          course.totalMinutes !== null ? ` · ~${course.totalMinutes} ${t.minutes}` : ""
        }`
      : null;

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex h-full flex-row gap-3 rounded-2xl border-2 border-ink bg-card p-3 shadow-offset outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--offset-shadow)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:flex-col sm:p-4"
    >
      <div className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-muted sm:aspect-video sm:h-auto sm:w-full">
        {course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 80px"
          />
        ) : (
          <div className="grid-paper relative flex h-full items-center justify-center overflow-hidden bg-brand-subtle">
            <span className="relative font-display text-lg font-extrabold tracking-tight text-brand-text sm:text-4xl">
              {course.level}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="inline-flex w-fit items-center rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
          {course.level}
        </span>
        <h3 className="text-sm font-bold text-foreground sm:text-base">{course.title}</h3>
        {course.subtitle && <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{course.subtitle}</p>}
        {meta && (
          <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
            {meta}
          </p>
        )}
      </div>
    </Link>
  );
}
