import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/groups";
import { getLeaderboard } from "@/lib/leaderboard";
import { getSubjects, getSubjectStats } from "@/lib/questions";
import { GroupDetailView } from "./GroupDetailView";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // getGroup returns null both when the group doesn't exist and when the
  // caller isn't a member — a stranger shouldn't be able to tell the two apart.
  const detail = await getGroup(supabase, id, user.id);
  if (!detail) notFound();

  // Fetched after the membership check: get_leaderboard enforces membership
  // itself, but there is no reason to ask for a board on a group we already
  // know the caller cannot see.
  // Degrades to an empty board rather than throwing — the group page's real job
  // is the roster and the quizzes, and neither should break if the leaderboard
  // does (or if this deploy lands before migration 016).
  const standings = await getLeaderboard({
    scope: "group",
    groupId: id,
    window: "all",
  }).catch(() => []);

  // Only subjects with questions can be duelled on — same filter the home grid
  // uses, so the dialog cannot offer a subject create_duel would reject.
  const stats = await getSubjectStats();
  const subjects = getSubjects()
    .filter((s) => (stats[s.id]?.count ?? 0) > 0)
    .map((s) => ({ id: s.id, name: s.name }));

  return (
    <GroupDetailView
      detail={detail}
      userId={user.id}
      standings={standings}
      subjects={subjects}
    />
  );
}
