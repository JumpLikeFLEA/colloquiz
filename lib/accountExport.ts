// Shared vocabulary for the account data export.
//
// Pure and dependency-free so both the route handler and the client component
// can import it — the lib/historyFilters.ts split, again.

export const EXPORT_ENDPOINT = "/api/account/export";

/**
 * Bumped when the shape of the exported JSON changes in a way a reader would
 * notice. Present in the file so an export can be identified long after it was
 * downloaded.
 */
export const EXPORT_FORMAT_VERSION = 1;

/** The sections a reader should expect, for the "what's in it" list in the UI. */
export const EXPORT_CONTENTS = [
  "Profile — name, city, avatar, XP, streaks, member since",
  "Quiz results — every attempt, score and answer breakdown",
  "Achievements — what you unlocked and when",
  "Group memberships — the groups you belong to and your role",
  "Duel history — opponents, outcomes and scores",
] as const;

type AchievementRow = { achievement_id: string; unlocked_at: string };
type MembershipRow = {
  group_id: string;
  role: string;
  created_at: string;
  groups: unknown;
};

export type ExportSources = {
  accountId: string;
  email: string | null;
  exportedAt: Date;
  profile: unknown;
  results: unknown[];
  achievements: AchievementRow[];
  memberships: MembershipRow[];
  duels: unknown[];
};

/**
 * Assembles the export document.
 *
 * Kept pure and separate from the route so the shape can be tested without a
 * database. The route's only job is to fetch the caller's own rows and hand
 * them here.
 */
export function buildExportPayload(
  src: ExportSources,
  achievementMeta: readonly {
    id: string;
    title: string;
    description: string;
    category: string;
    xpReward: number;
  }[],
) {
  return {
    meta: {
      format: "colloquiz.account-export",
      format_version: EXPORT_FORMAT_VERSION,
      exported_at: src.exportedAt.toISOString(),
      account_id: src.accountId,
      // Not stored in profiles — it lives on the auth user.
      email: src.email,
      notes:
        "This file contains the data held about this account. It covers the account's " +
        "own records only; content shared with groups is included as membership, not " +
        "as the group's full contents.",
    },

    profile: src.profile ?? null,

    quiz_results: src.results,

    // Stored rows carry only the achievement id; the human-readable title and
    // description live in the app's catalogue, so join them in here rather than
    // exporting opaque slugs.
    achievements: src.achievements.map(row => {
      const meta = achievementMeta.find(a => a.id === row.achievement_id);
      return {
        achievement_id: row.achievement_id,
        title: meta?.title ?? null,
        description: meta?.description ?? null,
        category: meta?.category ?? null,
        xp_reward: meta?.xpReward ?? null,
        unlocked_at: row.unlocked_at,
      };
    }),

    group_memberships: src.memberships.map(row => {
      // PostgREST types an embedded resource as an array; this one is a to-one FK.
      const embedded = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      const group = (embedded ?? null) as {
        name?: string;
        description?: string | null;
        created_at?: string;
      } | null;
      return {
        group_id: row.group_id,
        group_name: group?.name ?? null,
        group_description: group?.description ?? null,
        group_created_at: group?.created_at ?? null,
        my_role: row.role,
        joined_at: row.created_at,
      };
    }),

    // get_my_duels() is SECURITY DEFINER and keys off auth.uid() internally, so
    // it self-scopes. It reports the opponent's display name and the outcome,
    // never a rating number — player_ratings is unreadable even by its owner by
    // design (017), so no rating can appear here.
    duel_history: src.duels,
  };
}

/** colloquiz-export-2026-07-27.json */
export function exportFilename(now: Date): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `colloquiz-export-${stamp}.json`;
}
