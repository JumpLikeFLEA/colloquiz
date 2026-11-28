import { describe, expect, it } from "vitest";
import { NOTE_MAX, noteAddedId, noteFormError, noteLength, noteRpcOutcome, PHRASE_MAX, trimNote } from "./noteForm";

describe("noteFormError, 112's limits mirrored", () => {
  it("an empty or blank phrase is refused, whatever the note", () => {
    expect(noteFormError("", "")).toBe("phrase_empty");
    expect(noteFormError(" \n\t ", "a note")).toBe("phrase_empty");
  });

  it("200 characters pass, 201 do not [positive control beside the denial]", () => {
    expect(noteFormError("a".repeat(PHRASE_MAX), "")).toBeNull();
    expect(noteFormError("a".repeat(PHRASE_MAX + 1), "")).toBe("phrase_too_long");
  });

  it("a note of 500 passes, 501 does not; an empty note is no note", () => {
    expect(noteFormError("p", "b".repeat(NOTE_MAX))).toBeNull();
    expect(noteFormError("p", "b".repeat(NOTE_MAX + 1))).toBe("note_too_long");
    expect(noteFormError("p", "   ")).toBeNull();
  });

  it("the trim is 112's: edge space does not count, inner space does", () => {
    expect(noteFormError(` ${"a".repeat(PHRASE_MAX)}\n`, "")).toBeNull();
    expect(trimNote("  be about to \r\n")).toBe("be about to");
    expect(trimNote("be  about")).toBe("be  about");
  });

  it("a Cyrillic note counts one per letter and is accepted", () => {
    const note = "Говорят, когда что-то вот-вот случится";
    expect(noteLength(note)).toBe(note.length);
    expect(noteFormError("be about to", note)).toBeNull();
    expect(noteFormError("be about to", "ж".repeat(NOTE_MAX + 1))).toBe("note_too_long");
  });

  it("counts code points as char_length does: 200 emoji pass, though .length is 400", () => {
    const emoji = "😀".repeat(PHRASE_MAX);
    expect(emoji.length).toBe(400);
    expect(noteFormError(emoji, "")).toBeNull();
    expect(noteFormError(emoji + "😀", "")).toBe("phrase_too_long");
  });

  it("the phrase is checked before the note, as in SQL", () => {
    expect(noteFormError("", "b".repeat(NOTE_MAX + 1))).toBe("phrase_empty");
  });
});

describe("noteRpcOutcome", () => {
  it("ok only on ok: true", () => {
    expect(noteRpcOutcome({ ok: true, id: "x" }, null)).toEqual({ ok: true });
    expect(noteRpcOutcome({ ok: "true" }, null)).toEqual({ ok: false, error: "failed" });
    expect(noteRpcOutcome(null, null)).toEqual({ ok: false, error: "failed" });
  });

  it("names the RPC's own refusals, and someone else's entry is not_found", () => {
    expect(noteRpcOutcome({ ok: false, error: "phrase_too_long" }, null)).toEqual({ ok: false, error: "phrase_too_long" });
    expect(noteRpcOutcome({ ok: false, error: "not_found" }, null)).toEqual({ ok: false, error: "not_found" });
    expect(noteRpcOutcome({ ok: false, error: "not_readable" }, null)).toEqual({ ok: false, error: "not_readable" });
    expect(noteRpcOutcome({ ok: false, error: "unauthenticated" }, null)).toEqual({ ok: false, error: "unauthenticated" });
    expect(noteRpcOutcome({ ok: false, error: "something_new" }, null)).toEqual({ ok: false, error: "failed" });
  });

  it("the cap is the trigger's PT429; any other error is failed", () => {
    expect(noteRpcOutcome(null, { code: "PT429" })).toEqual({ ok: false, error: "note_cap" });
    expect(noteRpcOutcome(null, { code: "42501" })).toEqual({ ok: false, error: "failed" });
  });
});

describe("noteAddedId", () => {
  it("reads the new row's id [positive control beside each null]", () => {
    expect(noteAddedId({ ok: true, id: "8c1d" })).toBe("8c1d");
    expect(noteAddedId({ ok: true })).toBeNull();
    expect(noteAddedId({ ok: true, id: "" })).toBeNull();
    expect(noteAddedId({ ok: true, id: 3 })).toBeNull();
    expect(noteAddedId(null)).toBeNull();
  });
});
