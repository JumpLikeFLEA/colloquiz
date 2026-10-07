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
