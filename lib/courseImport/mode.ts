/**
 * The kill switch (docs/decisions/0203 Decision 6), read from COURSE_IMPORT_MODE. Anything but
 * `on` is `off`, so a missing or misspelt value fails closed: production stays off until
 * OPS-030's legal revision is published.
 */
export type CourseImportMode = "off" | "on";

export function parseCourseImportMode(raw: string | null | undefined): CourseImportMode {
  return raw?.trim().toLowerCase() === "on" ? "on" : "off";
}
