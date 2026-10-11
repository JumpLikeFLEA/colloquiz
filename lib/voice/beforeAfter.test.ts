import { describe, expect, it, vi } from "vitest";
import { beforeAfterView, locateSlots, type EnrolmentTake, type ReadableLesson } from "./beforeAfter";

function voice(id: string, compare?: "before" | "after", text = `Say it (${id})`) {
  return { id, kind: "task", type: "voice", prompt: [{ text }], maxSeconds: 180, ...(compare ? { compare } : {}) };
}
const prose = { id: "p1", kind: "theory", type: "prose", content: [{ text: "Hello" }] };

function lesson(lessonId: string, ordinal: number, document: unknown[]): ReadableLesson {
  return { lessonId, slug: `${lessonId}-slug`, title: `${lessonId} title`, ordinal, archived: false, document };
}

const L1 = lesson("L1", 1, [prose, voice("vb", "before"), voice("w1")]);
const L4 = lesson("L4", 4, [voice("va", "after")]);
const comment = { paragraphs: [{ runs: [{ text: "Real " }, { text: "progress", bold: true }] }] };

function take(id: string, lessonId: string, blockId: string, objectName: string | null = `c/u/${id}.webm`): EnrolmentTake {
  return { id, lessonId, blockId, objectName, submittedAt: "2026-10-01T10:00:00Z" };
}

describe("locateSlots", () => {
  it("finds each slot in the readable documents, ignoring weekly tasks", () => {
    const slots = locateSlots([L4, L1]);
    expect(slots.before).toMatchObject({ lessonId: "L1", blockId: "vb", slug: "L1-slug", prompt: [{ text: "Say it (vb)" }] });
    expect(slots.after).toMatchObject({ lessonId: "L4", blockId: "va" });
  });

  it("leaves a slot null when no readable lesson holds it (a later week not open yet)", () => {
    expect(locateSlots([L1]).after).toBeNull();
  });

  it("takes the earliest lesson by ordinal when two claim a slot (publish check bypassed, 0100 D3)", () => {
    const dup = lesson("L2", 2, [voice("vb2", "before")]);
    expect(locateSlots([dup, L1]).before).toMatchObject({ lessonId: "L1", blockId: "vb" });
  });

  it("locates a slot in an archived lesson without linking it", () => {
    const archived = { ...L1, archived: true };
    expect(locateSlots([archived]).before).toMatchObject({ lessonId: "L1", linkable: false });
    expect(locateSlots([L1]).before).toMatchObject({ linkable: true });
  });

  it("skips a block that doesn't parse as a voice task", () => {
    const broken = lesson("L0", 0, [{ id: "x", kind: "task", type: "voice", compare: "before" }]);
    expect(locateSlots([broken, L1]).before).toMatchObject({ lessonId: "L1" });
  });
});

describe("beforeAfterView", () => {
  it("shows both takes and the published comment", () => {
    const v = beforeAfterView([L1, L4], [take("t1", "L1", "vb"), take("t2", "L4", "va")], comment);
    expect(v.before).toMatchObject({ kind: "recorded", takeId: "t1", objectName: "c/u/t1.webm" });
    expect(v.after).toMatchObject({ kind: "recorded", takeId: "t2" });
    expect(v.comment).toEqual({ kind: "published", body: comment });
  });

  it("before missing: the slot's lesson is readable and nothing was sent", () => {
    const v = beforeAfterView([L1, L4], [take("t2", "L4", "va")], null);
    expect(v.before).toMatchObject({ kind: "missing", location: { slug: "L1-slug" } });
  });

  it("after missing vs after not open yet", () => {
    expect(beforeAfterView([L1, L4], [take("t1", "L1", "vb")], null).after.kind).toBe("missing");
    expect(beforeAfterView([L1], [take("t1", "L1", "vb")], null).after.kind).toBe("unknown");
  });

  it("a purged take is removed, never missing", () => {
    const v = beforeAfterView([L1, L4], [take("t1", "L1", "vb", null)], null);
    expect(v.before).toEqual(expect.objectContaining({ kind: "removed", submittedAt: "2026-10-01T10:00:00Z" }));
    expect(v.before.kind).not.toBe("missing");
  });

  it("a weekly task's take is not mistaken for a slot", () => {
    const v = beforeAfterView([L1, L4], [take("t3", "L1", "w1")], null);
    expect(v.before.kind).toBe("missing");
  });

  it("comment not yet published is pending", () => {
    expect(beforeAfterView([L1, L4], [], null).comment).toEqual({ kind: "pending" });
  });

  it("a comment body that doesn't parse is reported and shown as pending", () => {
    const onInvalid = vi.fn();
    const v = beforeAfterView([L1, L4], [], { paragraphs: "nope" }, onInvalid);
    expect(v.comment).toEqual({ kind: "pending" });
    expect(onInvalid).toHaveBeenCalledOnce();
  });
});
