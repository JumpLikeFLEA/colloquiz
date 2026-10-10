// COH-003 — invite links for cohort runs (migration 059, docs/decisions/0107).
// Pure: the shapes 059's functions return, and the mapping from their raw
// rows. Every rule (who may read a label, whether an invite is claimable,
// its state) is decided in SQL; this module only renames fields. The reads
// themselves live in lib/runInvitesServer.ts, so a Client Component can
// import these types without pulling in the server Supabase client.

export type InviteTier = "basic" | "extended";

/** An invite as its course's editor sees it (`course_run_invites`, 059). */
export type InviteEditorState = "pending" | "claimed" | "expired" | "revoked";

export type CourseRunInvite = {
  id: string;
  runId: string;
  tier: InviteTier;
  inviteeName: string;
  inviteeContact: string;
  state: InviteEditorState;
  createdAt: string;
  /** The earlier of the invite's own expiry and its run's end. */
  expiresAt: string;
  claimedAt: string | null;
  revokedAt: string | null;
};

export type CourseRunInviteRow = {
  invite_id: string;
  run_id: string;
  tier: InviteTier;
  invitee_name: string;
  invitee_contact: string;
  state: InviteEditorState;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  revoked_at: string | null;
};

export function toCourseRunInvite(row: CourseRunInviteRow): CourseRunInvite {
  return {
    id: row.invite_id,
    runId: row.run_id,
    tier: row.tier,
    inviteeName: row.invitee_name,
    inviteeContact: row.invitee_contact,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
    revokedAt: row.revoked_at,
  };
}

/** What the claim page shows for a token (`run_invite_preview`, 059). */
export type InvitePreview =
  | { state: "not_found" }
  | {
      state: "pending" | "claimed_by_you" | "used" | "expired" | "revoked";
      courseSlug: string;
      courseTitle: string;
      runTitle: string | null;
      runStartsAt: string;
      tier: InviteTier;
      alreadyEnrolled: boolean;
    };

const PREVIEW_STATES = new Set(["pending", "claimed_by_you", "used", "expired", "revoked"]);

/** Maps the RPC's JSON. Anything it doesn't recognise reads as not_found,
 * so a page never renders a join button for a state it can't name. */
export function parseInvitePreview(raw: unknown): InvitePreview {
  if (!raw || typeof raw !== "object") return { state: "not_found" };
  const r = raw as Record<string, unknown>;
  if (typeof r.state !== "string" || !PREVIEW_STATES.has(r.state)) return { state: "not_found" };
  if (typeof r.course_slug !== "string" || typeof r.course_title !== "string") return { state: "not_found" };
  return {
    state: r.state as Exclude<InvitePreview["state"], "not_found">,
    courseSlug: r.course_slug,
    courseTitle: r.course_title,
    runTitle: typeof r.run_title === "string" ? r.run_title : null,
    runStartsAt: String(r.run_starts_at ?? ""),
    tier: r.tier === "extended" ? "extended" : "basic",
    alreadyEnrolled: r.already_enrolled === true,
  };
}

/** A raw token's shape (059: 32 lowercase hex chars, 128 bits). */
export const INVITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** The claim page's path for a token. */
export function invitePath(token: string): string {
  return `/invite/${token}`;
}
