import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/groups";
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

  return <GroupDetailView detail={detail} userId={user.id} />;
}
