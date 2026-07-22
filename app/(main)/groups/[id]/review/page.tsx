import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup, getGroupReviewQueue } from "@/lib/groups";
import { GroupReviewView } from "./GroupReviewView";

export default async function GroupReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await getGroup(supabase, id, user.id);
  if (!detail) notFound();

  const items = await getGroupReviewQueue(supabase, id, user.id, detail.role);

  return <GroupReviewView groupId={id} groupName={detail.group.name} items={items} />;
}
