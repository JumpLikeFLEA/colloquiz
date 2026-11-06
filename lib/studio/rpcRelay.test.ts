import { describe, expect, it } from "vitest";
import { refusalStatus, relayRpc } from "./rpcRelay";

const msg = (c: string | undefined) => `m:${c}`;
const answer = (data: unknown, error: { message: string } | null = null) => Promise.resolve({ data, error });

describe("relayRpc", () => {
  it.each([
    ["not_found", 404],
    ["forbidden", 403],
    ["seat_lapsed", 403],
    ["invalid_name", 400],
    [undefined, 400],
  ])("maps refusal %s to %s", async (code, status) => {
    const out = await relayRpc(answer({ ok: false, error: code }), msg);
    expect(out.failure).toEqual({ status, error: `m:${code}` });
    expect(refusalStatus(code)).toBe(status);
  });
  it("maps a transport error to 500 without leaking the message", async () => {
    const out = await relayRpc(answer(null, { message: "secret db detail" }), msg);
    expect(out.failure).toEqual({ status: 500, error: "Something went wrong." });
  });
  it("treats null data as a refusal, not a success", async () => {
    const out = await relayRpc(answer(null), msg);
    expect(out.failure?.status).toBe(400);
  });
  it("returns the result of an ok answer", async () => {
    const out = await relayRpc(answer({ ok: true, id: "x" }), msg);
    expect(out.failure).toBeUndefined();
    expect(out.result?.id).toBe("x");
  });
});
