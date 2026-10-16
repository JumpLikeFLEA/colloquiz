import { describe, expect, it, vi } from "vitest";
import { isStudioEditor } from "./studioEditor";

type Reads = {
  admin: { data: unknown; error: unknown } | Error;
  grants: { count: number | null; error: unknown } | Error;
  /** has_author_seat (082). Omitted = no seat. */
  seat?: { data: unknown; error: unknown } | Error;
};

function fakeClient(reads: Reads) {
  const settle = (r: unknown) => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r));
  const rpc = vi
    .fn()
    .mockImplementation((name: string) =>
      settle(name === "has_author_seat" ? (reads.seat ?? { data: false, error: null }) : reads.admin),
    );
  const eq = vi.fn().mockImplementation(() => settle(reads.grants));
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const client = { rpc, from } as unknown as Parameters<typeof isStudioEditor>[0];
  return { client, rpc, from, select, eq };
}

describe("isStudioEditor", () => {
  it("is true for an admin with no grant", async () => {
    const f = fakeClient({ admin: { data: true, error: null }, grants: { count: 0, error: null } });
    expect(await isStudioEditor(f.client, "u1")).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("is_admin", { p_user_id: "u1" });
  });

  it("is true for a non-admin holding a course_editors grant, scoped to their own rows", async () => {
    const f = fakeClient({ admin: { data: false, error: null }, grants: { count: 2, error: null } });
    expect(await isStudioEditor(f.client, "u1")).toBe(true);
    expect(f.from).toHaveBeenCalledWith("course_editors");
    expect(f.select).toHaveBeenCalledWith("course_id", { head: true, count: "exact" });
    expect(f.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("is false for a learner", async () => {
    const f = fakeClient({ admin: { data: false, error: null }, grants: { count: 0, error: null } });
    expect(await isStudioEditor(f.client, "u1")).toBe(false);
  });

  it("is false when both reads return an error", async () => {
    const f = fakeClient({
      admin: { data: null, error: { message: "boom" } },
      grants: { count: null, error: { message: "boom" } },
    });
    expect(await isStudioEditor(f.client, "u1")).toBe(false);
  });

  it("is false when a read throws", async () => {
    const f = fakeClient({ admin: new Error("network"), grants: { count: 3, error: null } });
    expect(await isStudioEditor(f.client, "u1")).toBe(false);
  });

  it("is true for a non-admin with a seat and no grant (TCH-007)", async () => {
    const f = fakeClient({
      admin: { data: false, error: null },
      grants: { count: 0, error: null },
      seat: { data: true, error: null },
    });
    expect(await isStudioEditor(f.client, "u1")).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("has_author_seat");
  });

  it("is false for a learner whose seat read errors (migration 082 not applied)", async () => {
    const f = fakeClient({
      admin: { data: false, error: null },
      grants: { count: 0, error: null },
      seat: { data: null, error: { message: "function has_author_seat() does not exist" } },
    });
    expect(await isStudioEditor(f.client, "u1")).toBe(false);
  });

  it("still lets a grant holder in when the seat read errors", async () => {
    const f = fakeClient({
      admin: { data: false, error: null },
      grants: { count: 1, error: null },
      seat: { data: null, error: { message: "boom" } },
    });
    expect(await isStudioEditor(f.client, "u1")).toBe(true);
  });
});
