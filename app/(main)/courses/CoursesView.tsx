import Link from "next/link";
import {
  Library,
  Calculator,
  BookOpen,
  ArrowRight,
  GraduationCap,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import type { CourseCard, EnrolledCourse } from "@/lib/courses";
import { pluralize } from "@/lib/format";

// Local name→component map, same pattern as SubjectGrid. Courses store a lucide
// icon name; anything unrecognized falls back to a book.
const ICON_MAP: Record<string, LucideIcon> = {
  Calculator,
  Library,
  BookOpen,
  GraduationCap,
};

export function CoursesView({
  courses,
  enrolled,
}: {
  courses: CourseCard[];
  enrolled: EnrolledCourse[];
}) {
  const enrolledIds = new Set(enrolled.map((c) => c.id));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Courses</h1>
        <p className="text-muted-foreground mt-1">
          Structured, stage-by-stage learning — theory, practice, and a check that unlocks the next
          stage.
        </p>
      </div>

      {enrolled.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Continue learning
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {enrolled.map((c) => (
              <ContinueCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {enrolled.length > 0 && (
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            All courses
          </h2>
        )}
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
            <Library size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No courses are available yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((c) => (
              <CatalogueCard key={c.id} course={c} enrolled={enrolledIds.has(c.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ContinueCard({ course }: { course: EnrolledCourse }) {
  const Icon = ICON_MAP[course.icon ?? ""] ?? BookOpen;
  const done = course.next === null;
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card hover:border-brand-border transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-subtle text-brand-text flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{course.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {course.completedStages} of {course.totalStages} stages complete
          </p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${course.percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-success font-medium">
            <CheckCircle2 size={15} /> Course complete
          </span>
        ) : (
          <span className="text-muted-foreground truncate">
            Next: <span className="text-foreground">{course.next!.title}</span>
          </span>
        )}
        <ArrowRight
          size={16}
          className="shrink-0 text-muted-foreground group-hover:text-brand-text transition-colors"
        />
      </div>
    </Link>
  );
}

function CatalogueCard({ course, enrolled }: { course: CourseCard; enrolled: boolean }) {
  const Icon = ICON_MAP[course.icon ?? ""] ?? BookOpen;
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card hover:border-brand-border transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-subtle text-brand-text flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        {enrolled && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text border border-brand-border">
            Enrolled
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{course.title}</p>
        {course.subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{course.subtitle}</p>
        )}
      </div>

      {course.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
      )}

      <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <BookOpen size={13} />
        {pluralize(course.stageCount, "stage")}
      </div>
    </Link>
  );
}
