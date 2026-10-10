import { describe, expect, it } from "vitest";
import { inlinePlainText, voiceTaskPlainText } from "./plainText";

describe("voiceTaskPlainText", () => {
  it("renders a before task with its limit and its prompt, marks dropped", () => {
    expect(
      voiceTaskPlainText({
        id: "v1",
        kind: "task",
        type: "voice",
        prompt: [{ text: "Tell us about " }, { text: "your week", marks: ["emphasis", "english"] }, { text: "." }],
        maxSeconds: 180,
        compare: "before",
      }),
    ).toBe("Voice task (before) — up to 3 min\nTell us about your week.");
  });

  it("renders a weekly task with no compare slot", () => {
    expect(
      voiceTaskPlainText({ id: "v2", kind: "task", type: "voice", prompt: [{ text: "Say hello." }], maxSeconds: 90 }),
    ).toBe("Voice task — up to 1 min 30 s\nSay hello.");
  });
});

describe("inlinePlainText", () => {
  it("joins runs without separators", () => {
    expect(inlinePlainText([{ text: "a" }, { text: "b", marks: ["mark_a"] }])).toBe("ab");
  });
});
