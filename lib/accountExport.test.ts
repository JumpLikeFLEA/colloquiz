import { describe, expect, it } from "vitest";
import { buildExportPayload } from "./accountExport";

const baseSources = {
  accountId: "user-1",
  email: "learner@example.com",
  exportedAt: new Date("2026-09-27T00:00:00.000Z"),
  profile: null,
  results: [],
  achievements: [],
  memberships: [],
  duels: [],
  lessonAttempts: [],
  signupAcquisition: null,
  lessonOpens: [],
  courseEntitlements: [],
  runEnrolments: [],
  claimedInvites: [],
};

describe("buildExportPayload — lesson_attempts (ANON-003)", () => {
  it("is empty when the reader has no recorded attempts", () => {
    const payload = buildExportPayload(baseSources, []);
    expect(payload.lesson_attempts).toEqual([]);
  });

  it("maps stored rows to the export's own field names, unmodified", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        lessonAttempts: [
          {
            id: "attempt-1",
            lesson_version_id: "version-1",
            block_id: "block-1",
            earned: 3,
            possible: 4,
            created_at: "2026-09-20T12:00:00.000Z",
          },
        ],
      },
      [],
    );
    expect(payload.lesson_attempts).toEqual([
      {
        attempt_id: "attempt-1",
        lesson_version_id: "version-1",
        block_id: "block-1",
        earned: 3,
        possible: 4,
        recorded_at: "2026-09-20T12:00:00.000Z",
      },
    ]);
  });
});

describe("buildExportPayload — signup_acquisition (ANON-009)", () => {
  it("is null for an account with no recorded signup source", () => {
    const payload = buildExportPayload(baseSources, []);
    expect(payload.signup_acquisition).toBeNull();
  });

  it("maps the row, flattening the embedded course (PostgREST array shape)", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        signupAcquisition: {
          course_id: "course-1",
          source: "telegram",
          created_at: "2026-10-07T12:00:00.000Z",
          courses: [{ slug: "future-imperfect", title: "Future Imperfect" }],
        },
      },
      [],
    );
    expect(payload.signup_acquisition).toEqual({
      source: "telegram",
      course_id: "course-1",
      course_slug: "future-imperfect",
      course_title: "Future Imperfect",
      recorded_at: "2026-10-07T12:00:00.000Z",
    });
  });

  it("keeps the row when there is no course (signed up from / or the course is gone)", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        signupAcquisition: { course_id: null, source: "direct", created_at: "2026-10-07T12:00:00.000Z", courses: null },
      },
      [],
    );
    expect(payload.signup_acquisition).toEqual({
      source: "direct",
      course_id: null,
      course_slug: null,
      course_title: null,
      recorded_at: "2026-10-07T12:00:00.000Z",
    });
  });
});

describe("buildExportPayload — lesson_opens (PROG-001)", () => {
  it("is empty when the reader has opened no lesson while signed in", () => {
    const payload = buildExportPayload(baseSources, []);
    expect(payload.lesson_opens).toEqual([]);
  });

  it("maps each row, flattening the embedded lesson and its course", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        lessonOpens: [
          {
            lesson_id: "lesson-1",
            first_opened_at: "2026-10-08T09:00:00.000Z",
            last_opened_at: "2026-10-09T18:30:00.000Z",
            lessons: [{ slug: "true-or-false", title: "True or false", courses: [{ slug: "future-imperfect", title: "Future Imperfect" }] }],
          },
        ],
      },
      [],
    );
    expect(payload.lesson_opens).toEqual([
      {
        lesson_id: "lesson-1",
        lesson_slug: "true-or-false",
        lesson_title: "True or false",
        course_slug: "future-imperfect",
        course_title: "Future Imperfect",
        first_opened_at: "2026-10-08T09:00:00.000Z",
        last_opened_at: "2026-10-09T18:30:00.000Z",
      },
    ]);
  });

  it("keeps the row when the lesson is no longer readable (embed is null)", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        lessonOpens: [
          { lesson_id: "lesson-2", first_opened_at: "2026-10-08T09:00:00.000Z", last_opened_at: "2026-10-08T09:00:00.000Z", lessons: null },
        ],
      },
      [],
    );
    expect(payload.lesson_opens).toEqual([
      {
        lesson_id: "lesson-2",
        lesson_slug: null,
        lesson_title: null,
        course_slug: null,
        course_title: null,
        first_opened_at: "2026-10-08T09:00:00.000Z",
        last_opened_at: "2026-10-08T09:00:00.000Z",
      },
    ]);
  });
});

