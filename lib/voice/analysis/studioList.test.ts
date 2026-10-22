import { describe, expect, it } from "vitest";
import {
  canHide,
  pageCount,
  parseVoiceListFilters,
  studioAnalysisState,
  toVoiceListRow,
  voiceListQuery,
} from "./studioList";

const ID = "0b0c63c4-5c6f-4f3b-9a36-3d1f0d3d6c11";

describe("parseVoiceListFilters", () => {
  it("reads a course id and a page", () => {
    expect(parseVoiceListFilters({ course: ID.toUpperCase(), page: "3" })).toEqual({ course: ID, page: 3 });
  });
  it("falls back for anything else", () => {
    expect(parseVoiceListFilters({ course: "x'; drop", page: "0" })).toEqual({ course: null, page: 1 });
    expect(parseVoiceListFilters({ page: "-2" })).toEqual({ course: null, page: 1 });
    expect(parseVoiceListFilters({ page: "2.5" })).toEqual({ course: null, page: 1 });
    expect(parseVoiceListFilters({})).toEqual({ course: null, page: 1 });
  });
  it("takes the first of a repeated param", () => {
    expect(parseVoiceListFilters({ course: [ID, "other"], page: ["2", "9"] })).toEqual({ course: ID, page: 2 });
  });
});

describe("voiceListQuery", () => {
  it("drops defaults", () => {
    expect(voiceListQuery({ course: null, page: 1 })).toBe("");
    expect(voiceListQuery({ course: ID, page: 2 })).toBe(`?course=${ID}&page=2`);
  });
});

describe("pageCount", () => {
  it("is at least one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
  });
});

describe("studioAnalysisState", () => {
  it("a hidden analysis is withdrawn whatever its status was", () => {
    expect(studioAnalysisState({ status: "done", hiddenAt: "2026-10-22T10:00:00Z" })).toBe("withdrawn");
    expect(studioAnalysisState({ status: "failed", hiddenAt: "2026-10-22T10:00:00Z" })).toBe("withdrawn");
  });
  it("names the rest", () => {
    expect(studioAnalysisState({ status: "done", hiddenAt: null })).toBe("done");
    expect(studioAnalysisState({ status: "failed", hiddenAt: null })).toBe("failed");
    for (const s of ["pending", "transcribing", "analysing"]) {
      expect(studioAnalysisState({ status: s, hiddenAt: null })).toBe("working");
    }
  });
  it("only a done one can be hidden", () => {
    expect(canHide("done")).toBe(true);
    for (const s of ["working", "failed", "withdrawn"] as const) expect(canHide(s)).toBe(false);
  });
});

describe("toVoiceListRow", () => {
  const raw = (over: Record<string, unknown> = {}, sub: Record<string, unknown> = {}) => ({
    submission_id: ID,
    status: "done",
    hidden_at: null,
    created_at: "2026-10-22T09:00:00Z",
    voice_submissions: {
      id: ID,
      user_id: "u1",
      course_id: "c1",
      lesson_id: "l1",
      block_id: "b1",
      enrolment_id: null,
      object_name: "c1/u1/x.webm",
      submitted_at: "2026-10-22T08:59:00Z",
      ...sub,
    },
    ...over,
  });

  it("maps a self-paced take", () => {
    expect(toVoiceListRow(raw())).toEqual({
      submissionId: ID,
      status: "done",
      hiddenAt: null,
      analysedAt: "2026-10-22T09:00:00Z",
      sentAt: "2026-10-22T08:59:00Z",
      userId: "u1",
      courseId: "c1",
      lessonId: "l1",
      blockId: "b1",
      cohort: false,
      purged: false,
    });
  });
  it("a take in a run is cohort; a purged object is purged", () => {
    const r = toVoiceListRow(raw({}, { enrolment_id: "e1", object_name: null }));
    expect(r?.cohort).toBe(true);
    expect(r?.purged).toBe(true);
  });
  it("accepts a one-element array for the embed", () => {
    const r = raw();
    expect(toVoiceListRow({ ...r, voice_submissions: [r.voice_submissions] })?.userId).toBe("u1");
  });
  it("rejects a row without its take, or with a missing field", () => {
    expect(toVoiceListRow(raw({ voice_submissions: null }))).toBeNull();
    expect(toVoiceListRow(raw({}, { user_id: null }))).toBeNull();
    expect(toVoiceListRow(raw({ status: 3 }))).toBeNull();
    expect(toVoiceListRow(null)).toBeNull();
  });
});
