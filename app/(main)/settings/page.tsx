import { getUser } from "@/lib/supabase/queries";
import { redirect } from "next/navigation";
import { SettingsView } from "./SettingsView";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return <SettingsView />;
}
