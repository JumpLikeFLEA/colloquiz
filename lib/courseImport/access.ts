import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { parseCourseImportMode, type CourseImportMode } from "./mode";

/**
 * Whether the caller may import a course, as the database says it (can_import_course(), 102): an
 * admin, or an active author seat with the flag. The Studio layout, the courses page and the
 * import pages ask this; none of them recomputes it. It decides what to show, not what may be
 * written: the upload URL, course_import_create and course_import_commit each check the grant
 * again. A failed read is "no", so a broken read hides the entry instead of offering one that
 * would be refused.
 */
export const canImportCourse = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_import_course");
  return !error && data === true;
});

/** The kill switch, read on the server (docs/decisions/0203 Decision 6). */
export function courseImportMode(): CourseImportMode {
  return parseCourseImportMode(process.env.COURSE_IMPORT_MODE);
}
