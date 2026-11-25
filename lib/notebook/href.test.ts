import { describe, expect, it } from "vitest";
import { notebookHref } from "./href";
import { NOTEBOOK_TABS, parseTab } from "./tabs";

describe("notebookHref", () => {
  it("leaves the defaults out", () => {
    expect(notebookHref("phrases", null)).toBe("/my/notebook");
  });

  it("carries both filters", () => {
    expect(notebookHref("to-try", "c1")).toBe("/my/notebook?tab=to-try&course=c1");
    expect(notebookHref("phrases", "c1")).toBe("/my/notebook?course=c1");
  });

  it("round-trips every tab through parseTab", () => {
    for (const tab of NOTEBOOK_TABS) {
      expect(parseTab(new URL(notebookHref(tab, null), "http://x").searchParams.get("tab"))).toBe(tab);
    }
  });
});
