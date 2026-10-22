import type { GOAL_REACHED_STATUSES, Span, StoredAnalysis } from "./schema";

/**
 * What the learner's feedback view does with a stored analysis (VOICE-014,
 * docs/decisions/0189). Pure: the view components only draw what this returns.
 *
 * - `parseStoredAnalysis` (parseStored.ts, split out for the zod import, docs/decisions/0191) reads
 *   a `voice_analyses.result` defensively into the `ViewAnalysis` below.
 * - `buildSegments` lays the layers over the transcript. validate.ts leaves the layers unresolved
 *   against each other (an expression can sit inside an error), so the order of precedence is
 *   decided here: an error, then a highlight, then an expression.
 * - The counts are recomputed from the items that survived parsing, so a card never disagrees with
 *   the list under it.
 */

/** What the view reads: StoredAnalysis without the bookkeeping, counts recomputed. */
export type ViewAnalysis = Omit<StoredAnalysis, "v" | "counts" | "dropped"> & {
  counts: StoredAnalysis["counts"];
};

// ── The marked transcript ───────────────────────────────────────────────

export type MarkKind = "error" | "strength" | "self_correction" | "hesitation" | "expression";

export type Mark = {
  /** Stable within one analysis: `error-0`, `highlight-2`, `expression-1`. */
  id: string;
  kind: MarkKind;
  span: Span;
};

export type Segment = { text: string; mark: Mark | null };

/** Every item, in the order that decides who keeps the words when two overlap. */
export function marksOf(a: ViewAnalysis): Mark[] {
  return [
    ...a.errors.map((e, i): Mark => ({ id: `error-${i}`, kind: "error", span: e.span })),
    ...a.highlights.map((h, i): Mark => ({ id: `highlight-${i}`, kind: h.kind, span: h.span })),
    ...a.expressionsUsed.map((e, i): Mark => ({ id: `expression-${i}`, kind: "expression", span: e.span })),
  ];
}

/**
 * The transcript cut into runs, each a plain stretch or one mark. Marks are placed in the order
 * given; one that overlaps a mark already placed stays in its list but is not drawn over the words.
 * The runs always join back into the transcript.
 */
export function buildSegments(transcript: string, marks: readonly Mark[]): Segment[] {
  const placed: Mark[] = [];
  for (const m of marks) {
    if (m.span.start < 0 || m.span.end > transcript.length || m.span.end <= m.span.start) continue;
    if (placed.some((p) => p.span.start < m.span.end && m.span.start < p.span.end)) continue;
    placed.push(m);
  }
  placed.sort((x, y) => x.span.start - y.span.start);

  const out: Segment[] = [];
  let at = 0;
  for (const m of placed) {
    if (m.span.start > at) out.push({ text: transcript.slice(at, m.span.start), mark: null });
    out.push({ text: transcript.slice(m.span.start, m.span.end), mark: m });
    at = m.span.end;
  }
  if (at < transcript.length) out.push({ text: transcript.slice(at), mark: null });
  return out;
}

export type MarkDetail = {
  label: string;
  quote: string;
  /** The corrected wording, errors only. */
  correction: string | null;
  text: string;
};

export const MARK_LABELS: Record<MarkKind, string> = {
  error: "To fix",
  strength: "Worked well",
  self_correction: "You fixed it yourself",
  hesitation: "Hesitation",
  expression: "Expression from the lesson",
};

/** What a tap on a mark explains. Null when the id does not name an item. */
export function markDetail(a: ViewAnalysis, id: string): MarkDetail | null {
  const [group, raw] = id.split("-");
  const i = Number(raw);
  if (!Number.isInteger(i)) return null;
  if (group === "error") {
    const e = a.errors[i];
    return e ? { label: MARK_LABELS.error, quote: e.quote, correction: e.correction, text: e.explanation } : null;
  }
  if (group === "highlight") {
    const h = a.highlights[i];
    return h ? { label: MARK_LABELS[h.kind], quote: h.quote, correction: null, text: h.note } : null;
  }
  if (group === "expression") {
    const e = a.expressionsUsed[i];
    if (!e) return null;
    const text = e.exact
      ? `You used “${e.expression}”.`
      : `Close to “${e.expression}”: check the exact wording.`;
    return { label: MARK_LABELS.expression, quote: e.quote, correction: null, text };
  }
  return null;
}

