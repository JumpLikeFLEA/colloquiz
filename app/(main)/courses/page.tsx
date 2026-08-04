import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getPublishedCourses, getMyEnrollments } from "@/lib/courses";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import { CoursesView } from "./CoursesView";

export default async function CoursesPage() {
  if (!COURSES_ENABLED) notFound(); // dormant until released — see lib/featureFlags.ts

  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // Both reads go through RLS as the caller. Enrollments degrade to an empty
  // list rather than breaking the catalogue if the progress RPC ever fails.
  const [courses, enrolled] = await Promise.all([
    getPublishedCourses(supabase),
    getMyEnrollments(supabase, user.id).catch(() => []),
  ]);

  return <CoursesView courses={courses} enrolled={enrolled} />;
}
