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
