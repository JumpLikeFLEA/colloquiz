/**
 * TCH-008 (docs/decisions/0155) — the words of a frozen Studio.
 *
 * Whether the caller may write is decided in SQL (`studio_can_write()`, 083)
 * and arrives as a boolean; nothing here recomputes it from a date. What lives
 * here is presentation: the reason a control shows, the banner's text and the
 * date in it. The database refuses every write regardless of what the page
 * shows, so a stale page disables nothing that the database would allow.
 */

/** What a disabled write control says (its `title`) and what an API route
 * answers when the database returns `seat_lapsed`. */
export const SEAT_LAPSED_MESSAGE =
  "Your author seat is not active, so Studio is read-only. Ask the admin to extend it.";

export type WriteLock = {
  locked: boolean;
  /** The reason to show on a disabled control; empty when not locked. */
  reason: string;
};

export const UNLOCKED: WriteLock = { locked: false, reason: "" };

export type StudioWriteState = {
  /** `studio_can_write()`: an admin, or an active seat. */
  canWrite: boolean;
  /** The caller's own seat expiry, ISO; null when open-ended or no seat. */
  expiresAt: string | null;
  /** The caller holds a seat row in any state. */
  hasSeat: boolean;
};

/** The state when the read could not be made (083 not applied, a failed call):
 * do not freeze the page on a guess. The database still decides every write. */
export const WRITE_STATE_UNKNOWN: StudioWriteState = { canWrite: true, expiresAt: null, hasSeat: false };

export function toWriteState(canWrite: unknown, seatRows: unknown): StudioWriteState {
  if (typeof canWrite !== "boolean") return WRITE_STATE_UNKNOWN;
  const row = Array.isArray(seatRows) && seatRows.length > 0 ? (seatRows[0] as Record<string, unknown>) : null;
  return {
    canWrite,
    hasSeat: row !== null,
    expiresAt: row && typeof row.expires_at === "string" ? row.expires_at : null,
  };
}

export function writeLockFor(state: StudioWriteState): WriteLock {
  return state.canWrite ? UNLOCKED : { locked: true, reason: SEAT_LAPSED_MESSAGE };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Oct 2026", in UTC so the server and the browser print the same day. */
export function formatSeatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type WriteBanner = { title: string; detail: string };

/** The read-only banner, or null when the caller can write. */
export function writeBanner(state: StudioWriteState): WriteBanner | null {
  if (state.canWrite) return null;
  const date = state.expiresAt ? formatSeatDate(state.expiresAt) : "";
  if (!state.hasSeat) {
    return {
      title: "Studio is read-only",
      detail: "You don't have an author seat. You can read everything you could before; ask the admin for a seat to make changes.",
    };
  }
  return {
    title: "Your author seat has ended: Studio is read-only",
    detail:
      `${date ? `It ended on ${date}. ` : ""}Your published courses stay playable, your students keep their access, and you can still read and reply to messages and give feedback on recordings. ` +
      "Ask the admin to extend your seat to make changes.",
  };
}
