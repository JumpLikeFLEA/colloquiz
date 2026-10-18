import { createClient } from "@/lib/supabase/server";

/**
 * Whether the signed-in user has reminders on (a link with no stopped_at), read
 * through my_telegram_link() (migration 090). null when the read fails, so a page
 * leaves the panel out instead of showing a state it could not read.
 */
export async function getMyTelegramLinked(): Promise<boolean | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_telegram_link");
    if (error) return null;
    const row = (data as { stopped_at: string | null }[] | null)?.[0];
    return !!row && row.stopped_at === null;
  } catch {
    return null;
  }
}
