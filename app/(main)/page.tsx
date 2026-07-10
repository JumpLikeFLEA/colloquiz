import { getSubjects, getSubjectStats } from "@/lib/questions";
import { getMyAssignments, getMyCreatedQuizzes } from "@/lib/author";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { SubjectGrid, type SubjectCardData } from "@/app/components/SubjectGrid";
import { MyQuizzesRow, type MyQuizItem } from "@/app/components/MyQuizzesRow";

export default async function Home() {
  const subjects = getSubjects();
  const stats = await getSubjectStats();

  const cards: SubjectCardData[] = subjects
    .map((subject) => {
      const { count, difficulties } = stats[subject.id] ?? { count: 0, difficulties: [] };
      return {
        id: subject.id,
        name: subject.name,
        icon: subject.icon,
        color: subject.color,
        bg: subject.bg,
        questionCount: count,
        difficulties,
      };
    })
    .filter((card) => card.questionCount > 0);

  // Compact "My Quizzes" row: pending assignments first, then own quizzes.
  // getProfile() is deduped with the layout's call. Only authors have created
  // quizzes, so skip that query entirely for everyone else (matches my-quizzes).
  const profile = await getProfile();

  let myItems: MyQuizItem[] = [];
  if (profile) {
    const supabase = await createClient();
    const isAuthor = !!profile.is_author || profile.role === "admin";
    const [assignments, created] = await Promise.all([
      getMyAssignments(supabase, profile.id),
      isAuthor ? getMyCreatedQuizzes(supabase, profile.id) : Promise.resolve([]),
    ]);

    const pending: MyQuizItem[] = assignments
      .filter((a) => a.status === "assigned")
      .map((a) => ({
        quizId: a.quizId,
        title: a.quizTitle,
        subtitle: `from ${a.tutorName}`,
        badge: { label: "Assigned", className: "bg-amber-50 text-amber-600 border-amber-200" },
      }));

    const mine: MyQuizItem[] = created.map((q) => ({
      quizId: q.id,
      title: q.title,
      subtitle: `${q.questionCount} question${q.questionCount !== 1 ? "s" : ""}`,
      badge: { label: "Yours", className: "bg-indigo-50 text-indigo-500 border-indigo-200" },
    }));

    myItems = [...pending, ...mine].slice(0, 4);
  }

  return (
    <div className="flex flex-col gap-10">
      {myItems.length > 0 && <MyQuizzesRow items={myItems} />}
      <SubjectGrid subjects={cards} />
    </div>
  );
}
