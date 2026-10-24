import type { ImportPlan } from "./plan";

/**
 * Which step an import runs next (CNT-018, docs/decisions/0203 Decision 5). The row is the
 * state machine, so the next step is a function of what the row holds, and a run that died
 * anywhere resumes from the same answer.
 *
 *   pending                          -> prepare  (read the file; upload a PDF to the Files API)
 *   planning, no plan                -> plan
 *   planning/drafting, k < n lessons -> draft lesson k
 *   drafting, k = n                  -> commit
 *   committing                       -> commit
 */
export type ImportStepKind =
  | { kind: "prepare" }
  | { kind: "plan" }
  | { kind: "draft"; index: number }
  | { kind: "commit" }
  | { kind: "none" };

export function nextStep(row: { status: string; plan: ImportPlan | null; lessonsDone: number }): ImportStepKind {
  switch (row.status) {
    case "pending":
      return { kind: "prepare" };
    case "planning":
    case "drafting":
      if (!row.plan) return row.status === "planning" ? { kind: "plan" } : { kind: "none" };
      return row.lessonsDone < row.plan.lessons.length ? { kind: "draft", index: row.lessonsDone } : { kind: "commit" };
    case "committing":
      return { kind: "commit" };
    default:
      return { kind: "none" };
  }
}

/** One repair turn per lesson (docs/decisions/0203 Decision 5): the first failure repairs, the second fails. */
export function shouldRepair(repairsSoFar: number): boolean {
  return repairsSoFar < 1;
}

/** A step is bounded well inside the 300 s function limit; the lease outlasts a dead function. */
export const LEASE_SECONDS = 300;
/** After this long a run starts no new step and hands over to the next status poll. */
export const STEP_BUDGET_MS = 130_000;

/** How long after a row last moved the status route offers it for re-claiming (the claim itself decides). */
export const RECLAIM_AFTER_MS = 10_000;

export function shouldReclaim(status: string, updatedAt: string, nowMs: number): boolean {
  if (status !== "pending" && status !== "planning" && status !== "drafting" && status !== "committing") return false;
  const t = Date.parse(updatedAt);
  return Number.isNaN(t) || nowMs - t >= RECLAIM_AFTER_MS;
}
