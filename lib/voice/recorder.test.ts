import { describe, expect, it } from "vitest";
import {
  VOICE_RECORDER_CANDIDATES,
  bareVoiceMime,
  formatClock,
  pickRecorderMimeType,
  recorderSupport,
  resolveUploadMime,
  sniffVoiceMime,
  submitOutcome,
  uploadPercent,
} from "./recorder";
import { VOICE_MIME_TYPES } from "./recording";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
const JUNK = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]); // "ID3", an mp3

describe("pickRecorderMimeType", () => {
  it("takes the first candidate the browser claims (Chrome 155's list, 0097)", () => {
    const chrome = new Set(["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mp4;codecs=mp4a.40.2"]);
    expect(pickRecorderMimeType((t) => chrome.has(t))).toBe("audio/webm;codecs=opus");
  });

  it("falls through to mp4 when only mp4 is claimed (Safari, assumed)", () => {
    expect(pickRecorderMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("returns null when nothing is claimed, when isTypeSupported is missing, or when it throws", () => {
    expect(pickRecorderMimeType(() => false)).toBeNull();
    expect(pickRecorderMimeType(undefined)).toBeNull();
    expect(
      pickRecorderMimeType(() => {
        throw new Error("nope");
      }),
    ).toBeNull();
  });

  it("every candidate's container is one the bucket accepts (060)", () => {
    for (const c of VOICE_RECORDER_CANDIDATES) expect(VOICE_MIME_TYPES).toContain(bareVoiceMime(c));
  });
});

describe("sniffVoiceMime / resolveUploadMime", () => {
  it("reads webm, ogg and mp4 from the bytes", () => {
    expect(sniffVoiceMime(WEBM)).toBe("audio/webm");
    expect(sniffVoiceMime(OGG)).toBe("audio/ogg");
    expect(sniffVoiceMime(MP4)).toBe("audio/mp4");
    expect(sniffVoiceMime(JUNK)).toBeNull();
    expect(sniffVoiceMime(new Uint8Array([0x1a, 0x45]))).toBeNull();
  });

  it("Firefox's case: empty reported and requested types, the bytes decide (0097)", () => {
    expect(resolveUploadMime(OGG, "", null)).toBe("audio/ogg");
    expect(resolveUploadMime(WEBM, "", null)).toBe("audio/webm");
  });

  it("the bytes win over a reported type that disagrees", () => {
    expect(resolveUploadMime(OGG, "audio/webm;codecs=opus", "audio/webm;codecs=opus")).toBe("audio/ogg");
  });

  it("unreadable bytes fall back to the reported type, then the requested one", () => {
    expect(resolveUploadMime(JUNK, "audio/webm;codecs=opus", null)).toBe("audio/webm");
    expect(resolveUploadMime(JUNK, "", "audio/ogg;codecs=opus")).toBe("audio/ogg");
  });

  it("a take in no accepted container can't be sent", () => {
    expect(resolveUploadMime(JUNK, "audio/mpeg", "")).toBeNull();
    expect(bareVoiceMime("audio/wav")).toBeNull();
  });
});

describe("recorderSupport", () => {
  it("needs both getUserMedia and MediaRecorder", () => {
    expect(recorderSupport({ hasGetUserMedia: true, hasMediaRecorder: true })).toBe("supported");
    expect(recorderSupport({ hasGetUserMedia: false, hasMediaRecorder: true })).toBe("unsupported");
    expect(recorderSupport({ hasGetUserMedia: true, hasMediaRecorder: false })).toBe("unsupported");
  });
});

describe("formatClock / uploadPercent", () => {
  it("formats the clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(150)).toBe("2:30");
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(-3)).toBe("0:00");
  });

  it("clamps the upload percent", () => {
    expect(uploadPercent(0, 0)).toBe(0);
    expect(uploadPercent(50, 200)).toBe(25);
    expect(uploadPercent(300, 200)).toBe(100);
  });
});

describe("submitOutcome", () => {
  it("maps the submit route's answers", () => {
    expect(submitOutcome(200, null)).toBe("sent");
    expect(submitOutcome(409, "duplicate_submission")).toBe("sent");
    expect(submitOutcome(403, "not_enrolled")).toBe("practice");
    expect(submitOutcome(403, "lesson_not_open")).toBe("practice");
    expect(submitOutcome(401, "unauthenticated")).toBe("practice");
    expect(submitOutcome(409, "locked")).toBe("locked");
    expect(submitOutcome(422, "object_missing")).toBe("retry");
    expect(submitOutcome(500, "internal")).toBe("retry");
  });
});
