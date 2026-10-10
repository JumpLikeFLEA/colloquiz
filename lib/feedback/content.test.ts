import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEEDBACK_CONTENT_MAX_CHARS, FeedbackContentSchema, feedbackTextLength } from "./content";

const migration = readFileSync(join(__dirname, "../../supabase/migrations/060_voice_submissions.sql"), "utf8");

describe("FeedbackContent (0096)", () => {
  it("accepts paragraphs of runs, bold optional", () => {
    const ok = FeedbackContentSchema.safeParse({
      paragraphs: [{ runs: [{ text: "Good " }, { text: "pronunciation", bold: true }] }, { runs: [{ text: "Line\nbreak" }] }],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an empty document, an empty paragraph, an empty run and extra keys", () => {
    expect(FeedbackContentSchema.safeParse({ paragraphs: [] }).success).toBe(false);
    expect(FeedbackContentSchema.safeParse({ paragraphs: [{ runs: [] }] }).success).toBe(false);
    expect(FeedbackContentSchema.safeParse({ paragraphs: [{ runs: [{ text: "" }] }] }).success).toBe(false);
    expect(FeedbackContentSchema.safeParse({ paragraphs: [{ runs: [{ text: "a", italic: true }] }] }).success).toBe(false);
    expect(FeedbackContentSchema.safeParse({ paragraphs: [{ runs: [{ text: "a" }] }], html: "<b>" }).success).toBe(false);
  });

  it("caps the total run text at the limit, inclusive", () => {
    const at = { paragraphs: [{ runs: [{ text: "a".repeat(FEEDBACK_CONTENT_MAX_CHARS - 1) }, { text: "b", bold: true }] }] };
    const over = { paragraphs: [{ runs: [{ text: "a".repeat(FEEDBACK_CONTENT_MAX_CHARS) }] }, { runs: [{ text: "b" }] }] };
    expect(feedbackTextLength(at)).toBe(FEEDBACK_CONTENT_MAX_CHARS);
    expect(FeedbackContentSchema.safeParse(at).success).toBe(true);
    expect(FeedbackContentSchema.safeParse(over).success).toBe(false);
  });

  it("uses the same cap as save_voice_feedback's SQL check", () => {
    const fn = migration.match(/FUNCTION _feedback_content_valid[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toContain(`RETURN v_total <= ${FEEDBACK_CONTENT_MAX_CHARS};`);
  });
});
