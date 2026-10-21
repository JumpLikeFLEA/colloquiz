import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLessonDocument, type VoiceTaskBlock } from "@/lib/lessons";
import { mapParseErrorsToFieldErrors } from "@/lib/lessonEditorErrors";
import { BeforeListenForProvider, VoiceTaskForm } from "./VoiceTaskForm";

// AUTH-020: the voice task's "Expressions to listen for" field, one per line
// (docs/decisions/0156 Decision 8). The form is rendered inside a tiny state
// holder so the block it edits is the one it just reported, as in BlockList.

const base: VoiceTaskBlock = {
  id: "v1",
  kind: "task",
  type: "voice",
  prompt: [{ text: "Tell us about your week." }],
  maxSeconds: 180,
};

let latest: VoiceTaskBlock = base;

function Harness({ initial, before }: { initial: VoiceTaskBlock; before?: string[] }) {
  const [block, setBlock] = useState(initial);
  return (
    <BeforeListenForProvider value={before}>
      <VoiceTaskForm
        block={block}
        onChange={(next) => {
          latest = next;
          setBlock(next);
        }}
      />
    </BeforeListenForProvider>
  );
}

beforeEach(() => {
  latest = base;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => cleanup());

const listenField = () => screen.getByLabelText(/Expressions to listen for/) as HTMLTextAreaElement;

function choose(slot: string) {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${slot}`) }));
}

describe("VoiceTaskForm — expressions to listen for", () => {
  it("stores one trimmed expression per line and drops blank lines", () => {
    render(<Harness initial={base} />);
    fireEvent.change(listenField(), { target: { value: "  I used to  \n\nby the time\n" } });
    expect(latest.listenFor).toEqual(["I used to", "by the time"]);
  });

  it("keeps the newline the author just typed, so the next line can be started", () => {
    render(<Harness initial={base} />);
    fireEvent.change(listenField(), { target: { value: "I used to\n" } });
    expect(listenField().value).toBe("I used to\n");
  });

  it("stores no field at all when every line is cleared", () => {
    render(<Harness initial={{ ...base, listenFor: ["I used to"] }} />);
    expect(listenField().value).toBe("I used to");
    fireEvent.change(listenField(), { target: { value: "" } });
    expect(latest.listenFor).toBeUndefined();
    expect(latest).not.toHaveProperty("listenFor", []);
  });

  it("counts lines against the limit of 12", () => {
    render(<Harness initial={base} />);
    expect(screen.getByText("0 / 12")).toBeTruthy();
    fireEvent.change(listenField(), { target: { value: Array.from({ length: 13 }, (_, i) => `e${i}`).join("\n") } });
    expect(screen.getByText("13 / 12").className).toContain("text-destructive-text");
  });

  it("copies the Before task's list into a task switched to After, once", () => {
    render(<Harness initial={base} before={["I used to", "by the time"]} />);
    choose("After");
    expect(latest.compare).toBe("after");
    expect(latest.listenFor).toEqual(["I used to", "by the time"]);
    expect(listenField().value).toBe("I used to\nby the time");
  });

  it("does not overwrite a list the author already wrote", () => {
    render(<Harness initial={{ ...base, listenFor: ["my own"] }} before={["I used to"]} />);
    choose("After");
    expect(latest.compare).toBe("after");
    expect(latest.listenFor).toEqual(["my own"]);
  });

  it("copies nothing for Before, for no slot, or when no Before list exists", () => {
    render(<Harness initial={base} before={["I used to"]} />);
    choose("Before");
    expect(latest.listenFor).toBeUndefined();
    cleanup();
    render(<Harness initial={base} />);
    choose("After");
    expect(latest.compare).toBe("after");
    expect(latest.listenFor).toBeUndefined();
  });

  it("shows the schema's messages for the field and for a single line", () => {
    const parsed = parseLessonDocument([{ ...base, listenFor: ["x".repeat(61), "dup", "dup"] }]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const errors = mapParseErrorsToFieldErrors(parsed.errors).get("v1");
    expect(errors).toBeTruthy();
    render(<VoiceTaskForm block={{ ...base, listenFor: ["x".repeat(61), "dup", "dup"] }} onChange={() => {}} errors={errors} />);
    expect(screen.getByText("Each expression can be listed once.")).toBeTruthy();
    // The over-length line's message sits under the field too.
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(1);
  });
});
