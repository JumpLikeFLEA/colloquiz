import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAssignments, getMyCreatedQuizzes, getLinkedStudents } from "@/lib/author";
import { MyQuizzesView } from "./MyQuizzesView";

export default async function MyQuizzesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author, role")
    .eq("id", user.id)
    .single();
  const isAuthor = !!profile?.is_author || profile?.role === "admin";

  const [assignments, created, students] = await Promise.all([
    getMyAssignments(supabase, user.id),
    isAuthor ? getMyCreatedQuizzes(supabase, user.id) : Promise.resolve([]),
    isAuthor ? getLinkedStudents(supabase, user.id) : Promise.resolve([]),
  ]);

  return (
    <MyQuizzesView
      isAuthor={isAuthor}
      assignments={assignments}
      created={created}
      students={students}
    />
  );
}
