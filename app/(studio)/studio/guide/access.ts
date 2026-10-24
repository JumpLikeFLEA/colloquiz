import { notFound } from "next/navigation";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { canImportCourse } from "@/lib/courseImport/access";

// The Guide's gate (TCH-015). The Studio layout already 404s a non-editor; this
// repeats it for the page (the inbox does the same) and returns who is
// reading, so an article's audience (0206 Decision 8) is decided in one place.
export async function guideReader(): Promise<{ isAdmin: boolean; canImport: boolean }> {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();
  return { isAdmin: access.isAdmin, canImport: await canImportCourse() };
}
