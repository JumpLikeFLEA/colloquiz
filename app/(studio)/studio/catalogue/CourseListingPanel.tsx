import { ListedSwitch } from "@/app/(studio)/studio/courses/[id]/ListedSwitch";
import type { CourseListingRow } from "@/lib/listedCourses";

// TCH-010 (docs/decisions/0171) — the admin's catalogue list, on /studio/catalogue
// since docs/decisions/0208 (it was at the bottom of /studio/authors): one row per
// course with its author and the Listed switch. Server-rendered rows around the
// one client switch. Composed from the seat cards' classes and tokens; no new
// colours.
const PILL = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export function CourseListingPanel({ courses }: { courses: CourseListingRow[] }) {
  return (
    <section className="space-y-3" aria-label="Courses">
      {courses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No courses yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {courses.map((c) => (
            <li key={c.courseId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium text-foreground">{c.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`${PILL} ${c.published ? "bg-brand-subtle text-brand-text" : "bg-muted text-muted-foreground"}`}>
                    {c.published ? "Published" : "Draft"}
                  </span>
                  <span className="break-words">{c.authorName ? `By ${c.authorName}` : "No author seat"}</span>
                  {c.authorKind === "house" && <span className={`${PILL} bg-muted text-muted-foreground`}>House</span>}
                </div>
              </div>
              <div className="sm:max-w-xs">
                <ListedSwitch courseId={c.courseId} title={c.title} published={c.published} listed={c.listed} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
