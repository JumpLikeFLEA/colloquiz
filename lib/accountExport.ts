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
export const EXPORT_FORMAT_VERSION = 8;

/** The sections a reader should expect, for the "what's in it" list in the UI. */
export const EXPORT_CONTENTS = [
  "Profile — name, city, avatar, XP, streaks, member since",
  "Quiz results — every attempt, score and answer breakdown",
  "Achievements — what you unlocked and when",
  "Group memberships — the groups you belong to and your role",
  "Duel history — opponents, outcomes and scores",
  "Lesson attempts — every English-course practice-block attempt and score",
  "Signup source — the course and arrival channel recorded when you signed up",
  "Lesson opens — which English lessons you opened while signed in, and when",
  "Course access — English courses opened to you by a grant, and when (or if) that ended",
  "Cohort enrolments — the course runs you joined, your tier, and when (or if) your access ended",
  "Invites you claimed — the name and contact the course author wrote on your invite",
  "Voice recordings — each recording you sent, with a copy of the audio, and the author's published written feedback",
  "Final comments — the author's published closing comment for each course run you joined",
] as const;

type AchievementRow = { achievement_id: string; unlocked_at: string };
type MembershipRow = {
  group_id: string;
  role: string;
  created_at: string;
  groups: unknown;
};
export type LessonAttemptRow = {
  id: string;
  lesson_version_id: string;
  block_id: string;
  earned: number;
  possible: number;
  /** PROG-005: the stored answer; null for a row without one. */
  response?: unknown;
  created_at: string;
};

export type SignupAcquisitionRow = {
  course_id: string | null;
  source: string;
  created_at: string;
  /** Embedded `courses(slug, title)`; null once the course is unpublished or gone. */
  courses: unknown;
};

export type LessonOpenRow = {
  lesson_id: string;
  first_opened_at: string;
  last_opened_at: string;
  /** Embedded `lessons(slug, title, courses(slug, title))`; null once the
   * lesson is no longer readable to the reader (unpublished or gone). */
  lessons: unknown;
};

export type CourseEntitlementRow = {
  course_id: string;
  granted_at: string;
  source: string;
  source_ref: string | null;
  revoked_at: string | null;
  /** Embedded `courses(slug, title)`; null once the course is not readable to the reader. */
  courses: unknown;
};

export type RunEnrolmentRow = {
  id: string;
  run_id: string;
  tier: string;
  enrolled_at: string;
  revoked_at: string | null;
  /** Embedded `course_runs(title, starts_at, ends_at, courses(slug, title))`. */
  course_runs: unknown;
};

export type ClaimedInviteRow = {
  invite_id: string;
  run_id: string;
  enrolment_id: string | null;
  tier: string;
  invitee_name: string;
  invitee_contact: string;
  claimed_at: string;
  revoked_at: string | null;
};

export type VoiceSubmissionRow = {
  id: string;
  lesson_id: string;
  block_id: string;
  lesson_version_id: string;
  content_type: string;
  size_bytes: number | null;
  submitted_at: string;
  purged_at: string | null;
  /** Embedded `lessons(slug, title, courses(slug, title))`. */
  lessons: unknown;
  /** Embedded `voice_feedback(body, published_at, updated_at)`. RLS returns
   * a learner only PUBLISHED feedback, so a draft never reaches the export. */
  voice_feedback: unknown;
};

export type FinalCommentRow = {
  enrolment_id: string;
  run_id: string;
  body: unknown;
  published_at: string | null;
  updated_at: string;
  /** Embedded `course_runs(title, starts_at, ends_at)`. */
  course_runs: unknown;
  /** Embedded `courses(slug, title)`. */
  courses: unknown;
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
  lessonAttempts: LessonAttemptRow[];
  signupAcquisition: SignupAcquisitionRow | null;
  lessonOpens: LessonOpenRow[];
  courseEntitlements: CourseEntitlementRow[];
  runEnrolments: RunEnrolmentRow[];
  claimedInvites: ClaimedInviteRow[];
  voiceSubmissions: VoiceSubmissionRow[];
  /** Submission id -> the take's audio, base64. Absent for a removed take. */
  voiceAudio: Readonly<Record<string, string>>;
  finalComments: FinalCommentRow[];
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

    // English-course practice attempts (ANON-003). Keyed the same way the
    // player stores them locally before an account exists (0018/0063):
    // lesson_version_id + block_id, not a course/lesson name — the reader's
    // own record of what they attempted and scored, not a human-readable
    // course catalogue.
    lesson_attempts: src.lessonAttempts.map(row => ({
      attempt_id: row.id,
      lesson_version_id: row.lesson_version_id,
      block_id: row.block_id,
      earned: row.earned,
      possible: row.possible,
      response: row.response ?? null,
      recorded_at: row.created_at,
    })),

    // ANON-009 (docs/decisions/0081): written once at signup, absent for an
    // account created before it shipped or under a GPC/DNT opt-out.
    signup_acquisition: src.signupAcquisition ? exportSignupAcquisition(src.signupAcquisition) : null,

    // PROG-001 (docs/decisions/0101): one row per lesson opened while signed in.
    lesson_opens: src.lessonOpens.map(exportLessonOpen),

    // COH-002 (docs/decisions/0093, 0105): course-level grants (comps, test
    // accounts, future purchases) and cohort run enrolments. Revoked rows are
    // kept, with their revoked_at: they are part of the reader's record.
    course_entitlements: src.courseEntitlements.map(exportCourseEntitlement),
    cohort_enrolments: src.runEnrolments.map(exportRunEnrolment),

    // COH-003 (docs/decisions/0107): the invites this reader claimed, with
    // the contact label the author wrote (privacy-policy.md section 8: "an
    // invite contact label is included once you have claimed it"). Read
    // through my_claimed_run_invites (059); run_invites has no grants.
    claimed_invites: src.claimedInvites.map((row) => ({
      invite_id: row.invite_id,
      run_id: row.run_id,
      enrolment_id: row.enrolment_id,
      tier: row.tier,
      invitee_name: row.invitee_name,
      invitee_contact: row.invitee_contact,
      claimed_at: row.claimed_at,
      revoked_at: row.revoked_at,
    })),

    // VOICE-004 (docs/decisions/0110): every voice take this reader sent,
    // with a copy of the audio (privacy-policy.md section 8: "The export
    // includes a copy of your voice recordings") and the author's written
    // feedback once published. A take removed by the 6-month purge keeps its
    // row with removed_at set and no audio.
    voice_submissions: src.voiceSubmissions.map((row) => exportVoiceSubmission(row, src.voiceAudio)),

    // COH-008 (docs/decisions/0112): the author's final comment per run
    // enrolment, published only. RLS returns a learner only published rows,
    // but an editor of the course also reads drafts (061), so a learner who
    // edits the course they joined would otherwise export a draft.
    final_comments: src.finalComments.filter((row) => row.published_at).map(exportFinalComment),
  };
}

