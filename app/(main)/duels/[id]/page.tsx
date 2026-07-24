import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/queries";
import { getMyDuels } from "@/lib/duels";
import { DuelDetail } from "./DuelDetail";

export default async function DuelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getProfile();
  if (!profile) redirect("/login");

  // get_my_duels is RLS-scoped to the caller's own duels, so a duel the user
  // isn't part of simply isn't in the list — 404 covers both "no such duel" and
  // "not a participant". The list is small (capped, per-user), so filtering it
  // avoids a dedicated single-duel RPC.
  const duels = await getMyDuels().catch(() => []);
  const duel = duels.find((d) => d.duel_id === id);
  if (!duel) notFound();

  return <DuelDetail duel={duel} />;
}
