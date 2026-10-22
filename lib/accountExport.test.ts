import { describe, expect, it } from "vitest";
import { buildExportPayload, type ConversationExportRow } from "./accountExport";

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
  voiceSubmissions: [],
  voiceAudio: {},
  finalComments: [],
  teacherLinks: [],
  teacherGroups: [],
  conversations: [],
  homework: [],
  authorSeat: null,
  calendarFeed: null,
  telegramLink: null,
  voiceAnalyses: [],
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
            response: { selected: ["o1"] },
            created_at: "2026-09-20T12:00:00.000Z",
          },
          {
            id: "attempt-2",
            lesson_version_id: "version-1",
            block_id: "block-2",
            earned: 1,
            possible: 1,
            response: null,
            created_at: "2026-09-20T12:01:00.000Z",
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
        response: { selected: ["o1"] },
        recorded_at: "2026-09-20T12:00:00.000Z",
      },
      {
        attempt_id: "attempt-2",
        lesson_version_id: "version-1",
        block_id: "block-2",
        earned: 1,
        possible: 1,
        response: null,
        recorded_at: "2026-09-20T12:01:00.000Z",
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

});

describe("buildExportPayload — voice_submissions (VOICE-004)", () => {
  const take = {
    id: "sub-1",
    lesson_id: "lesson-1",
    block_id: "v1",
    lesson_version_id: "version-1",
    content_type: "audio/webm",
    size_bytes: 1234,
    submitted_at: "2026-10-12T10:00:00.000Z",
    purged_at: null,
    lessons: { slug: "week-1", title: "Week 1", courses: { slug: "cohort", title: "Cohort" } },
    voice_feedback: {
      body: { paragraphs: [{ runs: [{ text: "Good", bold: true }] }] },
      published_at: "2026-10-13T10:00:00.000Z",
      updated_at: "2026-10-13T11:00:00.000Z",
    },
  };

  it("is empty when the reader sent no recording", () => {
    expect(buildExportPayload(baseSources, []).voice_submissions).toEqual([]);
  });

  it("carries the audio copy and the published feedback", () => {
    const payload = buildExportPayload(
      { ...baseSources, voiceSubmissions: [take], voiceAudio: { "sub-1": "QUJD" } },
      [],
    );
    expect(payload.voice_submissions).toEqual([
      {
        submission_id: "sub-1",
        course_slug: "cohort",
        course_title: "Cohort",
        lesson_slug: "week-1",
        lesson_title: "Week 1",
        block_id: "v1",
        lesson_version_id: "version-1",
        submitted_at: "2026-10-12T10:00:00.000Z",
        removed_at: null,
        content_type: "audio/webm",
        size_bytes: 1234,
        audio_base64: "QUJD",
        feedback: {
          content: { paragraphs: [{ runs: [{ text: "Good", bold: true }] }] },
          published_at: "2026-10-13T10:00:00.000Z",
          updated_at: "2026-10-13T11:00:00.000Z",
        },
      },
    ]);
  });

  it("gives a removed take no audio, and an unpublished feedback row no feedback", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        voiceSubmissions: [
          { ...take, purged_at: "2027-05-01T00:00:00.000Z", voice_feedback: { body: {}, published_at: null } },
        ],
      },
      [],
    );
    expect(payload.voice_submissions[0]).toMatchObject({
      removed_at: "2027-05-01T00:00:00.000Z",
      audio_base64: null,
      feedback: null,
    });
  });

});

describe("buildExportPayload — final_comments (COH-008)", () => {
  const comment = {
    enrolment_id: "enr-1",
    run_id: "run-1",
    body: { paragraphs: [{ runs: [{ text: "Well done", bold: true }] }] },
    published_at: "2026-11-10T10:00:00.000Z",
    updated_at: "2026-11-11T10:00:00.000Z",
    course_runs: { title: "November run", starts_at: "2026-10-12T00:00:00.000Z", ends_at: "2026-11-09T00:00:00.000Z" },
    courses: { slug: "cohort", title: "Cohort" },
  };

  it("is empty when the reader has no final comment", () => {
    expect(buildExportPayload(baseSources, []).final_comments).toEqual([]);
  });

  it("maps a published comment with its run and course", () => {
    const payload = buildExportPayload({ ...baseSources, finalComments: [comment] }, []);
    expect(payload.final_comments).toEqual([
      {
        enrolment_id: "enr-1",
        run_id: "run-1",
        run_title: "November run",
        run_starts_at: "2026-10-12T00:00:00.000Z",
        run_ends_at: "2026-11-09T00:00:00.000Z",
        course_slug: "cohort",
        course_title: "Cohort",
        content: { paragraphs: [{ runs: [{ text: "Well done", bold: true }] }] },
        published_at: "2026-11-10T10:00:00.000Z",
        updated_at: "2026-11-11T10:00:00.000Z",
      },
    ]);
  });

  it("drops a draft, which an editor enrolled in their own course could read", () => {
    const payload = buildExportPayload(
      { ...baseSources, finalComments: [{ ...comment, enrolment_id: "enr-2", published_at: null }, comment] },
      [],
    );
    expect(payload.final_comments.map((c) => c.enrolment_id)).toEqual(["enr-1"]);
  });

  it("is format version 15", () => {
    expect(buildExportPayload(baseSources, []).meta.format_version).toBe(16);
  });
});

