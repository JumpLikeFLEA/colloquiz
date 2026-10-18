import { createClient } from "@/lib/supabase/server";
import { toCourseListingRow, type CourseListingRow } from "./listedCourses";

// TCH-010 — the admin's course list with the listed flag (088). The RPC raises
// for a non-admin caller, so this never returns a course to anyone else.
export async function getCourseListing(): Promise<CourseListingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_courses_listing");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toCourseListingRow);
}