// ── Cards and deltas ────────────────────────────────────────────────────

export type StatCard = {
  key: "errors" | "highlights" | "hesitations" | "expressions";
  label: string;
  value: string;
  /** The same figure on the first take, shown as `from → value` on a final. */
  from: string | null;
};

function cardFigures(a: ViewAnalysis) {
  const listed = a.counts.expressionsListed;
  return {
    errors: String(a.counts.errors),
    highlights: String(a.highlights.filter((h) => h.kind !== "hesitation").length),
    hesitations: String(a.counts.hesitations),
    expressions: listed > 0 ? `${a.counts.expressionsUsed} of ${listed}` : null,
  };
}

/**
 * The count cards. They are counts of what the analysis marked, not a score (0156 Decision 1).
 * The expressions card exists only when the author listed some. With a baseline each card also
 * carries the first take's figure; a figure the first take cannot supply is left out, never zero.
 */
export function statCards(a: ViewAnalysis, baseline: ViewAnalysis | null): StatCard[] {
  const now = cardFigures(a);
  const then = baseline ? cardFigures(baseline) : null;
  const cards: StatCard[] = [
    { key: "errors", label: "Errors", value: now.errors, from: then?.errors ?? null },
    { key: "highlights", label: "Good moments", value: now.highlights, from: then?.highlights ?? null },
    { key: "hesitations", label: "Hesitations", value: now.hesitations, from: then?.hesitations ?? null },
  ];
  if (now.expressions !== null) {
    cards.push({
      key: "expressions",
      label: "Expressions used",
      value: now.expressions,
      from: then?.expressions ?? null,
    });
  }
  return cards;
}

export const GOAL_REACHED_LABELS: Record<(typeof GOAL_REACHED_STATUSES)[number], string> = {
  reached: "Goal reached",
  partly: "Partly there",
  not_yet: "Not yet",
};

// ── Polling ─────────────────────────────────────────────────────────────

/** A take usually finishes in 20 to 30 s (docs/decisions/0187 Evidence). */
const POLL_DELAYS_MS = [2000, 2000, 3000, 4000, 5000, 8000, 12000, 15000] as const;
/** After this the view stops asking and says so. The row itself is failed by the daily sweep. */
export const POLL_GIVE_UP_MS = 5 * 60_000;

/** Wait before poll number `attempt` (0 = the first after the previous one). Backs off to 15 s. */
export function pollDelayMs(attempt: number): number {
  return POLL_DELAYS_MS[Math.min(Math.max(0, attempt), POLL_DELAYS_MS.length - 1)];
}

export function shouldGiveUp(elapsedMs: number): boolean {
  return elapsedMs >= POLL_GIVE_UP_MS;
}

// ── The status route's answer ───────────────────────────────────────────

export const IN_PROGRESS_STATUSES = ["pending", "transcribing", "analysing"] as const;
export type AnalysisStatus =
  | (typeof IN_PROGRESS_STATUSES)[number]
  | "done"
  | "failed"
  | "withdrawn"
  | "limit"
  | "paused"
  | "off"
  | "none";

export type AnalysisStatusBody =
  | { ok: true; status: Exclude<AnalysisStatus, "done"> }
  | {
      ok: true;
      status: "done";
      transcript: string;
      result: unknown;
      /** The learner's first take of the same task, for a final: its transcript and result. */
      baseline: { transcript: string; result: unknown } | null;
    };

const STATUS_WORDS = new Set<string>([...IN_PROGRESS_STATUSES, "done", "failed", "withdrawn", "limit", "paused", "off", "none"]);

export function isInProgress(status: AnalysisStatus): boolean {
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

/** The client's read of the route's JSON. Anything it does not recognise is null (shown as "try again later"). */
export function parseStatusBody(raw: unknown): AnalysisStatusBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.ok !== true || typeof o.status !== "string" || !STATUS_WORDS.has(o.status)) return null;
  if (o.status !== "done") return { ok: true, status: o.status as Exclude<AnalysisStatus, "done"> };
  if (typeof o.transcript !== "string") return null;
  const b = o.baseline;
  const baseline =
    typeof b === "object" && b !== null && typeof (b as Record<string, unknown>).transcript === "string"
      ? { transcript: (b as { transcript: string }).transcript, result: (b as { result?: unknown }).result }
      : null;
  return { ok: true, status: "done", transcript: o.transcript, result: o.result, baseline };
}
