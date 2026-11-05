import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { TableBlockView } from "./TableBlock";

/** docs/decisions/0220: a `collapsed` table starts closed behind "Show the
 * text"; a table without the flag renders open, with no `<details>`. */

const base = {
  id: "t1",
  kind: "theory" as const,
  type: "table" as const,
  header: [[{ text: "Who" }], [{ text: "Line" }]],
  rows: [[[{ text: "Amy" }], [{ text: "Sheldon, can I borrow your car?" }]]],
};

afterEach(cleanup);

describe("TableBlockView", () => {
  it("renders a collapsed table closed, behind the show label", () => {
    const { container } = render(<TableBlockView block={{ ...base, collapsed: true }} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toContain(alliengllCopy.theory.tableShow);
    // The table is inside the closed <details>, not beside it.
    expect(details?.querySelector("table")).not.toBeNull();
  });

  it("renders a table without the flag open, with no disclosure", () => {
    const { container } = render(<TableBlockView block={base} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Sheldon, can I borrow your car?")).toBeTruthy();
    expect(screen.queryByText(alliengllCopy.theory.tableShow)).toBeNull();
  });
});
