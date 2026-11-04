import { describe, expect, it } from "vitest";
import { planImageCopies, urlMapOf } from "./duplicateImages";
import { LESSON_IMAGE_BUCKET } from "./lessonImages";

const SRC = "11111111-1111-4111-8111-111111111111";
const DST = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const base = `https://p.supabase.co/storage/v1/object/public/${LESSON_IMAGE_BUCKET}`;

const doc = (...urls: string[]) => urls.map((url, i) => ({ id: `b${i}`, kind: "theory", type: "image", url }));

describe("planImageCopies", () => {
  it("plans one copy per distinct URL, keeping the extension, under the new course", () => {
    let n = 0;
    const plan = planImageCopies(SRC, DST, [doc(`${base}/${SRC}/a.webp`, `${base}/${SRC}/a.webp`, `${base}/${SRC}/b.png`)], null, () => `n${++n}`);
    expect(plan.map((p) => [p.from, p.to])).toEqual([
      [`${SRC}/a.webp`, `${DST}/n1.webp`],
      [`${SRC}/b.png`, `${DST}/n2.png`],
    ]);
    expect(plan[0].newUrl).toBe(`${base}/${DST}/n1.webp`);
  });

  it("includes the cover", () => {
    const plan = planImageCopies(SRC, DST, [], `${base}/${SRC}/c.jpg`, () => "x");
    expect(urlMapOf(plan)).toEqual({ [`${base}/${SRC}/c.jpg`]: `${base}/${DST}/x.jpg` });
  });

  it("leaves out external URLs and objects under another course's prefix", () => {
    const plan = planImageCopies(
      SRC,
      DST,
      [doc("https://example.com/p.png", `${base}/${OTHER}/stolen.png`, `${base}/${SRC}/nested/deep.png`, `${base}/${SRC}/ok.png`)],
      null,
      () => "z",
    );
    expect(plan.map((p) => p.from)).toEqual([`${SRC}/ok.png`]);
  });

  it("finds matching-item images too", () => {
    const matching = [
      { kind: "practice", type: "matching", payload: { left: [{ content: { kind: "image", src: `${base}/${SRC}/m.webp` } }], right: [] } },
    ];
    expect(planImageCopies(SRC, DST, [matching], null, () => "q").map((p) => p.to)).toEqual([`${DST}/q.webp`]);
  });

  it("copies an audio clip too, keeping its extension (0217)", () => {
    const audio = [{ id: "a1", kind: "theory", type: "audio", url: `${base}/${SRC}/clip.mp3` }];
    expect(planImageCopies(SRC, DST, [audio], null, () => "s").map((p) => [p.from, p.to])).toEqual([
      [`${SRC}/clip.mp3`, `${DST}/s.mp3`],
    ]);
  });

  it("refuses a non-uuid course id", () => {
    expect(() => planImageCopies("", DST, [], null, () => "x")).toThrow();
    expect(() => planImageCopies(SRC, "../x", [], null, () => "x")).toThrow();
  });

  it("an empty plan gives an empty map", () => {
    expect(urlMapOf(planImageCopies(SRC, DST, [], null, () => "x"))).toEqual({});
  });
});
