/**
 * Maps the `error` field of a course-authoring RPC's `{ ok, error }` result
 * (migration 044) to an HTTP status and a copy string. One shared table
 * because the same error codes recur across create_course, update_course,
 * publish_course, unpublish_course, create_lesson, update_lesson,
 * set_lesson_archived, reorder_lessons, save_lesson_version and
 * publish_lesson.
 */
export const COURSE_AUTHORING_ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "You don't have permission to edit this course." },
  course_not_found: { status: 404, message: "That course no longer exists." },
  lesson_not_found: { status: 404, message: "That lesson no longer exists." },
  invalid_title: { status: 400, message: "Please enter a title." },
  invalid_slug: { status: 400, message: "Slug must be lowercase letters, numbers and hyphens only." },
  invalid_level: { status: 400, message: "Please choose a valid level." },
  // update_course/publish_course (047): char_length(subtitle) > 200
  // (courses_subtitle_length_check) — the RPC's own pre-check, so this code
  // is what the caller actually sees instead of a raw CHECK-violation error.
  subtitle_too_long: { status: 400, message: "Summary must be 200 characters or fewer." },
  // update_course/publish_course (047): a published course needs both a
  // cover and a subtitle (courses_published_requires_catalogue_fields) —
  // fires whether the course is being published without one, or an
  // already-published course's one is being cleared.
  missing_cover: { status: 400, message: "Add a cover image before publishing." },
  missing_subtitle: { status: 400, message: "Add a short summary before publishing." },
  invalid_estimated_minutes: { status: 400, message: "Estimated minutes must be a positive number." },
  slug_taken: { status: 409, message: "That slug is already in use by another course." },
  // update_lesson_slug (046): scoped to the lesson's own course, so the
  // message says "lesson" rather than reusing slug_taken's course-scoped copy.
  lesson_slug_taken: { status: 409, message: "That slug is already used by another lesson in this course." },
  // update_lesson_slug (046): the lesson has been published at least once —
  // slug_frozen_at is set and update_lesson_slug refuses unconditionally,
  // regardless of the lesson's current archived/published state.
  slug_frozen: { status: 409, message: "This lesson's slug can't be changed once it has been published." },
  lesson_set_mismatch: { status: 409, message: "The lesson list changed elsewhere — reload and try again." },
  // save_lesson_version (041): p_base_version_id didn't match the true
  // latest version — someone else saved first. Same "reload, don't clobber"
  // contract as lesson_set_mismatch above.
  stale: { status: 409, message: "This lesson changed elsewhere — reload and try again." },
  invalid_document: { status: 400, message: "The lesson content isn't a valid document." },
  no_draft: { status: 400, message: "There's no draft to publish yet." },
  // publish_lesson (045): should be unreachable, since the publish route
  // always derives p_item_count server-side from the stored version's own
  // document (never from the request) — kept for the same reason every
  // other RPC error code here is mapped rather than falling through to the
  // generic 400.
  invalid_item_count: { status: 400, message: "That lesson's item count couldn't be determined." },
  // set_lesson_access_level / publish_course (055):
  // a published course keeps at least one non-archived lesson open to anyone
  // (docs/decisions/0094 Decision 2).
  no_open_lesson: { status: 409, message: "A published course needs at least one lesson open to anyone." },
  invalid_access_level: { status: 400, message: "Please choose a valid access level." },
  // Cohort courses (058, docs/decisions/0093 / 0105), surfaced by AUTH-010.
  invalid_format: { status: 400, message: "Please choose a valid format." },
  format_locked: { status: 409, message: "The format can't change once the course has a run." },
  invalid_url: { status: 400, message: "Enter a full link starting with https://." },
  invalid_week: { status: 400, message: "Please choose a valid week." },
  week_required: {
    status: 409,
    message: "In a cohort course, a lesson that needs a purchase must have a week before it is published.",
  },
  // The no-re-lock rule (0093 Decision 5, 0094 Decision 4).
  week_frozen: {
    status: 409,
    message:
      "A run is in progress, so this published lesson's week can only move earlier. Moving it later would re-lock it for learners who can already open it.",
  },
  access_level_frozen: {
    status: 409,
    message:
      "A run is in progress, so this published lesson can't be switched to Purchase required. It would lock it for learners who can already open it.",
  },
  not_cohort_course: { status: 409, message: "Runs exist only on a cohort course. Set the format first." },
  no_scheduled_lessons: {
    status: 409,
    message: "Give at least one Purchase-required lesson a week before creating a run.",
  },
  invalid_starts_at: { status: 400, message: "Please enter a valid date and time." },
  invalid_ends_at: { status: 400, message: "A run can't end before it starts." },
  run_not_found: { status: 404, message: "That run no longer exists." },
  call_not_found: { status: 404, message: "That call no longer exists." },
  run_started: { status: 409, message: "This run has started, so its start can't change and it can't be deleted." },
  run_not_started: { status: 409, message: "This run hasn't started yet. Delete it or move its start instead." },
  cannot_extend_started_run: { status: 409, message: "A run that has started can end earlier, never later." },
  run_has_enrolments: { status: 409, message: "Someone has enrolled in this run, so it can't be deleted." },
  // Invites (059, docs/decisions/0107), surfaced by COH-003. The claim's own
  // refusals (used, expired, revoked, ...) are the claim page's states, not
  // editor errors, so they are not here.
  invalid_tier: { status: 400, message: "Please choose a tier." },
  invalid_invitee_name: { status: 400, message: "Enter the learner's name (up to 120 characters)." },
  invalid_invitee_contact: {
    status: 400,
    message: "Enter an email address or a Telegram username starting with @ (5–32 letters, digits or _).",
  },
  run_ended: { status: 409, message: "This run has ended, so nobody can join it." },
  invite_not_found: { status: 404, message: "That invite no longer exists." },
  rate_limited: { status: 429, message: "Too many invites in the last hour. Try again later." },
};

export function courseAuthoringErrorResponse(code: string | undefined): { status: number; body: { error: string } } {
  const known = COURSE_AUTHORING_ERRORS[code ?? ""];
  if (known) return { status: known.status, body: { error: known.message } };
  return { status: 400, body: { error: "Something went wrong." } };
}
