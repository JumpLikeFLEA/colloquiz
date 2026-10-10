import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VOICE_BUCKET,
  VOICE_EXTENSION,
  VOICE_MAX_BYTES,
  VOICE_MIME_TYPES,
  VOICE_WORST_CASE_BYTES,
  isVoiceMimeType,
  parseVoiceObjectName,
  voiceObjectName,
} from "./recording";

const COURSE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const SUB = "33333333-3333-4333-8333-333333333333";

const migration = readFileSync(join(__dirname, "../../supabase/migrations/060_voice_submissions.sql"), "utf8");

describe("voice object names", () => {
  it("builds {course}/{user}/{submission}.{ext} and parses it back", () => {
    const name = voiceObjectName(COURSE, USER, SUB, "audio/webm");
    expect(name).toBe(`${COURSE}/${USER}/${SUB}.webm`);
    expect(parseVoiceObjectName(name)).toEqual({ courseId: COURSE, userId: USER, submissionId: SUB, extension: "webm" });
  });

  it("lower-cases the ids, so the SQL check (text of a uuid is lower case) matches", () => {
    expect(voiceObjectName(COURSE.toUpperCase(), USER, SUB, "audio/mp4")).toBe(`${COURSE}/${USER}/${SUB}.m4a`);
  });

  it("rejects anything that is not three UUIDs and a known extension", () => {
    expect(() => voiceObjectName("not-a-uuid", USER, SUB, "audio/ogg")).toThrow();
    expect(parseVoiceObjectName(`${COURSE}/${USER}/${SUB}.mp3`)).toBeNull();
    expect(parseVoiceObjectName(`${COURSE}/${USER}/../${SUB}.webm`)).toBeNull();
    expect(parseVoiceObjectName(`${USER}/${SUB}.webm`)).toBeNull();
  });

  it("accepts only the bucket's bare container types", () => {
    expect(isVoiceMimeType("audio/webm")).toBe(true);
    expect(isVoiceMimeType("audio/webm;codecs=opus")).toBe(false);
    expect(isVoiceMimeType("")).toBe(false);
  });
});

describe("limits agree with migration 060", () => {
  it("fits the longest take at the unrequested Chrome bitrate", () => {
    expect(VOICE_WORST_CASE_BYTES).toBe(9_600_000);
    expect(VOICE_MAX_BYTES).toBeGreaterThanOrEqual(VOICE_WORST_CASE_BYTES);
  });

  it("uses the same bucket id, size limit and MIME list as the bucket insert", () => {
    const insert = migration.match(/INSERT INTO storage\.buckets[\s\S]*?ON CONFLICT/)?.[0] ?? "";
    expect(insert).toContain(`'${VOICE_BUCKET}'`);
    expect(insert).toContain("FALSE,");
    expect(insert).toContain(`${VOICE_MAX_BYTES},`);
    expect(insert).toContain(`ARRAY[${VOICE_MIME_TYPES.map((m) => `'${m}'`).join(", ")}]`);
  });

  it("checks the same extensions in submit_voice_recording", () => {
    const exts = Object.values(VOICE_EXTENSION).join("|");
    expect(migration).toContain(`'\\.(${exts})$'`);
  });
});
