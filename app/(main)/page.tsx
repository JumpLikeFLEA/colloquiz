import {
  getSubjects,
  getSubjectStats,
  getRecentlyPlayedSubjectIds,
} from "@/lib/questions";
import { getMyAssignments, getMyCreatedQuizzes } from "@/lib/author";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { SubjectGrid, type SubjectCardData } from "@/app/components/SubjectGrid";
import { parseDifficultyFilter } from "@/lib/difficultyFilter";
import { MyQuizzesRow, type MyQuizItem } from "@/app/components/MyQuizzesRow";

interface Props {
  searchParams: Promise<{ difficulty?: string }>;
}

export default async function Home({ searchParams }: Props) {
  const { difficulty: difficultyParam } = await searchParams;
  const difficulty = parseDifficultyFilter(difficultyParam);

  const subjects = getSubjects();

  // getProfile() is deduped with the layout's call, so this costs nothing.
  // Only authors have created quizzes, so skip that query for everyone else.
  const profile = await getProfile();
  const supabase = await createClient();
  const isAuthor = !!profile?.is_author || profile?.role === "admin";

  // One parallel round, nothing per-subject or per-card in it:
  //  - the grouped stats RPC (migration 008), one row per subject × difficulty
  //  - the recency probe that orders the grid
  //  - the My Quizzes rows
  const [stats, recentSubjectIds, assignments, created] = await Promise.all([
    getSubjectStats(),
    profile ? getRecentlyPlayedSubjectIds(supabase, profile.id) : Promise.resolve([]),
    profile ? getMyAssignments(supabase, profile.id) : Promise.resolve([]),
    profile && isAuthor ? getMyCreatedQuizzes(supabase, profile.id) : Promise.resolve([]),
  ]);

  const cards: SubjectCardData[] = subjects
    // The catalogue is "subjects that have questions at all", and difficulty
    // never shrinks it: a subject with too few at the selected difficulty is
    // rendered dimmed and inert instead of vanishing, so filtering can't make
    // the catalogue look smaller than it is.
    .filter((subject) => (stats[subject.id]?.count ?? 0) > 0)
    .map((subject) => {
      const stat = stats[subject.id];
      return {
        id: subject.id,
        name: subject.name,
        icon: subject.icon,
        color: subject.color,
        // The count has to be what a quiz at this difficulty would draw from,
        // otherwise "27 questions" under a Hard filter is simply wrong. Matches
        // sampleQuestions' filter (approved + shared, subject, difficulty).
        questionCount:
          difficulty === "any"
            ? (stat?.count ?? 0)
            : (stat?.byDifficulty[difficulty] ?? 0),
        difficulties: stat?.difficulties ?? [],
      };
    });

  // Display order: recently played first (most recent first), then everything
  // else alphabetically. Both inputs are difficulty-independent — recency comes
  // from results, the tail from the name — so changing the difficulty filter
  // moves counts and availability but never reshuffles the grid. No history
  // means an empty rank map, i.e. a fully alphabetical grid.
  const recentRank = new Map(recentSubjectIds.map((id, i) => [id, i]));
  cards.sort((a, b) => {
    const ra = recentRank.get(a.id);
    const rb = recentRank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

  // Compact "My Quizzes" row: pending assignments first, then own quizzes.
  const pending: MyQuizItem[] = assignments
    .filter((a) => a.status === "assigned")
    .map((a) => ({
      quizId: a.quizId,
      title: a.quizTitle,
      subtitle: `from ${a.tutorName}`,
      badge: { label: "Assigned", className: "bg-warning-subtle text-warning border-warning-border" },
    }));

  const mine: MyQuizItem[] = created.map((q) => ({
    quizId: q.id,
    title: q.title,
    subtitle: `${q.questionCount} question${q.questionCount !== 1 ? "s" : ""}`,
    badge: { label: "Yours", className: "bg-brand-subtle text-brand-text border-brand-border" },
  }));

  const myItems: MyQuizItem[] = [...pending, ...mine].slice(0, 4);

  return (
    <div className="flex flex-col gap-10">
      {myItems.length > 0 && <MyQuizzesRow items={myItems} />}
      <SubjectGrid subjects={cards} difficulty={difficulty} />
    </div>
  );
}
