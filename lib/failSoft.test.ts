import { afterEach, describe, expect, it, vi } from "vitest";
import { failSoft } from "./failSoft";

afterEach(() => vi.restoreAllMocks());

describe("failSoft", () => {
  it("resolves to the read's value and logs nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(failSoft("x failed", async () => [1, 2], [])).resolves.toEqual([1, 2]);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the label and the error, then falls back, when the read rejects", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("boom");
    await expect(failSoft("x failed", async () => Promise.reject(boom), null)).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith("x failed", boom);
  });

  it("also falls back when the read throws synchronously", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = (): Promise<number> => {
      throw new Error("sync");
    };
    await expect(failSoft("x failed", read, 7)).resolves.toBe(7);
  });

  it("keeps a falsy value the read returned (only a throw falls back)", async () => {
    await expect(failSoft("x failed", async () => 0, 5)).resolves.toBe(0);
  });
});
