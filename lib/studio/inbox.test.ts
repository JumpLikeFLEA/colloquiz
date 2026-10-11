import { describe, expect, it } from "vitest";
import type { FinalCommentRow, ReviewRow } from "../reviews/queue";
import {
  ageLabel,
  finalDraftGroups,
  upcomingCalls,
  voiceDraftGroups,
  waitingCount,
  waitingGroups,
  type InboxCall,
} from "./inbox";

const A = "4651bdf0-945b-4e68-be50-1e51c6ca75af";
const B = "881395e3-2a20-429f-9f04-5b8c94ca83d9";
const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<ReviewRow>): ReviewRow {
  return {
    courseId: A,
    courseTitle: "Course A",
    runId: RUN_A,
    runTitle: "October",
    runStartsAt: "2026-10-01T00:00:00Z",
    runEndsAt: "2026-10-29T00:00:00Z",
    enrolmentId: "e1",
    tier: "basic",
    userId: "u1",
    learnerEmail: "a@example.test",
    inviteeName: null,
    inviteeContact: null,
    lessonId: "l1",
    lessonTitle: "Lesson 1",
    lessonOrdinal: 1,
    week: 1,
    opensAt: "2026-10-01T00:00:00Z",
    blockId: "v1",
    blockPrompt: null,
    blockMaxSeconds: 180,
    submissionId: null,
    submittedAt: null,
    recordingRemoved: false,
    feedbackBody: null,
    feedbackUpdatedAt: null,
    feedbackPublishedAt: null,
    status: "not_sent",
    ...over,
  };
}

const waiting = (over: Partial<ReviewRow>) =>
  row({ status: "waiting", submissionId: "s", submittedAt: "2026-10-05T10:00:00Z", ...over });

function comment(over: Partial<FinalCommentRow>): FinalCommentRow {
  return {
    courseId: A,
    courseTitle: "Course A",
    runId: RUN_A,
    runTitle: "October",
    runStartsAt: "2026-10-01T00:00:00Z",
    runEndsAt: "2026-10-29T00:00:00Z",
    enrolmentId: "e1",
    tier: "basic",
    userId: "u1",
    learnerEmail: "a@example.test",
    inviteeName: null,
    inviteeContact: null,
    body: null,
    updatedAt: null,
    publishedAt: null,
    ...over,
  };
}

describe("waitingCount", () => {
  it("counts waiting rows only", () => {
    expect(
      waitingCount([waiting({}), waiting({ enrolmentId: "e2" }), row({ status: "draft" }), row({})]),
    ).toBe(2);
  });

  it("is 0 on no rows", () => {
    expect(waitingCount([])).toBe(0);
  });
});

describe("waitingGroups", () => {
  it("groups by course, run and week with the count and the oldest submission", () => {
    const groups = waitingGroups([
      waiting({ enrolmentId: "e1", submittedAt: "2026-10-06T00:00:00Z" }),
      waiting({ enrolmentId: "e2", submittedAt: "2026-10-04T00:00:00Z" }),
      waiting({ week: 2, submittedAt: "2026-10-09T00:00:00Z" }),
      waiting({ courseId: B, courseTitle: "Course B", runId: RUN_B, submittedAt: "2026-10-03T00:00:00Z" }),
      row({ status: "answered", submittedAt: "2026-10-01T00:00:00Z" }),
    ]);
    expect(groups.map((g) => [g.courseTitle, g.week, g.count, g.oldestAt])).toEqual([
      ["Course B", 1, 1, "2026-10-03T00:00:00Z"],
      ["Course A", 1, 2, "2026-10-04T00:00:00Z"],
      ["Course A", 2, 1, "2026-10-09T00:00:00Z"],
    ]);
  });

  it("the counts add up to the badge's count", () => {
    const rows = [waiting({}), waiting({ enrolmentId: "e2" }), waiting({ week: null }), row({ status: "draft" })];
    expect(waitingGroups(rows).reduce((n, g) => n + g.count, 0)).toBe(waitingCount(rows));
  });

  it("links into the queue filtered to the group", () => {
    const [g] = waitingGroups([waiting({ week: 3 })]);
    expect(g.href).toBe(`/studio/reviews?course=${A}&run=${RUN_A}&week=3&status=waiting`);
  });

  it("a weekless group links by course and run only", () => {
    const [g] = waitingGroups([waiting({ week: null })]);
    expect(g.week).toBeNull();
    expect(g.href).toBe(`/studio/reviews?course=${A}&run=${RUN_A}&status=waiting`);
  });

  it("separates the same week of two runs", () => {
    expect(waitingGroups([waiting({}), waiting({ runId: RUN_B })])).toHaveLength(2);
  });
});

describe("voiceDraftGroups", () => {
  it("groups drafts by their oldest save and links to the draft filter", () => {
    const groups = voiceDraftGroups([
      row({ status: "draft", submittedAt: "2026-10-02T00:00:00Z", feedbackUpdatedAt: "2026-10-08T00:00:00Z" }),
      row({ status: "draft", enrolmentId: "e2", feedbackUpdatedAt: "2026-10-07T00:00:00Z" }),
      row({ status: "answered", feedbackUpdatedAt: "2026-10-01T00:00:00Z" }),
      waiting({}),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 2, oldestAt: "2026-10-07T00:00:00Z" });
    expect(groups[0].href).toBe(`/studio/reviews?course=${A}&run=${RUN_A}&week=1&status=draft`);
  });
});

describe("finalDraftGroups", () => {
  it("counts saved, unpublished comments per course and run", () => {
    const body = { paragraphs: [] } as unknown as FinalCommentRow["body"];
    const groups = finalDraftGroups([
      comment({ body, updatedAt: "2026-10-08T00:00:00Z" }),
      comment({ enrolmentId: "e2", body, updatedAt: "2026-10-06T00:00:00Z" }),
      comment({ enrolmentId: "e3", body, updatedAt: "2026-10-05T00:00:00Z", publishedAt: "2026-10-05T00:00:00Z" }),
      comment({ enrolmentId: "e4" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ week: null, count: 2, oldestAt: "2026-10-06T00:00:00Z" });
    expect(groups[0].href).toBe(`/studio/reviews?course=${A}&run=${RUN_A}#final-comments`);
  });
});

describe("upcomingCalls", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const call = (id: string, startsAt: string): InboxCall => ({
    callId: id,
    courseId: A,
    courseTitle: "Course A",
    runId: RUN_A,
    runTitle: "October",
    runStartsAt: "2026-10-01T00:00:00Z",
    startsAt,
    meetUrl: "https://meet.example/x",
    title: null,
  });

  it("keeps [now, now + 7 days), soonest first", () => {
    const got = upcomingCalls(
      [
        call("late", "2026-10-18T12:00:00Z"),
        call("past", "2026-10-11T11:59:59Z"),
        call("b", "2026-10-15T09:00:00Z"),
        call("a", "2026-10-11T12:00:00Z"),
        call("edge", "2026-10-18T11:59:59Z"),
      ],
      now,
    );
    expect(got.map((c) => c.callId)).toEqual(["a", "b", "edge"]);
  });
});

describe("ageLabel", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  it.each([
    ["2026-10-11T11:30:00Z", "under an hour"],
    ["2026-10-11T11:00:00Z", "1 hour"],
    ["2026-10-11T01:00:00Z", "11 hours"],
    ["2026-10-10T12:00:00Z", "1 day"],
    ["2026-10-08T01:00:00Z", "3 days"],
    ["2026-10-12T00:00:00Z", "under an hour"],
  ])("%s -> %s", (from, label) => {
    expect(ageLabel(from, now)).toBe(label);
  });
});
