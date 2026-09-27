import { createClient } from "@/lib/supabase/server";
import { ResetPasswordScreen } from "./ResetPasswordScreen";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <ResetPasswordScreen hasSession={!!user} />;
}