function exportFinalComment(row: FinalCommentRow) {
  const run = firstEmbedded<{ title?: string | null; starts_at?: string; ends_at?: string }>(row.course_runs);
  const course = firstEmbedded<{ slug?: string; title?: string }>(row.courses);
  return {
    enrolment_id: row.enrolment_id,
    run_id: row.run_id,
    run_title: run?.title ?? null,
    run_starts_at: run?.starts_at ?? null,
    run_ends_at: run?.ends_at ?? null,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    content: row.body ?? null,
    published_at: row.published_at,
    updated_at: row.updated_at,
  };
}

function exportVoiceSubmission(row: VoiceSubmissionRow, audio: Readonly<Record<string, string>>) {
  const lesson = firstEmbedded<{ slug?: string; title?: string; courses?: unknown }>(row.lessons);
  const course = firstEmbedded<{ slug?: string; title?: string }>(lesson?.courses);
  const feedback = firstEmbedded<{ body?: unknown; published_at?: string | null; updated_at?: string }>(
    row.voice_feedback,
  );
  return {
    submission_id: row.id,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    lesson_slug: lesson?.slug ?? null,
    lesson_title: lesson?.title ?? null,
    block_id: row.block_id,
    lesson_version_id: row.lesson_version_id,
    submitted_at: row.submitted_at,
    removed_at: row.purged_at,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    audio_base64: audio[row.id] ?? null,
    feedback:
      feedback && feedback.published_at
        ? { content: feedback.body ?? null, published_at: feedback.published_at, updated_at: feedback.updated_at ?? null }
        : null,
  };
}

/** PostgREST types an embedded resource as an array; these are to-one FKs. */
function firstEmbedded<T>(value: unknown): T | null {
  const embedded = Array.isArray(value) ? value[0] : value;
  return (embedded ?? null) as T | null;
}

function exportLessonOpen(row: LessonOpenRow) {
  const lesson = firstEmbedded<{ slug?: string; title?: string; courses?: unknown }>(row.lessons);
  const course = firstEmbedded<{ slug?: string; title?: string }>(lesson?.courses);
  return {
    lesson_id: row.lesson_id,
    lesson_slug: lesson?.slug ?? null,
    lesson_title: lesson?.title ?? null,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    first_opened_at: row.first_opened_at,
    last_opened_at: row.last_opened_at,
  };
}

function exportCourseEntitlement(row: CourseEntitlementRow) {
  const course = firstEmbedded<{ slug?: string; title?: string }>(row.courses);
  return {
    course_id: row.course_id,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    source: row.source,
    source_ref: row.source_ref,
    granted_at: row.granted_at,
    revoked_at: row.revoked_at,
  };
}

function exportRunEnrolment(row: RunEnrolmentRow) {
  const run = firstEmbedded<{ title?: string | null; starts_at?: string; ends_at?: string; courses?: unknown }>(row.course_runs);
  const course = firstEmbedded<{ slug?: string; title?: string }>(run?.courses);
  return {
    enrolment_id: row.id,
    run_id: row.run_id,
    run_title: run?.title ?? null,
    run_starts_at: run?.starts_at ?? null,
    run_ends_at: run?.ends_at ?? null,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    tier: row.tier,
    enrolled_at: row.enrolled_at,
    revoked_at: row.revoked_at,
  };
}

function exportSignupAcquisition(row: SignupAcquisitionRow) {
  // PostgREST types an embedded resource as an array; this one is a to-one FK.
  const embedded = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  const course = (embedded ?? null) as { slug?: string; title?: string } | null;
  return {
    source: row.source,
    course_id: row.course_id,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    recorded_at: row.created_at,
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
