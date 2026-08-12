import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { getMyDuels, getMyTier, sweepDuels } from "@/lib/duels";
import { getMyDuelTargets } from "@/lib/groups";
import { getSubjects, getSubjectStats } from "@/lib/questions";
import { DuelsView } from "./DuelsView";

export default async function DuelsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Settle overdue duels immediately for someone actively looking at their
  // inbox; periodic settling for everyone else is handled by pg_cron (migration
  // 033), so this no longer rides along on every navigation. Degrade to
  // empty/unranked rather than throwing, mirroring the leaderboard.
  await sweepDuels(supabase).catch(() => {});
  const [duels, myTier, targets] = await Promise.all([
    getMyDuels(supabase).catch(() => []),
    getMyTier().catch(() => ({
      tier: "unranked" as const,
      matches_played: 0,
      placement_remaining: 5,
    })),
    getMyDuelTargets(supabase, profile.id).catch(() => []),
  ]);

  // Only subjects with pool questions can be duelled on — same filter the group
  // dialog and home grid use, so the picker can't offer a subject create_duel
  // would reject.
  const stats = await getSubjectStats();
  const subjects = getSubjects()
    .filter((s) => (stats[s.id]?.count ?? 0) > 0)
    .map((s) => ({ id: s.id, name: s.name }));

  // Opponents the user already has an open (pending/active) duel with, so the
  // picker can disable them rather than let create_duel reject a second one.
  // RLS on duels already restricts this to the caller's own rows.
  const { data: openDuels } = await supabase
    .from("duels")
    .select("challenger_id, opponent_id")
    .in("status", ["pending", "active"]);
  const openOpponentIds = [
    ...new Set(
      (openDuels ?? []).map((d) =>
        d.challenger_id === profile.id ? (d.opponent_id as string) : (d.challenger_id as string),
      ),
    ),
  ];

  return (
    <DuelsView
      duels={duels}
      myTier={myTier}
      targets={targets}
      subjects={subjects}
      openOpponentIds={openOpponentIds}
    />
  );
}
