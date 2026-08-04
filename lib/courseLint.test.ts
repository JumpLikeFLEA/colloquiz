import { describe, it, expect } from "vitest";
import { lintLatexBackslashes } from "./courseLint";

// NOTE ON ESCAPING IN THIS FILE: the lint runs over RAW FILE BYTES. A TS literal
// `"\\frac"` is the 5-char string `\frac` (one backslash) — i.e. a file authored
// with a SINGLE backslash, which is the bug the lint catches. A correctly-doubled
// `\\frac` in a file is the TS literal `"\\\\frac"` (two backslashes).

describe("lintLatexBackslashes — flags single-backslash LaTeX", () => {
  // [name, raw input, expected offending token]
  const flagged: [string, string, string][] = [
    ["\\frac (loud: illegal-looking? no — silent \\f)", "\\frac{a}{b}", "\\frac"],
    ["\\int (loud illegal escape)", "\\int_0^1", "\\int"],
    ["\\sqrt", "\\sqrt{2}", "\\sqrt"],
    ["\\( inline open", "value \\(x", "\\("],
    ["\\[ display open", "\\[ x^2", "\\["],
    ["\\ne (silent \\n + letter)", "a \\ne b", "\\ne"],
    ["\\to (silent \\t + letter)", "x \\to 0", "\\to"],
    ["\\theta (silent \\t + letter)", "\\theta", "\\theta"],
    ["\\begin (silent \\b + letter)", "\\begin{aligned}", "\\begin"],
    ["\\right (silent \\r + letter)", "\\right)", "\\right"],
    ["\\forall (silent \\f + letter)", "\\forall x", "\\forall"],
  ];

  it.each(flagged)("%s → one issue on token %s", (_name, raw, token) => {
    const issues = lintLatexBackslashes(raw);
    expect(issues).toHaveLength(1);
    expect(issues[0].token).toBe(token);
  });
});

describe("lintLatexBackslashes — accepts legal escapes", () => {
  // Each of these is a CLEAN file string: no un-doubled LaTeX backslash.
  const clean: [string, string][] = [
    ["correctly-doubled \\\\frac", "\\\\frac{a}{b}"],
    ["correctly-doubled \\\\(", "value \\\\(x\\\\)"],
    ["correctly-doubled \\\\[", "\\\\[\\\\int_0^1 x^2\\\\,dx\\\\]"],
    ["escaped quote \\\"", 'say \\"hi\\"'],
    ["escaped solidus \\/", "path\\/to"],
    ["unicode escape \\uXXXX", "caf\\u00e9"],
    ["\\n before space (real newline escape, not \\ne)", "line one\\n more"],
    ["\\t before digit", "col\\t3"],
    ["\\n at end of string", "trailing\\n"],
    ["plain unicode math, no backslash", "α → β, x² ≤ y³"],
    ["a $500 literal", "already paid $500"],
  ];

  it.each(clean)("%s → no issues", (_name, raw) => {
    expect(lintLatexBackslashes(raw)).toHaveLength(0);
  });
});

describe("lintLatexBackslashes — reporting", () => {
  it("reports 1-based line and column", () => {
    const raw = "line one\n  \\frac{a}{b}";
    const [issue] = lintLatexBackslashes(raw);
    expect(issue.line).toBe(2);
    expect(issue.col).toBe(3); // two spaces then the backslash
    expect(issue.message).toContain("\\\\frac"); // suggests the doubled form
    expect(issue.message).toContain('not "\\frac"');
  });

  it("flags multiple occurrences across lines", () => {
    const raw = "\\int_0^1\n\\frac{1}{2}";
    const issues = lintLatexBackslashes(raw);
    expect(issues).toHaveLength(2);
    expect(issues[0].line).toBe(1);
    expect(issues[1].line).toBe(2);
  });

  it("does not double-flag \\\\\\frac (escaped pair then a single-backslash command)", () => {
    // `\\` (correct pair) followed by `\frac` (single) — exactly one issue.
    const issues = lintLatexBackslashes("\\\\\\frac");
    expect(issues).toHaveLength(1);
    expect(issues[0].token).toBe("\\frac");
  });
});