describe("buildExportPayload — teacher_links (TCH-001)", () => {
  it("is empty for a reader who never linked", () => {
    expect(buildExportPayload(baseSources, []).teacher_links).toEqual([]);
  });

  it("exports active and ended links with who ended them", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        teacherLinks: [
          { link_id: "l1", teacher_name: "Anna", source: "join_link", linked_at: "2026-10-01T00:00:00Z", ended_at: null, ended_by: null },
          { link_id: "l2", teacher_name: "Boris", source: "run_invite", linked_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-20T00:00:00Z", ended_by: "you" },
        ],
      },
      [],
    );
    expect(payload.teacher_links).toEqual([
      { link_id: "l1", teacher_name: "Anna", source: "join_link", linked_at: "2026-10-01T00:00:00Z", ended_at: null, ended_by: null },
      { link_id: "l2", teacher_name: "Boris", source: "run_invite", linked_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-20T00:00:00Z", ended_by: "you" },
    ]);
  });
});

describe("buildExportPayload — teacher_groups (TCH-002)", () => {
  it("is empty for a reader in no group", () => {
    expect(buildExportPayload(baseSources, []).teacher_groups).toEqual([]);
  });

  it("exports group names with the teacher and date, nothing else", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        teacherGroups: [{ group_name: "Evening class", teacher_name: "Anna", added_at: "2026-10-02T00:00:00Z" }],
      },
      [],
    );
    expect(payload.teacher_groups).toEqual([
      { group_name: "Evening class", teacher_name: "Anna", added_at: "2026-10-02T00:00:00Z" },
    ]);
  });
});

describe("buildExportPayload — teacher_conversations (TCH-004)", () => {
  const body = (text: string) => ({ paragraphs: [{ runs: [{ text }] }] });
  const row = (over: Partial<ConversationExportRow>): ConversationExportRow => ({
    conversation_id: "c1",
    teacher_name: "Anna",
    is_open: true,
    message_id: "m1",
    author: "you",
    body: body("hi"),
    created_at: "2026-10-16T10:00:00Z",
    read_at: null,
    ...over,
  });

  it("is empty for a reader who never wrote to a teacher", () => {
    expect(buildExportPayload(baseSources, []).teacher_conversations).toEqual([]);
  });

  it("groups messages by conversation, keeping their order, who wrote them and whether it is closed", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        conversations: [
          row({ message_id: "m1" }),
          row({ message_id: "m2", author: "teacher", body: body("hello"), created_at: "2026-10-16T11:00:00Z", read_at: "2026-10-16T12:00:00Z" }),
          row({ conversation_id: "c2", teacher_name: "Boris", is_open: false, message_id: "m3" }),
        ],
      },
      [],
    );
    expect(payload.teacher_conversations).toEqual([
      {
        conversation_id: "c1",
        teacher_name: "Anna",
        open: true,
        messages: [
          { message_id: "m1", from: "you", content: body("hi"), attachment: null, sent_at: "2026-10-16T10:00:00Z", read_at: null },
          { message_id: "m2", from: "teacher", content: body("hello"), attachment: null, sent_at: "2026-10-16T11:00:00Z", read_at: "2026-10-16T12:00:00Z" },
        ],
      },
      {
        conversation_id: "c2",
        teacher_name: "Boris",
        open: false,
        messages: [{ message_id: "m3", from: "you", content: body("hi"), attachment: null, sent_at: "2026-10-16T10:00:00Z", read_at: null }],
      },
    ]);
  });

  it("carries the frozen exercise a student attached (TCH-006), whole, and null when there is none", () => {
    const attachment = { v: 1, kind: "exercise", number: 2, block: { id: "b" }, response: { order: ["a"] } };
    const payload = buildExportPayload(
      { ...baseSources, conversations: [row({ message_id: "m1", attachment }), row({ message_id: "m2" })] },
      [],
    );
    expect(payload.teacher_conversations[0].messages.map((m) => m.attachment)).toEqual([attachment, null]);
  });
});

describe("buildExportPayload — homework (TCH-005)", () => {
  it("is empty for a reader nobody assigned anything to", () => {
    expect(buildExportPayload(baseSources, []).homework).toEqual([]);
  });

  it("lists the teacher, the content, the due date and the note, without the assignment id", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        homework: [
          {
            assignment_id: "a1",
            teacher_name: "Anna",
            course_title: "Future Imperfect",
            lesson_title: "True or false",
            due_on: "2026-10-20",
            note: "Do this first",
            assigned_at: "2026-10-16T10:00:00Z",
          },
          {
            assignment_id: "a2",
            teacher_name: "Anna",
            course_title: "Grammar drilling",
            lesson_title: null,
            due_on: null,
            note: null,
            assigned_at: "2026-10-17T10:00:00Z",
          },
        ],
      },
      [],
    );
    expect(payload.homework).toEqual([
      { teacher_name: "Anna", course_title: "Future Imperfect", lesson_title: "True or false", due_on: "2026-10-20", note: "Do this first", assigned_at: "2026-10-16T10:00:00Z" },
      { teacher_name: "Anna", course_title: "Grammar drilling", lesson_title: null, due_on: null, note: null, assigned_at: "2026-10-17T10:00:00Z" },
    ]);
  });
});

