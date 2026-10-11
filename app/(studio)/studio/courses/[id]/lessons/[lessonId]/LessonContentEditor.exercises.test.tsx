import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLessonDocument } from "@/lib/lessons";
import { EXERCISE_VARIANT_LABEL, type ExerciseVariant } from "@/lib/studio/exerciseTemplates";
import { LessonContentEditor } from "./LessonContentEditor";

// AUTH-016 acceptance: "An RTL test adds, fills and saves one variant of each
// type", and "An unfinished exercise blocks Save with its errors in place".
//
// The save route is stood in for by a fetch stub that does exactly what
// app/api/admin/courses/[id]/lessons/[lessonId]/content/route.ts does before
// it reaches the database: run parseLessonDocument, and return 422 with the
// errors when it fails. Each test adds one exercise from the "Add block" menu,
// saves it empty (expecting the 422 and the messages next to the fields),
// fills every empty field, saves again, and checks the saved document parses.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

type Saved = { document: unknown[] };
let saves: Saved[] = [];

beforeEach(() => {
  saves = [];
  // Radix Select/DropdownMenu call these; jsdom doesn't implement them.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/versions")) return Response.json({ versions: [] });
      const body = JSON.parse(String(init?.body)) as Saved;
      saves.push(body);
      const parsed = parseLessonDocument(body.document);
      if (!parsed.ok) return Response.json({ error: "Invalid lesson content", errors: parsed.errors }, { status: 422 });
      return Response.json({ ok: true, versionId: "00000000-0000-4000-8000-000000000001" });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderEditor() {
  render(
    <LessonContentEditor
      courseId="course-1"
      draft={{
        lessonId: "lesson-1",
        lessonTitle: "Lesson",
        courseId: "course-1",
        document: [],
        baseVersionId: null,
        publishedVersionId: null,
      }}
      initialVersions={[]}
    />,
  );
}

function addExercise(variant: ExerciseVariant) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Add block" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: EXERCISE_VARIANT_LABEL[variant] }));
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
}

/** Every empty text input and textarea gets distinct text, the way an author
 * fills a form top to bottom. Explanations included, so every part has one. */
function fillEmptyFields(slotsPrompt?: string) {
  const fields = screen
    .getAllByRole("textbox")
    .filter((el): el is HTMLInputElement | HTMLTextAreaElement => (el as HTMLInputElement).value === "");
  fields.forEach((field, i) => {
    const text = i === 0 && slotsPrompt ? slotsPrompt : `Text ${i + 1}`;
    fireEvent.change(field, { target: { value: text } });
  });
}

async function expectBlockedThenSaved(variant: ExerciseVariant, fill: () => void) {
  renderEditor();
  addExercise(variant);

  // The new row carries the friendly label, not the engine type.
  expect(screen.getAllByText(EXERCISE_VARIANT_LABEL[variant]).length).toBeGreaterThan(0);

  await save();
  expect(saves).toHaveLength(1);
  // Blocked: the empty prompt's message sits under the Prompt field.
  await waitFor(() =>
    expect(screen.getAllByText("Too small: expected string to have >=1 characters").length).toBeGreaterThan(0),
  );
  expect(screen.queryAllByText(/resolves? to no explanation/).length).toBeGreaterThan(0);

  fill();
  await save();
  expect(saves).toHaveLength(2);
  const result = parseLessonDocument(saves[1].document);
  expect(result.ok ? [] : result.errors).toEqual([]);
  expect(screen.queryByText("Too small: expected string to have >=1 characters")).toBeNull();
  return result.ok ? result.document : [];
}

describe("LessonContentEditor — adding exercises (AUTH-016)", () => {
  it("selection: Multiple choice", async () => {
    const doc = await expectBlockedThenSaved("multiple_choice", () => {
      fillEmptyFields();
      fireEvent.click(screen.getByRole("radio", { name: "Option 1 correct" }));
    });
    expect(doc[0]).toMatchObject({ kind: "practice", item: { type: "selection", payload: { multi: false } } });
  });

  it("selection_grid: True/False statements", async () => {
    const doc = await expectBlockedThenSaved("true_false_statements", () => fillEmptyFields());
    expect(doc[0]).toMatchObject({ kind: "practice", item: { type: "selection_grid" } });
  });

  it("ordering: Put in order", async () => {
    const doc = await expectBlockedThenSaved("put_in_order", () => fillEmptyFields());
    expect(doc[0]).toMatchObject({ kind: "practice", item: { type: "ordering" } });
  });

  it("matching: Match pairs, switched to Sort into groups with the Show as Select", async () => {
    const doc = await expectBlockedThenSaved("match_pairs", () => {
      fillEmptyFields();
      const showAs = screen.getByRole("combobox", { name: "Show as" });
      fireEvent.keyDown(showAs, { key: "Enter" });
      fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Sort into groups" }));
    });
    expect(doc[0]).toMatchObject({ kind: "practice", item: { type: "matching", payload: { presentation: "sort" } } });
    // The row's label follows the presentation.
    expect(screen.getAllByText("Sort into groups").length).toBeGreaterThan(0);
  });

  it("slots: Drag words into gaps", async () => {
    const doc = await expectBlockedThenSaved("drag_words_into_gaps", () => fillEmptyFields("I ___ tea."));
    expect(doc[0]).toMatchObject({
      kind: "practice",
      item: { type: "slots", payload: { input: "drag", prompt: "I ___ tea." } },
    });
  });
});
