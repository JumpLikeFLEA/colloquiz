import { describe, expect, it } from "vitest";
import { decideRecordingDownload, recordingFileName, recordingFormat } from "./download";

const row = { user_id: "me", object_name: "c/me/t.webm", content_type: "audio/webm", submitted_at: "2026-11-25T14:07:00Z" };

describe("recordingFormat", () => {
  it("names each accepted container", () => {
    expect(recordingFormat("audio/webm")).toBe("webm");
    expect(recordingFormat("audio/ogg")).toBe("ogg");
    expect(recordingFormat("audio/mp4")).toBe("m4a");
    expect(recordingFormat("Audio/WebM; codecs=opus")).toBe("webm");
  });
  it("is null for anything else", () => {
    expect(recordingFormat("audio/wav")).toBeNull();
    expect(recordingFormat(null)).toBeNull();
  });
});

describe("recordingFileName", () => {
  it("is readable and ASCII", () => {
    expect(recordingFileName("2026-11-25T14:07:00Z", "m4a")).toBe("alina-cher-recording-2026-11-25-1407.m4a");
    expect(recordingFileName("2026-11-25T14:07:00+03:00", null)).toBe("alina-cher-recording-2026-11-25-1107.audio");
  });
});

describe("decideRecordingDownload", () => {
  it("lets the owner download, with a file name", () => {
    expect(decideRecordingDownload(row, "me")).toEqual({
      kind: "ok",
      objectName: "c/me/t.webm",
      fileName: "alina-cher-recording-2026-11-25-1407.webm",
    });
  });
  it("answers not_found for anyone else, even when RLS returned the row (an editor)", () => {
    expect(decideRecordingDownload(row, "editor")).toEqual({ kind: "not_found" });
    expect(decideRecordingDownload(null, "me")).toEqual({ kind: "not_found" });
  });
  it("answers gone for the owner's purged take, and not_found for someone else's", () => {
    expect(decideRecordingDownload({ ...row, object_name: null }, "me")).toEqual({ kind: "gone" });
    expect(decideRecordingDownload({ ...row, object_name: null }, "editor")).toEqual({ kind: "not_found" });
  });
});
