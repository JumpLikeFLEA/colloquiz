import { describe, expect, it } from "vitest";
import { MAX_TAKES, addTake, findTake, removeTake, takesFull } from "./takes";

const t = (id: string) => ({ id });
const fill = (n: number) => Array.from({ length: n }, (_, i) => t(`t${i}`));

describe("takes", () => {
  it("allows exactly five", () => {
    expect(MAX_TAKES).toBe(5);
    expect(takesFull(fill(4))).toBe(false);
    expect(takesFull(fill(5))).toBe(true);
  });

  it("adds in order up to the cap", () => {
    let list: readonly { id: string }[] = [];
    for (let i = 0; i < 5; i++) list = addTake(list, t(`t${i}`));
    expect(list.map((x) => x.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("refuses a sixth and keeps the list untouched", () => {
    const full = fill(5);
    expect(addTake(full, t("t5"))).toBe(full);
    expect(full).toHaveLength(5);
  });

  it("deleting frees a slot", () => {
    const list = removeTake(fill(5), "t2");
    expect(list.map((x) => x.id)).toEqual(["t0", "t1", "t3", "t4"]);
    expect(addTake(list, t("t5"))).toHaveLength(5);
  });

  it("removing an unknown id changes nothing", () => {
    const list = fill(3);
    expect(removeTake(list, "nope")).toBe(list);
  });

  it("finds the take to send by id, not by position", () => {
    const list = fill(3);
    expect(findTake(list, "t1")).toBe(list[1]);
    expect(findTake(list, "nope")).toBeNull();
  });
});
