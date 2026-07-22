import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/groups";
import { GroupsView } from "./GroupsView";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groups = await getMyGroups(supabase, user.id);

  return <GroupsView groups={groups} />;
}
