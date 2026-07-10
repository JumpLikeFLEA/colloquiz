import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAssignments, getMyCreatedQuizzes, getLinkedStudents } from "@/lib/author";
import { getActiveSessionSummary } from "@/lib/quizSession";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { MyQuizzesView } from "./MyQuizzesView";

export default async function MyQuizzesPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const profile = await getProfile();
  const isAuthor = !!profile?.is_author || profile?.role === "admin";

  const [assignments, created, students, active] = await Promise.all([
    getMyAssignments(supabase, user.id),
    isAuthor ? getMyCreatedQuizzes(supabase, user.id) : Promise.resolve([]),
    isAuthor ? getLinkedStudents(supabase, user.id) : Promise.resolve([]),
    getActiveSessionSummary(supabase, user.id),
  ]);

  return (
    <MyQuizzesView
      isAuthor={isAuthor}
      assignments={assignments}
      created={created}
      students={students}
      active={active}
    />
  );
}
