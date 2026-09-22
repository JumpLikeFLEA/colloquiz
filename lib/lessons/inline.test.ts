import { describe, expect, it } from "vitest";
import { InlineContentSchema, InlineRunSchema } from "./inline";

describe("InlineRunSchema", () => {
  it("accepts plain text with no marks", () => {
    const result = InlineRunSchema.safeParse({ text: "hello" });
    expect(result.success).toBe(true);
  });

  it("accepts emphasis, english, or both together", () => {
    expect(InlineRunSchema.safeParse({ text: "hello", marks: ["emphasis"] }).success).toBe(true);
    expect(InlineRunSchema.safeParse({ text: "hello", marks: ["english"] }).success).toBe(true);
    expect(InlineRunSchema.safeParse({ text: "hello", marks: ["emphasis", "english"] }).success).toBe(true);
  });

  it("rejects a mark outside emphasis/english", () => {
    const result = InlineRunSchema.safeParse({ text: "hello", marks: ["strikethrough"] });
    expect(result.success).toBe(false);
  });

  it("rejects a repeated mark", () => {
    const result = InlineRunSchema.safeParse({ text: "hello", marks: ["emphasis", "emphasis"] });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized field (strict object)", () => {
    const result = InlineRunSchema.safeParse({ text: "hello", bold: true });
    expect(result.success).toBe(false);
  });

  it("rejects empty text", () => {
    const result = InlineRunSchema.safeParse({ text: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a control character (multi-line prose belongs in separate blocks)", () => {
    const result = InlineRunSchema.safeParse({ text: "line one\nline two" });
    expect(result.success).toBe(false);
  });
});

describe("InlineContentSchema", () => {
  it("accepts a non-empty sequence of runs", () => {
    const result = InlineContentSchema.safeParse([{ text: "Hello " }, { text: "world", marks: ["emphasis"] }]);
    expect(result.success).toBe(true);
  });

  it("rejects an empty array — no content to render", () => {
    const result = InlineContentSchema.safeParse([]);
    expect(result.success).toBe(false);
  });
});
