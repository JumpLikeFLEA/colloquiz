import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The notebook's own action must never run when another one is passed.
const saveNote = vi.fn(async (prev: { error: null; done: number }) => prev);
vi.mock("./actions", () => ({ saveNote: (...a: unknown[]) => saveNote(...(a as [never])) }));

const { NoteForm } = await import("./NoteForm");
const { noteFormCopy } = await import("./noteFormCopy");

afterEach(() => {
  cleanup();
  saveNote.mockClear();
});

const { confirm: _c, ...en } = noteFormCopy.en;

type State = { error: import("@/lib/notebook/noteForm").NoteError | null; done: number };

describe("NoteForm with another action (PROG-022, docs/decisions/0248)", () => {
  it("sends the hidden lesson id to the given action, and calls onDone on success", async () => {
    const seen: Record<string, string>[] = [];
    const action = vi.fn(async (prev: State, form: FormData): Promise<State> => {
      seen.push(Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
      return { error: null, done: prev.done + 1 };
    });
    const onDone = vi.fn();
    render(<NoteForm strings={en} action={action} hidden={{ lessonId: "L1" }} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(en.phraseLabel), { target: { value: "be about to" } });
    fireEvent.click(screen.getByRole("button", { name: en.save }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(seen).toEqual([{ lessonId: "L1", phrase: "be about to", note: "" }]);
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("draws the refusal's extra node and keeps what was typed", async () => {
    const action = vi.fn(async (prev: State): Promise<State> => ({ error: "unauthenticated", done: prev.done }));
    const onDone = vi.fn();
    render(
      <NoteForm
        strings={en}
        action={action}
        onDone={onDone}
        errorExtra={{ unauthenticated: <a href="/login?next=/x">Sign in</a> }}
      />,
    );
    fireEvent.change(screen.getByLabelText(en.phraseLabel), { target: { value: "on second thought" } });
    fireEvent.change(screen.getByLabelText(en.noteLabel), { target: { value: "a note" } });
    fireEvent.click(screen.getByRole("button", { name: en.save }));
    await screen.findByText(en.errors.unauthenticated);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?next=/x");
    expect((screen.getByLabelText(en.phraseLabel) as HTMLInputElement).value).toBe("on second thought");
    expect((screen.getByLabelText(en.noteLabel) as HTMLTextAreaElement).value).toBe("a note");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("names not_readable", async () => {
    const action = vi.fn(async (prev: State): Promise<State> => ({ error: "not_readable", done: prev.done }));
    render(<NoteForm strings={en} action={action} />);
    fireEvent.change(screen.getByLabelText(en.phraseLabel), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: en.save }));
    expect(await screen.findByText(en.errors.not_readable)).toBeTruthy();
  });
});