describe("buildExportPayload — author_seat (TCH-007)", () => {
  it("is null for a reader without a seat", () => {
    expect(buildExportPayload(baseSources, []).author_seat).toBeNull();
  });

  it("carries the reader's own seat, notes included, under the export's field names", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        authorSeat: {
          kind: "teacher",
          public_name: "Anna",
          expires_at: "2027-01-31T23:59:59Z",
          notes: "Paid for a year",
          created_at: "2026-10-16T10:00:00Z",
        },
      },
      [],
    );
    expect(payload.author_seat).toEqual({
      kind: "teacher",
      public_name: "Anna",
      expires_at: "2027-01-31T23:59:59Z",
      notes: "Paid for a year",
      granted_at: "2026-10-16T10:00:00Z",
    });
  });

  it("keeps an open-ended seat's null expiry", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        authorSeat: { kind: "house", public_name: "Anna", expires_at: null, notes: null, created_at: "2026-10-16T10:00:00Z" },
      },
      [],
    );
    expect(payload.author_seat).toMatchObject({ kind: "house", expires_at: null, notes: null });
  });
});

describe("buildExportPayload — calendar_feed (COH-016)", () => {
  it("says there is no feed when the reader has no token", () => {
    expect(buildExportPayload(baseSources, []).calendar_feed).toEqual({ enabled: false, created_at: null });
  });

  it("says there is one, with its date, and carries nothing that could be the address", () => {
    const payload = buildExportPayload(
      { ...baseSources, calendarFeed: { has_token: true, created_at: "2026-10-17T10:00:00Z" } },
      [],
    );
    expect(payload.calendar_feed).toEqual({ enabled: true, created_at: "2026-10-17T10:00:00Z" });
    expect(JSON.stringify(payload)).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("buildExportPayload — telegram_reminders (COH-010)", () => {
  it("is null when the reader never linked the bot", () => {
    expect(buildExportPayload(baseSources, []).telegram_reminders).toBeNull();
  });

  it("carries the chat, language, zone and dates, and the chat id as a string", () => {
    const payload = buildExportPayload(
      {
        ...baseSources,
        telegramLink: { chat_id: 15027785433, lang: "ru", time_zone: "Europe/Belgrade", linked_at: "2026-10-18T10:00:00Z", stopped_at: null },
      },
      [],
    );
    expect(payload.telegram_reminders).toEqual({
      chat_id: "15027785433",
      language: "ru",
      time_zone: "Europe/Belgrade",
      linked_at: "2026-10-18T10:00:00Z",
      stopped_at: null,
    });
  });
});

describe("buildExportPayload — voice_analyses (VOICE-016)", () => {
  const row = {
    submission_id: "sub-1",
    status: "done",
    instruction: "final",
    transcript: "um I think so",
    result: { mainError: { quote: "I think so" } },
    prompt_version: "v1",
    model: "claude-test",
    baseline_submission_id: "sub-0",
    hidden_at: null,
    created_at: "2026-10-22T10:00:00.000Z",
    finished_at: "2026-10-22T10:01:00.000Z",
  };

  it("is an empty list for a reader with none", () => {
    expect(buildExportPayload(baseSources, []).voice_analyses).toEqual([]);
  });

  it("carries the transcript and analysis, keyed by submission", () => {
    const [out] = buildExportPayload({ ...baseSources, voiceAnalyses: [row] }, []).voice_analyses;
    expect(out).toEqual({
      submission_id: "sub-1",
      status: "done",
      kind: "final",
      transcript: "um I think so",
      analysis: { mainError: { quote: "I think so" } },
      prompt_version: "v1",
      model: "claude-test",
      compared_with_submission_id: "sub-0",
      withdrawn_at: null,
      created_at: "2026-10-22T10:00:00.000Z",
      finished_at: "2026-10-22T10:01:00.000Z",
    });
  });

  it("keeps a withdrawn analysis, marked withdrawn", () => {
    const [out] = buildExportPayload(
      { ...baseSources, voiceAnalyses: [{ ...row, hidden_at: "2026-10-23T09:00:00.000Z" }] },
      [],
    ).voice_analyses;
    expect(out.withdrawn_at).toBe("2026-10-23T09:00:00.000Z");
    expect(out.transcript).toBe("um I think so");
  });

  it("never exports usage, the failure string or who hid it", () => {
    const leaky = { ...row, usage: { tokens: 1 }, failure: "boom", hidden_by: "teacher-1", send_id: "s" };
    const json = JSON.stringify(buildExportPayload({ ...baseSources, voiceAnalyses: [leaky] }, []).voice_analyses);
    expect(json).not.toMatch(/usage|boom|teacher-1|send_id|hidden_by/);
  });
});
