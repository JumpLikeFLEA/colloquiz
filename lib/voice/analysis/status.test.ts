import { describe, expect, it, vi } from "vitest";
import { readAnalysisStatus, stateWithoutVisibleRow, type StatusDeps } from "./status";

function deps(over: Partial<StatusDeps> = {}): StatusDeps & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const counted = <K extends keyof StatusDeps>(name: K, fn: StatusDeps[K]): StatusDeps[K] =>
    ((...args: unknown[]) => {
      calls[name] = (calls[name] ?? 0) + 1;
      return (fn as (...a: unknown[]) => unknown)(...args);
    }) as StatusDeps[K];
  const base: StatusDeps = {
    ownsTake: async () => true,
    readVisible: async () => null,
    readHidden: async () => false,
    readLedger: async () => null,
    readBaselineId: async () => null,
    readBaseline: async () => null,
  };
  const merged = { ...base, ...over };
  return {
    ownsTake: counted("ownsTake", merged.ownsTake),
    readVisible: counted("readVisible", merged.readVisible),
    readHidden: counted("readHidden", merged.readHidden),
    readLedger: counted("readLedger", merged.readLedger),
    readBaselineId: counted("readBaselineId", merged.readBaselineId),
    readBaseline: counted("readBaseline", merged.readBaseline),
    calls,
  };
}

const DONE = { status: "done", transcript: "I went home.", result: { kind: "first" } };

describe("stateWithoutVisibleRow", () => {
  it("withdrawn beats everything, then limit, then paused", () => {
    expect(stateWithoutVisibleRow({ hidden: true, ledger: { analysed: false, uncountedReason: "hidden" } })).toBe("withdrawn");
    expect(stateWithoutVisibleRow({ hidden: false, ledger: { analysed: false, uncountedReason: null } })).toBe("limit");
    expect(stateWithoutVisibleRow({ hidden: false, ledger: { analysed: true, uncountedReason: "paused" } })).toBe("paused");
  });

  it("is none for a send that was analysed and counted, and for no ledger row at all", () => {
    expect(stateWithoutVisibleRow({ hidden: false, ledger: { analysed: true, uncountedReason: null } })).toBe("none");
    expect(stateWithoutVisibleRow({ hidden: false, ledger: null })).toBe("none");
  });
});

describe("readAnalysisStatus", () => {
  it("returns a done analysis with its transcript", async () => {
    const d = deps({ readVisible: async () => DONE });
    expect(await readAnalysisStatus("t1", "on", d)).toEqual({
      ok: true,
      status: "done",
      transcript: "I went home.",
      result: { kind: "first" },
      baseline: null,
    });
  });

  it("attaches the baseline a final was compared with, for the owner only", async () => {
    const base = {
      readVisible: async () => DONE,
      readBaselineId: async () => "t0",
      readBaseline: async (id: string) => (id === "t0" ? { transcript: "I go home.", result: { kind: "first" } } : null),
    };
    const owner = await readAnalysisStatus("t1", "on", deps(base));
    expect(owner).toMatchObject({ status: "done", baseline: { transcript: "I go home." } });
    // The control above is what makes this denial mean something: same row, not the owner.
    const author = deps({ ...base, ownsTake: async () => false });
    const seen = await readAnalysisStatus("t1", "on", author);
    expect(seen).toMatchObject({ status: "done", baseline: null });
    expect(author.calls.readBaselineId ?? 0).toBe(0);
  });

  it("is failed for a done row with no transcript or result, rather than an empty view", async () => {
    expect(await readAnalysisStatus("t1", "on", deps({ readVisible: async () => ({ status: "done", transcript: null, result: null }) }))).toEqual({
      ok: true,
      status: "failed",
    });
  });

  it("passes an in-progress word through, and stays silent under off", async () => {
    for (const status of ["pending", "transcribing", "analysing"]) {
      const d = deps({ readVisible: async () => ({ status, transcript: null, result: null }) });
      expect(await readAnalysisStatus("t1", "on", d)).toEqual({ ok: true, status });
      expect(await readAnalysisStatus("t1", "paused", d)).toEqual({ ok: true, status });
      expect(await readAnalysisStatus("t1", "off", d)).toEqual({ ok: true, status: "off" });
    }
  });

  it("reports a failed row", async () => {
    const d = deps({ readVisible: async () => ({ status: "failed", transcript: null, result: null }) });
    expect(await readAnalysisStatus("t1", "on", d)).toEqual({ ok: true, status: "failed" });
  });

  it("tells the owner their analysis was withdrawn", async () => {
    const d = deps({ readHidden: async () => true, readLedger: async () => ({ analysed: true, uncountedReason: "hidden" }) });
    expect(await readAnalysisStatus("t1", "on", d)).toEqual({ ok: true, status: "withdrawn" });
  });

  it("tells a cohort learner the send went past a cap", async () => {
    const d = deps({ readLedger: async () => ({ analysed: false, uncountedReason: null }) });
    expect(await readAnalysisStatus("t1", "on", d)).toEqual({ ok: true, status: "limit" });
  });

  it("tells the owner the analysis was paused", async () => {
    const d = deps({ readLedger: async () => ({ analysed: true, uncountedReason: "paused" }) });
    expect(await readAnalysisStatus("t1", "paused", d)).toEqual({ ok: true, status: "paused" });
  });

  it("tells someone who does not own the take nothing, and never asks the privileged reads", async () => {
    const hidden = vi.fn(async () => true);
    const ledger = vi.fn(async () => ({ analysed: false, uncountedReason: null }));
    const stranger = deps({ ownsTake: async () => false, readHidden: hidden, readLedger: ledger });
    expect(await readAnalysisStatus("t1", "on", stranger)).toEqual({ ok: true, status: "none" });
    expect(hidden).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
    // Control: the same answers, asked by the owner, are returned.
    const owner = deps({ readHidden: hidden, readLedger: ledger });
    expect(await readAnalysisStatus("t1", "on", owner)).toEqual({ ok: true, status: "withdrawn" });
    expect(hidden).toHaveBeenCalledTimes(1);
  });

  it("says off, not a reason, when the mode is off and there is nothing to read", async () => {
    const d = deps({ readLedger: async () => ({ analysed: false, uncountedReason: null }) });
    expect(await readAnalysisStatus("t1", "off", d)).toEqual({ ok: true, status: "off" });
    expect(d.calls.readLedger ?? 0).toBe(0);
  });

  it("is none for a take with no ledger row and no hidden analysis", async () => {
    expect(await readAnalysisStatus("t1", "on", deps())).toEqual({ ok: true, status: "none" });
  });
});
