import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { WRITE_STATE_UNKNOWN, toWriteState, type StudioWriteState } from "@/lib/studioWriteLock";

/**
 * TCH-008 (docs/decisions/0155) — whether the caller's Studio is read-only,
 * as the database says it (`studio_can_write()` and `my_author_seat_state()`,
 * migration 083). The layout renders the banner from this and hands the lock
 * to client components; it decides what to show, never what may be written:
 * every write RPC and storage policy asks the same predicate itself.
 *
 * A failed read (083 not applied yet, a network error) degrades to "not
 * locked" so Studio does not freeze on a guess; the database still refuses.
 */
export const getStudioWriteState = cache(async (): Promise<StudioWriteState> => {
  const user = await getUser();
  if (!user) return WRITE_STATE_UNKNOWN;
  const supabase = await createClient();
  const [can, seat] = await Promise.all([supabase.rpc("studio_can_write"), supabase.rpc("my_author_seat_state")]);
  if (can.error) return WRITE_STATE_UNKNOWN;
  return toWriteState(can.data, seat.error ? [] : seat.data);
});
