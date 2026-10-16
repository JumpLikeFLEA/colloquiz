import { createClient } from "@/lib/supabase/server";
import { toSeatRow, type SeatRow } from "./authorSeats";

// TCH-007 — the read behind /studio/authors (082, docs/decisions/0154).
// author_seats has no grants: author_seats_list() is the only way to read it
// and it raises for anyone who is not an admin, so a non-admin caller gets an
// error here, never another teacher's seat.

/** Every seat, house first. Admin only (enforced in SQL). */
export async function getAuthorSeats(): Promise<SeatRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("author_seats_list");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toSeatRow);
}
