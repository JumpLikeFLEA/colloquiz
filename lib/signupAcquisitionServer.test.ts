import { afterEach, describe, expect, it, vi } from "vitest";
import { recordSignupAcquisition } from "./signupAcquisitionServer";

function fakeClient(result: unknown) {
  const rpc = vi.fn().mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { rpc } as unknown as Parameters<typeof recordSignupAcquisition>[0] & { rpc: typeof rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordSignupAcquisition", () => {
  it("calls the RPC with the source and the slug parsed from next", async () => {
    const client = fakeClient({ data: { ok: true, recorded: true }, error: null });
    await recordSignupAcquisition(client, { source: "telegram", next: "/courses/future-imperfect/lesson-3" });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("record_signup_acquisition", {
      p_source: "telegram",
      p_course_slug: "future-imperfect",
    });
  });

  it("passes a null slug for a next path outside /courses/", async () => {
    const client = fakeClient({ data: { ok: true, recorded: true }, error: null });
    await recordSignupAcquisition(client, { source: "direct", next: "/" });
    expect(client.rpc).toHaveBeenCalledWith("record_signup_acquisition", {
      p_source: "direct",
      p_course_slug: null,
    });
  });

  it("makes no call at all when source is null (opt-out or unthreaded path)", async () => {
    const client = fakeClient({ data: { ok: true, recorded: true }, error: null });
    await recordSignupAcquisition(client, { source: null, next: "/courses/future-imperfect/lesson-1" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("swallows an RPC error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ data: null, error: { message: "boom" } });
    await expect(
      recordSignupAcquisition(client, { source: "instagram", next: "/courses/x" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it("swallows a refusal from the RPC", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ data: { ok: false, error: "not_a_new_account" }, error: null });
    await expect(
      recordSignupAcquisition(client, { source: "instagram", next: "/courses/x" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("record_signup_acquisition refused", { ok: false, error: "not_a_new_account" });
  });

  it("swallows a thrown error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(new Error("network down"));
    await expect(
      recordSignupAcquisition(client, { source: "instagram", next: "/courses/x" }),
    ).resolves.toBeUndefined();
  });
});
