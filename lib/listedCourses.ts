// TCH-010 (docs/decisions/0171) — what the admin's "Listed" switch reads and
// the messages for its refusals. Pure: whether a course may be listed is
// decided in SQL (088 set_course_listed); this only shapes the rows.

export type CourseListingRow = {
  courseId: string;
  slug: string;
  title: string;
  published: boolean;
  listed: boolean;
  /** The seat's public name, or null for a course with no author seat. */
  authorName: string | null;
  /** 'house' | 'teacher' | null. */
  authorKind: string | null;
};

export function toCourseListingRow(r: Record<string, unknown>): CourseListingRow {
  return {
    courseId: String(r.course_id),
    slug: String(r.slug),
    title: String(r.title),
    published: r.status === "published",
    listed: r.listed === true,
    authorName: typeof r.author_name === "string" ? r.author_name : null,
    authorKind: typeof r.author_kind === "string" ? r.author_kind : null,
  };
}

export const LISTING_ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "Only an admin can list a course." },
  course_not_found: { status: 404, message: "That course no longer exists." },
  not_published: { status: 409, message: "Publish the course before listing it in the catalogue." },
};

/** The line under a switch: what the state means for a visitor. */
export function listingHint(row: Pick<CourseListingRow, "published" | "listed">): string {
  if (!row.published) return "A draft cannot be listed.";
  return row.listed
    ? "Shown in the public catalogue and on the landing page."
    : "Opens by its link only. Not in the catalogue.";
}
