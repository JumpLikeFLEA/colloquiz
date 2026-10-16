/**
 * TCH-007 (docs/decisions/0154) — pure helpers for /studio/authors.
 *
 * Whether a seat is active is decided in SQL (`_author_seat_active`, 082) and
 * arrives as `is_active`; nothing here recomputes it from a date. What lives
 * here is presentation: the row shape, the wording of a seat's state, the
 * date an "extend by N months" button fills in, and the admin RPCs' error
 * copy.
 */

export type SeatKind = "house" | "teacher";

export type SeatRow = {
  userId: string;
  /** The account's email, or "@username" for a Telegram account (073). */
  contact: string;
  kind: SeatKind;
  publicName: string;
  notes: string | null;
  /** ISO timestamp, or null for an open-ended seat. */
  expiresAt: string | null;
  createdAt: string;
  isActive: boolean;
  /** Whole days until expiry, rounded up; null when open-ended; <= 0 when lapsed. */
  daysLeft: number | null;
  /** Courses the teacher edits or authored. */
  courses: number;
  /** Students with an active link to the teacher. */
  linkedStudents: number;
};

/** One row of `author_seats_list()` (082), in the app's own field names. */
export function toSeatRow(raw: Record<string, unknown>): SeatRow {
  return {
    userId: String(raw.user_id),
    contact: typeof raw.contact === "string" ? raw.contact : "",
    kind: raw.kind === "house" ? "house" : "teacher",
    publicName: String(raw.public_name ?? ""),
    notes: typeof raw.notes === "string" ? raw.notes : null,
    expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : null,
    createdAt: String(raw.created_at),
    isActive: raw.is_active === true,
    daysLeft: typeof raw.days_left === "number" ? raw.days_left : null,
    courses: Number(raw.courses ?? 0),
    linkedStudents: Number(raw.linked_students ?? 0),
  };
}

/** Seats with this many days left or fewer are flagged as ending soon. Display only. */
export const SEAT_ENDING_SOON_DAYS = 7;

export type SeatState = {
  tone: "open" | "active" | "soon" | "lapsed";
  label: string;
};

/** The state pill's wording. For a lapsed seat the page appends the date. */
export function seatState(row: Pick<SeatRow, "isActive" | "expiresAt" | "daysLeft">): SeatState {
  if (!row.isActive) return { tone: "lapsed", label: "Lapsed" };
  if (row.expiresAt === null || row.daysLeft === null) return { tone: "open", label: "Active · no expiry" };
  const days = row.daysLeft;
  const label = `Active · expires in ${days} ${days === 1 ? "day" : "days"}`;
  return { tone: days <= SEAT_ENDING_SOON_DAYS ? "soon" : "active", label };
}

/**
 * The date an "extend" button puts in the date field: `months` after the
 * later of today and the current expiry (an open-ended or lapsed seat counts
 * from today). It only fills the field; the admin still confirms the date.
 * Returns YYYY-MM-DD in the viewer's local calendar.
 */
export function extendedDate(row: Pick<SeatRow, "isActive" | "expiresAt">, months: number, now: Date): string {
  const base = new Date(now);
  if (row.isActive && row.expiresAt) {
    const current = new Date(row.expiresAt);
    if (current.getTime() > base.getTime()) base.setTime(current.getTime());
  }
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + months);
  // Clamp to the target month's length, so 31 Jan + 1 month is 28/29 Feb,
  // not 3 March.
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, last));
  return localDateString(base);
}

export function localDateString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * A date input's value (YYYY-MM-DD) as the expiry timestamp: the end of that
 * day in the viewer's time zone, so "through 31 Dec" includes 31 Dec.
 * Returns null for an empty or malformed value.
 */
export function expiryFromDateInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 23, 59, 59);
  // new Date rolls 31 Feb over to March; reject it rather than store a date the admin did not type.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

export const SEAT_NOTES_MAX_LENGTH = 1000;
export const SEAT_NAME_MAX_LENGTH = 80;

/** Codes the 082 admin functions return, with the status and copy /api/studio/authors sends. */
export const SEAT_ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "Only an admin can manage author seats." },
  invalid_email: { status: 400, message: "Enter the teacher's email address." },
  user_not_found: {
    status: 404,
    message: "No account has that email. The teacher needs to sign up first, then you can add the seat.",
  },
  already_seated: { status: 409, message: "That account already has a seat. Edit or extend it below." },
  invalid_name: { status: 400, message: `Enter a public name of up to ${SEAT_NAME_MAX_LENGTH} characters.` },
  invalid_notes: { status: 400, message: `Notes can be up to ${SEAT_NOTES_MAX_LENGTH} characters.` },
  invalid_kind: { status: 400, message: "That is not a kind of seat." },
  expiry_in_past: { status: 400, message: "Pick a date in the future. To end a seat now, use Freeze." },
  seat_not_found: { status: 404, message: "That seat no longer exists." },
};
