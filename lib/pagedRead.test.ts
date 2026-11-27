import { describe, expect, it } from "vitest";
import { readAllPages, type PageResult } from "./pagedRead";

/** A fake table of `n` rows served in ranges, recording every range asked for. */
function table(n: number, failOnCall?: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number): Promise<PageResult<{ id: number }>> => {
    calls.push([from, to]);
    if (failOnCall === calls.length) return { data: null, error: { message: "page failed" } };
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { fetchPage, calls };
}

const ids = (r: { data: { id: number }[] | null }) => (r.data ?? []).map((x) => x.id);

describe("readAllPages", () => {
  it("0 rows: one request, an empty list", async () => {
    const t = table(0);
    const r = await readAllPages(t.fetchPage, 10);
    expect(r).toEqual({ data: [], error: null });
    expect(t.calls).toEqual([[0, 9]]);
  });

  it("one short page: one request, every row", async () => {
    const t = table(7);
    const r = await readAllPages(t.fetchPage, 10);
    expect(ids(r)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(t.calls).toEqual([[0, 9]]);
  });

  it("exactly the limit: a second, empty page ends it", async () => {
    const t = table(10);
    const r = await readAllPages(t.fetchPage, 10);
    expect(ids(r)).toEqual([...Array(10).keys()]);
    expect(t.calls).toEqual([[0, 9], [10, 19]]);
  });

  it("limit + 1: two pages, no row lost or repeated", async () => {
    const t = table(11);
    const r = await readAllPages(t.fetchPage, 10);
    expect(ids(r)).toEqual([...Array(11).keys()]);
    expect(new Set(ids(r)).size).toBe(11);
    expect(t.calls).toEqual([[0, 9], [10, 19]]);
  });

  it("a failing second page fails the whole read with no rows", async () => {
    const t = table(25, 2);
    const r = await readAllPages(t.fetchPage, 10);
    expect(r).toEqual({ data: null, error: { message: "page failed" } });
    expect(t.calls).toEqual([[0, 9], [10, 19]]);
  });

  it("a null page with no error counts as empty", async () => {
    const r = await readAllPages(async () => ({ data: null, error: null }), 10);
    expect(r).toEqual({ data: [], error: null });
  });

  it("uses 1,000 by default, the max_rows of both stacks (0250)", async () => {
    const t = table(1001);
    const r = await readAllPages(t.fetchPage);
    expect(r.data).toHaveLength(1001);
    expect(t.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("refuses a page size below 1", async () => {
    await expect(readAllPages(table(1).fetchPage, 0)).rejects.toThrow(/bad page size/);
  });
});
