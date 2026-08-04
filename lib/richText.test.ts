import { describe, it, expect, beforeEach } from "vitest";
import {
  segmentMath,
  renderSegments,
  renderToHtml,
  __clearRichTextCache,
  __richTextCacheSize,
  __CACHE_CAP,
  type Segment,
} from "./richText";

describe("segmentMath", () => {
  // Table: [name, input, expected segments]
  const cases: [string, string, Segment[]][] = [
    [
      "plain text round-trips",
      "the limit exists",
      [{ type: "text", value: "the limit exists" }],
    ],
    [
      "plain Unicode round-trips byte-identical",
      "α → β, x² ≤ y³ · √2",
      [{ type: "text", value: "α → β, x² ≤ y³ · √2" }],
    ],
    [
      "a string containing $500 is untouched",
      "already paid $500 for it",
      [{ type: "text", value: "already paid $500 for it" }],
    ],
    [
      "\\\\[6pt] in text stays literal (not a block open)",
      "line \\\\[6pt] break",
      [{ type: "text", value: "line \\\\[6pt] break" }],
    ],
    [
      "\\\\( in text stays literal (not an inline open)",
      "a \\\\( b",
      [{ type: "text", value: "a \\\\( b" }],
    ],
    [
      "a real inline segment",
      "value \\(x + 1\\) here",
      [
        { type: "text", value: "value " },
        { type: "inline", value: "x + 1" },
        { type: "text", value: " here" },
      ],
    ],
    [
      "a real display segment",
      "\\[\\int_0^1 x^2\\,dx\\]",
      [{ type: "block", value: "\\int_0^1 x^2\\,dx" }],
    ],
    [
      "\\\\\\( = literal pair THEN a real inline open",
      "\\\\\\(x\\)",
      [
        { type: "text", value: "\\\\" },
        { type: "inline", value: "x" },
      ],
    ],
    [
      "unterminated \\(x + 1 falls back to text",
      "prefix \\(x + 1",
      [{ type: "text", value: "prefix \\(x + 1" }],
    ],
    [
      "unterminated \\[ falls back to text",
      "prefix \\[",
      [{ type: "text", value: "prefix \\[" }],
    ],
    [
      "a stray \\) with no opener is text",
      "end \\) here",
      [{ type: "text", value: "end \\) here" }],
    ],
    [
      "trailing lone backslash is text",
      "end \\",
      [{ type: "text", value: "end \\" }],
    ],
    [
      "\\(a\\)\\(b\\) yields two math segments, no empty text node",
      "\\(a\\)\\(b\\)",
      [
        { type: "inline", value: "a" },
        { type: "inline", value: "b" },
      ],
    ],
    [
      "\\(a\\] is unterminated, not a block",
      "\\(a\\]",
      [{ type: "text", value: "\\(a\\]" }],
    ],
    [
      "x \\\\ ) inside aligned does not false-close",
      "\\[a \\\\ ) = b\\]",
      [{ type: "block", value: "a \\\\ ) = b" }],
    ],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(segmentMath(input)).toEqual(expected);
  });
});

describe("renderSegments cache", () => {
  beforeEach(() => __clearRichTextCache());

  it("carries pre-rendered html on math nodes, plain value on text nodes", () => {
    const segs = renderSegments("v \\(x\\) w");
    expect(segs[0]).toEqual({ type: "text", value: "v " });
    expect(segs[1].type).toBe("inline");
    expect("html" in segs[1] && segs[1].html).toContain("katex");
    expect(segs[2]).toEqual({ type: "text", value: " w" });
  });

  it("same expression inline vs display yields different output (displayMode in key)", () => {
    const inline = renderSegments("\\(x\\)")[0];
    const block = renderSegments("\\[x\\]")[0];
    const inlineHtml = "html" in inline ? inline.html : "";
    const blockHtml = "html" in block ? block.html : "";
    expect(inlineHtml).not.toBe(blockHtml);
    expect(blockHtml).toContain("display"); // katex display wrapper
  });

  it("a repeat call returns the identical cached result", () => {
    const a = renderSegments("\\(y^2\\)");
    const b = renderSegments("\\(y^2\\)");
    expect(a).toBe(b); // same reference from cache
  });

  it("renderToHtml escapes author text and injects only KaTeX output", () => {
    const html = renderToHtml("a < b & c \\(x^2\\)");
    expect(html).toContain("a &lt; b &amp; c "); // author text escaped
    expect(html).toContain("katex"); // math injected verbatim
    expect(html).not.toContain("a < b"); // raw angle bracket never survives
  });

  it("exceeding the cap evicts the oldest and still renders it correctly", () => {
    __clearRichTextCache();
    const first = "\\(v0\\)";
    renderSegments(first);
    for (let k = 1; k <= __CACHE_CAP; k++) renderSegments(`\\(v${k}\\)`);
    // Cap held.
    expect(__richTextCacheSize()).toBe(__CACHE_CAP);
    // `first` was oldest → evicted → a fresh (non-cached) render.
    const again = renderSegments(first);
    expect(again[0].type).toBe("inline");
    expect("html" in again[0] && again[0].html).toContain("katex");
  });
});
