import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Server Action is the RPC's caller; this test is about the form, so it never runs.
const saveNote = vi.fn(async (prev: { error: null; done: number }) => prev);
vi.mock("./actions", () => ({ saveNote: (...a: unknown[]) => saveNote(...(a as [never])) }));

const { NoteForm } = await import("./NoteForm");
const { noteFormCopy } = await import("./noteFormCopy");

afterEach(() => {
  cleanup();
  saveNote.mockClear();
});

const { confirm: _c, ...en } = noteFormCopy.en;
const { confirm: _r, ...ru } = noteFormCopy.ru;

describe("NoteForm (PROG-016)", () => {
  it("refuses an empty phrase before sending, and names it", () => {
    render(<NoteForm strings={en} />);
    fireEvent.click(screen.getByRole("button", { name: en.save }));
    expect(screen.getByText(en.errors.phrase_empty)).toBeTruthy();
    expect(screen.getByLabelText(en.phraseLabel).getAttribute("aria-invalid")).toBe("true");
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("refuses a 501-character note, and shows the count over the limit", () => {
    render(<NoteForm strings={en} />);
    fireEvent.change(screen.getByLabelText(en.phraseLabel), { target: { value: "be about to" } });
    fireEvent.change(screen.getByLabelText(en.noteLabel), { target: { value: "b".repeat(501) } });
    expect(screen.getByText("501 / 500").className).toContain("text-destructive-text");
    fireEvent.click(screen.getByRole("button", { name: en.save }));
    expect(screen.getByText(en.errors.note_too_long)).toBeTruthy();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("counts a Cyrillic note per letter, in the Russian form", () => {
    render(<NoteForm strings={ru} />);
    fireEvent.change(screen.getByLabelText(ru.noteLabel), { target: { value: "  вот-вот  " } });
    expect(screen.getByText("7 / 500")).toBeTruthy();
    expect(screen.getByText("0 / 200")).toBeTruthy();
  });

  it("an edit form starts from the note and offers Cancel", () => {
    const onDone = vi.fn();
    render(<NoteForm strings={en} id="n1" initial={{ phrase: "on second thought", note: null }} onDone={onDone} />);
    expect((screen.getByLabelText(en.phraseLabel) as HTMLInputElement).value).toBe("on second thought");
    fireEvent.click(screen.getByRole("button", { name: en.cancel }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
