import { describe, expect, it } from "vitest";
import { lessonAnswer, lessonFile, selectionBlock } from "./__fixtures__/lesson";
import { readStoredLessons, validateLessonResponse } from "./lessonResponse";

const SLUG = "why-two-tenses";

describe("validateLessonResponse", () => {
  it("accepts a lesson in the envelope and returns its qa notes", () => {
    const r = validateLessonResponse(lessonAnswer(SLUG, { qa: ["q1: no source explanation"] }), { slug: SLUG });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lesson.slug).toBe(SLUG);
      expect(r.lesson.document).toHaveLength(3);
      expect(r.qa).toEqual(["q1: no source explanation"]);
      expect(r.warnings).toEqual([]);
    }
  });

  it("accepts a fenced answer", () => {
    expect(validateLessonResponse("```json\n" + lessonAnswer(SLUG) + "\n```", { slug: SLUG }).ok).toBe(true);
  });

  it("accepts a bare lesson object with no envelope", () => {
    const r = validateLessonResponse(JSON.stringify(lessonFile(SLUG)), { slug: SLUG });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qa).toEqual([]);
  });

  it("refuses a slug other than the plan's, naming both", () => {
    const r = validateLessonResponse(lessonAnswer("something-else"), { slug: SLUG });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain(`must be "${SLUG}"`);
  });

  it("refuses an answer that is not JSON", () => {
    const r = validateLessonResponse("Sorry, I cannot do that.", { slug: SLUG });
    expect(r.ok).toBe(false);
  });

  it("refuses a lesson with a key the schema does not know (strict), such as qaNotes", () => {
    const r = validateLessonResponse(lessonAnswer(SLUG, { lesson: { qaNotes: ["x"] } }), { slug: SLUG });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/qaNotes/);
  });

  it("refuses a block the editor's parser rejects, naming the block", () => {
    const broken = selectionBlock("q-bad");
    (broken.payload as { options: unknown[] }).options = [{ id: "a", text: "Only one" }];
    const r = validateLessonResponse(lessonAnswer(SLUG, { lesson: { document: [broken] } }), { slug: SLUG });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("q-bad");
  });

  it("refuses an empty document", () => {
    const r = validateLessonResponse(lessonAnswer(SLUG, { lesson: { document: [] } }), { slug: SLUG });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("document has no blocks");
  });

  it("collects every error, capped at 25 plus a count", () => {
    const blocks = Array.from({ length: 40 }, (_, i) => ({ id: `bad-${i}`, kind: "theory", type: "heading", text: [] }));
    const r = validateLessonResponse(lessonAnswer(SLUG, { lesson: { document: blocks } }), { slug: SLUG });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBe(26);
      expect(r.errors[25]).toMatch(/and \d+ more/);
    }
  });

  it("warns, without failing, about a matching item that reuses a right side but sets no presentation", () => {
    const matching = {
      id: "m1",
      kind: "practice",
      type: "matching",
      payload: {
        prompt: "Sort the sentences",
        left: [
          { id: "l1", content: { kind: "text", text: "She has gone." } },
          { id: "l2", content: { kind: "text", text: "He went." } },
          { id: "l3", content: { kind: "text", text: "They have left." } },
        ],
        right: [
          { id: "r1", content: { kind: "text", text: "Present perfect" } },
          { id: "r2", content: { kind: "text", text: "Past simple" } },
        ],
        pairs: [
          { id: "p1", left: "l1", right: "r1", explanationRef: "e" },
          { id: "p2", left: "l2", right: "r2", explanationRef: "e" },
          { id: "p3", left: "l3", right: "r1", explanationRef: "e" },
        ],
        explanations: { e: "See the table." },
      },
    };
    const r = validateLessonResponse(lessonAnswer(SLUG, { lesson: { document: [matching] } }), { slug: SLUG });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join("\n")).toContain("m1");
  });
});

describe("readStoredLessons", () => {
  it("reads back what the pipeline stored", () => {
    const stored = [{ lesson: lessonFile(SLUG), qa: ["n"], repaired: true }];
    const read = readStoredLessons(JSON.parse(JSON.stringify(stored)));
    expect(read).toHaveLength(1);
    expect(read?.[0]).toMatchObject({ qa: ["n"], repaired: true });
    expect(read?.[0].lesson.slug).toBe(SLUG);
  });

  it("is null when anything is off, so a bad row can never commit", () => {
    expect(readStoredLessons(null)).toBeNull();
    expect(readStoredLessons([null])).toBeNull();
    expect(readStoredLessons([{ lesson: { slug: "x" } }])).toBeNull();
    // Positive control: the same shape with a valid lesson reads.
    expect(readStoredLessons([{ lesson: lessonFile("x") }])).toHaveLength(1);
  });
});
