import { describe, expect, it } from "vitest";
import { selectionPhrase } from "./selectionPhrase";

const ok = (phrase: string) => ({ ok: true, phrase });

describe("selectionPhrase", () => {
  it("extends a word cut at the start", () => {
    expect(selectionPhrase({ text: "cond thought", before: "on se", after: " for" })).toEqual(ok("second thought"));
  });

  it("extends a word cut at the end", () => {
    expect(selectionPhrase({ text: "on second tho", before: "Keep ", after: "ught for later." })).toEqual(ok("on second thought"));
  });

  it("does not pull in a neighbouring word when the selection begins or ends with a space", () => {
    expect(selectionPhrase({ text: " second thought ", before: "on", after: "for" })).toEqual(ok("second thought"));
  });

  it("keeps don't and well-known whole", () => {
    expect(selectionPhrase({ text: "on't worry", before: "I d", after: "" })).toEqual(ok("don't worry"));
    expect(selectionPhrase({ text: "I do", before: "", after: "n’t know" })).toEqual(ok("I don’t"));
    expect(selectionPhrase({ text: "known fact", before: "a well-", after: "" })).toEqual(ok("well-known fact"));
    expect(selectionPhrase({ text: "a well", before: "", after: "-known fact" })).toEqual(ok("a well-known"));
  });

  it("leaves an opening quote just before the selection out", () => {
    expect(selectionPhrase({ text: "Take it", before: "“", after: " easy”" })).toEqual(ok("Take it"));
  });

  it("trims a phrase in typographic quotes", () => {
    expect(selectionPhrase({ text: "“Take it easy.”" })).toEqual(ok("Take it easy"));
    expect(selectionPhrase({ text: "«Не торопись»" })).toEqual(ok("Не торопись"));
  });

  it("trims a leading dash and a trailing full stop", () => {
    expect(selectionPhrase({ text: "— See you later." })).toEqual(ok("See you later"));
    expect(selectionPhrase({ text: "• first, " })).toEqual(ok("first"));
    expect(selectionPhrase({ text: "(as a rule);" })).toEqual(ok("as a rule"));
  });

  it("keeps ? ! … and an ellipsis typed as three dots", () => {
    expect(selectionPhrase({ text: "How are you?" })).toEqual(ok("How are you?"));
    expect(selectionPhrase({ text: "Watch out!" })).toEqual(ok("Watch out!"));
    expect(selectionPhrase({ text: "Well…" })).toEqual(ok("Well…"));
    expect(selectionPhrase({ text: "Well..." })).toEqual(ok("Well..."));
  });

  it("collapses whitespace and line breaks", () => {
    expect(selectionPhrase({ text: "on second\nthought,\n\n  for   later" })).toEqual(ok("on second thought, for later"));
  });

  it("allows 200 characters and refuses 201", () => {
    const a = "a".repeat(200);
    expect(selectionPhrase({ text: a })).toEqual(ok(a));
    expect(selectionPhrase({ text: a + "b" })).toEqual({ ok: false, reason: "too_long", length: 201 });
  });

  it("counts after the trim and the extension", () => {
    // 199 selected + 2 borrowed = 201.
    expect(selectionPhrase({ text: "b".repeat(199), before: "aa", after: "" })).toEqual({ ok: false, reason: "too_long", length: 201 });
    // The full stop and spaces trimmed leave exactly 200.
    expect(selectionPhrase({ text: ` ${"c".repeat(200)}. ` })).toEqual(ok("c".repeat(200)));
  });

  it("is empty with no letter", () => {
    expect(selectionPhrase({ text: "" })).toEqual({ ok: false, reason: "empty" });
    expect(selectionPhrase({ text: "   \n " })).toEqual({ ok: false, reason: "empty" });
    expect(selectionPhrase({ text: " — … !" })).toEqual({ ok: false, reason: "empty" });
    expect(selectionPhrase({ text: "2026", before: "", after: "" })).toEqual({ ok: false, reason: "empty" });
  });

  it("saves a Russian phrase and extends a cut Russian word", () => {
    expect(selectionPhrase({ text: "ругими словами", before: "Д", after: "," })).toEqual(ok("Другими словами"));
  });

  it("saves a mixed phrase", () => {
    expect(selectionPhrase({ text: "«by the way» — кстати." })).toEqual(ok("by the way» — кстати"));
    expect(selectionPhrase({ text: "by the way — кстати" })).toEqual(ok("by the way — кстати"));
  });
});
