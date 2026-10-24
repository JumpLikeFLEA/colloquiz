import { describe, expect, it } from "vitest";
import { PLAN, planAnswer } from "./__fixtures__/lesson";
import { extractJson, MAX_IMPORT_LESSONS, parsePlanResponse, readStoredPlan } from "./plan";

describe("extractJson", () => {
  it("reads bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reads a ```json fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reads JSON with prose around it", () => {
    expect(extractJson('Here is the plan:\n{"a":{"b":2}}\nHope that helps.')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });

  it("prefers the fenced object when the prose holds braces too", () => {
    expect(extractJson('Use {curly} braces.\n```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("says what is wrong with broken JSON and with no JSON", () => {
    const broken = extractJson('{"a":1,}');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/invalid JSON/);
    const none = extractJson("no object here");
    expect(none).toEqual({ ok: false, error: "no JSON object found in the answer" });
  });
});

describe("parsePlanResponse", () => {
  it("accepts the fixture plan and keeps its shape", () => {
    const parsed = parsePlanResponse(planAnswer());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan.lessons.map((l) => l.slug)).toEqual(["why-two-tenses", "signal-words"]);
      expect(parsed.plan.markMapping).toContain("mark_a");
    }
  });

  it("defaults markMapping to null and notes to []", () => {
    const parsed = parsePlanResponse(JSON.stringify({ lessons: [{ slug: "one", title: "One" }] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan.markMapping).toBeNull();
      expect(parsed.plan.notes).toEqual([]);
      expect(parsed.plan.lessons[0].covers).toBe("");
    }
  });

  const bad = (mutate: (p: Record<string, unknown>) => void) => {
    const p = JSON.parse(planAnswer()) as Record<string, unknown>;
    mutate(p);
    return parsePlanResponse(JSON.stringify(p));
  };

  it("rejects a duplicate slug, naming it", () => {
    const r = bad((p) => ((p.lessons as { slug: string }[])[1].slug = "why-two-tenses"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/duplicate lesson slug "why-two-tenses"/);
  });

  it("rejects a slug that is not kebab-case", () => {
    expect(bad((p) => ((p.lessons as { slug: string }[])[0].slug = "Section A")).ok).toBe(false);
  });

  it("rejects no lessons and more than the cap", () => {
    expect(bad((p) => (p.lessons = [])).ok).toBe(false);
    const many = Array.from({ length: MAX_IMPORT_LESSONS + 1 }, (_, i) => ({ slug: `l-${i}`, title: `L ${i}` }));
    expect(bad((p) => (p.lessons = many)).ok).toBe(false);
    const atCap = Array.from({ length: MAX_IMPORT_LESSONS }, (_, i) => ({ slug: `l-${i}`, title: `L ${i}` }));
    expect(bad((p) => (p.lessons = atCap)).ok).toBe(true);
  });

  it("rejects a subtitle over the catalogue's 200 characters, and accepts exactly 200", () => {
    expect(bad((p) => (p.subtitle = "x".repeat(201))).ok).toBe(false);
    expect(bad((p) => (p.subtitle = "x".repeat(200))).ok).toBe(true);
  });

  it("rejects a title with a newline (authored strings are single-line)", () => {
    expect(bad((p) => ((p.lessons as { title: string }[])[0].title = "two\nlines")).ok).toBe(false);
  });

  it("rejects an answer that is not JSON, with one error", () => {
    const r = parsePlanResponse("I could not read the file.");
    expect(r).toEqual({ ok: false, errors: ["no JSON object found in the answer"] });
  });
});

describe("readStoredPlan", () => {
  it("round-trips a plan through JSON", () => {
    expect(readStoredPlan(JSON.parse(JSON.stringify(PLAN)))).toEqual(PLAN);
  });

  it("is null for null and for garbage", () => {
    expect(readStoredPlan(null)).toBeNull();
    expect(readStoredPlan({ lessons: "no" })).toBeNull();
  });
});