describe("buildExportPayload — course_entitlements and cohort_enrolments (COH-002)", () => {
  it("are empty when the reader has no grant and no enrolment", () => {
    const payload = buildExportPayload(baseSources, []);
    expect(payload.course_entitlements).toEqual([]);
    expect(payload.cohort_enrolments).toEqual([]);
  });

  it("maps a grant, keeping a revoked one with its revoked_at", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        courseEntitlements: [
          {
            course_id: "course-1",
            granted_at: "2026-10-01T10:00:00.000Z",
            source: "grant",
            source_ref: null,
            revoked_at: "2026-10-05T10:00:00.000Z",
            courses: [{ slug: "speak-up", title: "Speak Up" }],
          },
        ],
      },
      [],
    );
    expect(payload.course_entitlements).toEqual([
      {
        course_id: "course-1",
        course_slug: "speak-up",
        course_title: "Speak Up",
        source: "grant",
        source_ref: null,
        granted_at: "2026-10-01T10:00:00.000Z",
        revoked_at: "2026-10-05T10:00:00.000Z",
      },
    ]);
  });

  it("maps an enrolment, flattening the embedded run and its course", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        runEnrolments: [
          {
            id: "enrolment-1",
            run_id: "run-1",
            tier: "extended",
            enrolled_at: "2026-10-02T08:00:00.000Z",
            revoked_at: null,
            course_runs: [
              {
                title: "November",
                starts_at: "2026-11-02T09:00:00.000Z",
                ends_at: "2026-11-30T09:00:00.000Z",
                courses: [{ slug: "speak-up", title: "Speak Up" }],
              },
            ],
          },
        ],
      },
      [],
    );
    expect(payload.cohort_enrolments).toEqual([
      {
        enrolment_id: "enrolment-1",
        run_id: "run-1",
        run_title: "November",
        run_starts_at: "2026-11-02T09:00:00.000Z",
        run_ends_at: "2026-11-30T09:00:00.000Z",
        course_slug: "speak-up",
        course_title: "Speak Up",
        tier: "extended",
        enrolled_at: "2026-10-02T08:00:00.000Z",
        revoked_at: null,
      },
    ]);
  });

  it("keeps the enrolment when its run is not embedded (null)", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        runEnrolments: [
          { id: "enrolment-2", run_id: "run-2", tier: "basic", enrolled_at: "2026-10-02T08:00:00.000Z", revoked_at: null, course_runs: null },
        ],
      },
      [],
    );
    expect(payload.cohort_enrolments[0]).toMatchObject({ enrolment_id: "enrolment-2", run_title: null, course_slug: null, tier: "basic" });
  });
});

describe("buildExportPayload — claimed_invites (COH-003)", () => {
  it("is empty when the reader claimed no invite", () => {
    expect(buildExportPayload(baseSources, []).claimed_invites).toEqual([]);
  });

  it("carries the contact label of a claimed invite, revoked ones included", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        claimedInvites: [
          {
            invite_id: "invite-1",
            run_id: "run-1",
            enrolment_id: "enrolment-1",
            tier: "extended",
            invitee_name: "Learner One",
            invitee_contact: "@learner_one",
            claimed_at: "2026-10-10T10:00:00.000Z",
            revoked_at: "2026-10-11T10:00:00.000Z",
          },
        ],
      },
      [],
    );
    expect(payload.claimed_invites).toEqual([
      {
        invite_id: "invite-1",
        run_id: "run-1",
        enrolment_id: "enrolment-1",
        tier: "extended",
        invitee_name: "Learner One",
        invitee_contact: "@learner_one",
        claimed_at: "2026-10-10T10:00:00.000Z",
        revoked_at: "2026-10-11T10:00:00.000Z",
      },
    ]);
  });

  it("is format version 6", () => {
    expect(buildExportPayload(baseSources, []).meta.format_version).toBe(6);
  });
});
