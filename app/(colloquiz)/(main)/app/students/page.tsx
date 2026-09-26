import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getLinkedStudents, getTutorAssignments } from "@/lib/author";
import { BecomeAuthorCard } from "@/app/components/BecomeAuthorCard";
import { StudentsView } from "./StudentsView";

export default async function StudentsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author, role")
    .eq("id", user.id)
    .single();
  const isAuthor = !!profile?.is_author || profile?.role === "admin";

  if (!isAuthor) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <BecomeAuthorCard />
      </div>
    );
  }

  const [students, assignments] = await Promise.all([
    getLinkedStudents(supabase, user.id),
    getTutorAssignments(supabase, user.id),
  ]);

  return <StudentsView students={students} assignments={assignments} />;
}
