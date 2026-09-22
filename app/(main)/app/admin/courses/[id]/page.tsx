import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getAuthoredCourseDetail } from "@/lib/courseAuthoring";
import { CourseDetailView } from "./CourseDetailView";

// Admin-only — see app/(main)/app/admin/courses/page.tsx's header comment
// and docs/decisions/0025.
export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin privileges to access this page.
        </p>
      </div>
    );
  }

  const detail = await getAuthoredCourseDetail(id);
  if (!detail) notFound();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CourseDetailView detail={detail} />
    </div>
  );
}
