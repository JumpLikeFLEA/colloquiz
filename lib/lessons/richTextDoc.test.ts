import { describe, expect, it } from "vitest";
import { InlineContentSchema, type InlineContent } from "./inline";
import { docToRuns, normalizeRuns, runsToDoc, type RichTextDoc } from "./richTextDoc";

// AUTH-025, docs/decisions/0233.

const roundTrip = (runs: InlineContent) => docToRuns(runsToDoc(runs));

describe("runsToDoc", () => {
  it("puts one paragraph with marked text nodes", () => {
    expect(runsToDoc([{ text: "Hello " }, { text: "world", marks: ["emphasis"] }])).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "emphasis" }] },
          ],
        },
      ],
    });
  });

  it("turns a line feed into a hard break carrying the run's marks", () => {
    const doc = runsToDoc([{ text: "a\nb", marks: ["mark_a"] }]);
    expect(doc.content?.[0].content).toEqual([
      { type: "text", text: "a", marks: [{ type: "mark_a" }] },
      { type: "hardBreak", marks: [{ type: "mark_a" }] },
      { type: "text", text: "b", marks: [{ type: "mark_a" }] },
    ]);
  });

  it("gives an empty field an empty paragraph", () => {
    expect(runsToDoc([{ text: "" }])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("emits no empty text node for leading, trailing or doubled line feeds", () => {
    const nodes = runsToDoc([{ text: "\na\n\n" }]).content?.[0].content ?? [];
    expect(nodes.map((n) => n.type)).toEqual(["hardBreak", "text", "hardBreak", "hardBreak"]);
  });
});

describe("docToRuns", () => {
  it("reads an empty document as [{ text: \"\" }], which the schema refuses as before", () => {
    expect(docToRuns({ type: "doc", content: [{ type: "paragraph" }] })).toEqual([{ text: "" }]);
    expect(docToRuns({ type: "doc" })).toEqual([{ text: "" }]);
    expect(docToRuns(null)).toEqual([{ text: "" }]);
    expect(InlineContentSchema.safeParse(docToRuns(null)).success).toBe(false);
  });

  it("merges adjacent nodes with the same marks, a hard break included", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Two", marks: [{ type: "english" }, { type: "emphasis" }] },
            { type: "hardBreak", marks: [{ type: "emphasis" }, { type: "english" }] },
            { type: "text", text: "lines", marks: [{ type: "emphasis" }, { type: "english" }] },
            { type: "text", text: " plain" },
          ],
        },
      ],
    };
    expect(docToRuns(doc)).toEqual([
      { text: "Two\nlines", marks: ["emphasis", "english"] },
      { text: " plain" },
    ]);
  });

  it("drops unknown nodes and marks, and mark_b beside mark_a", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "bold" }] },
            { type: "image" },
            { type: "text", text: "y", marks: [{ type: "mark_b" }, { type: "mark_a" }] },
          ],
        },
      ],
    };
    expect(docToRuns(doc)).toEqual([{ text: "x" }, { text: "y", marks: ["mark_a"] }]);
  });

  it("joins a second paragraph with a line feed", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
      ],
    };
    expect(docToRuns(doc)).toEqual([{ text: "one\ntwo" }]);
  });
});

describe("round trip", () => {
  const cases: InlineContent[] = [
    [{ text: "plain" }],
    [{ text: "Hello " }, { text: "world", marks: ["emphasis"] }, { text: "!" }],
    [{ text: "line one\nline two" }],
    [{ text: "a" }, { text: "\nb", marks: ["emphasis", "english"] }],
    [{ text: "\n\n" }],
    [{ text: "x", marks: ["emphasis", "english", "mark_a"] }, { text: "y", marks: ["mark_b"] }],
    [{ text: "" }],
  ];

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))("keeps %s", (_label, runs) => {
    expect(roundTrip(runs)).toEqual(runs);
  });

  it("returns the canonical form for split, reordered or CRLF runs", () => {
    const runs = [
      { text: "a", marks: ["english", "emphasis"] },
      { text: "b", marks: ["emphasis", "english"] },
      { text: "" },
      { text: "c\r\nd" },
    ] as InlineContent;
    expect(roundTrip(runs)).toEqual([{ text: "ab", marks: ["emphasis", "english"] }, { text: "c\nd" }]);
    expect(roundTrip(runs)).toEqual(normalizeRuns(runs));
  });

  it("is idempotent on any generated run list", () => {
    const marks = [[], ["emphasis"], ["english"], ["mark_a"], ["mark_b", "emphasis"]] as const;
    const texts = ["a", "b c", "\n", "x\ny", "", "\n\nz"];
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 300; i++) {
      const runs = Array.from({ length: 1 + next(5) }, () => {
        const m = marks[next(marks.length)];
        const text = texts[next(texts.length)];
        return m.length > 0 ? { text, marks: [...m] } : { text };
      }) as InlineContent;
      const once = roundTrip(runs);
      expect(once).toEqual(normalizeRuns(runs));
      expect(roundTrip(once)).toEqual(once);
      // Meaning is kept: the same characters in order.
      expect(once.map((r) => r.text).join("")).toBe(runs.map((r) => r.text).join(""));
    }
  });
});
