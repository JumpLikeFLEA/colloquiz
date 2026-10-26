import { notFound } from "next/navigation";
import { getCourseAccess } from "@/lib/courseAccess";
import { getCourseListing } from "@/lib/listedCoursesServer";
import { CourseListingPanel } from "./CourseListingPanel";

// /studio/catalogue — which published courses the public catalogue lists
// (TCH-010, docs/decisions/0171; its own page since docs/decisions/0208). Admin
// only: anyone else gets Studio's own 404, as on /studio/authors. The page gate
// is getCourseAccess(); the data boundary is admin_courses_listing() and
// set_course_listed() (088), which raise for a non-admin caller.

export const metadata = { title: "Catalogue" };

export default async function CataloguePage() {
  const access = await getCourseAccess();
  if (!access.isAdmin) notFound();

  const courses = await getCourseListing();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Catalogue</h1>
        <p className="text-sm text-muted-foreground">
          A teacher&apos;s published course opens by its link. It appears on the landing page and in the catalogue only
          when you list it here. Each course&apos;s editor has the same switch.
        </p>
      </div>
      <CourseListingPanel courses={courses} />
    </div>
  );
}
