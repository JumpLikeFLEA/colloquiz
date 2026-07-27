import type { EnrichedResult } from "@/lib/questions";

// Per-subject aggregate for the Progress > Stats charts. Both the radar and the
// bar chart read from ONE pass over the results the page already fetched — they
// are two views of the same numbers, so a second query would only risk them
// disagreeing.

export type SubjectStat = {
  /** Display name as recorded on the result (a subjects.json name, or "Mixed"). */
  subject: string;
  /** Quizzes the user has attempted in this subject. */
  quizzes: number;
  /** Average score across those quizzes, 0..100. */
  avgScore: number;
};

export type RadarPoint = SubjectStat & {
  /** Axis label, pre-split into lines. Never truncated, never duplicated. */
  lines: string[];
};

/** A radar stops being readable past ~8 axes, and the catalogue keeps growing. */
export const RADAR_SUBJECT_LIMIT = 8;

/** Under three axes a radar is a line or a slither, not a shape worth reading. */
export const RADAR_MIN_SUBJECTS = 3;

/** Bar rows shown before the "Show all N subjects" expander. */
export const BAR_COLLAPSED_ROWS = 6;

/**
 * One pass over every result, grouped by subject.
 *
 * Ordered most-played first so the radar's cap is a plain `.slice()` of the head.
 * Ties break on score then name, so the ranking is stable across renders rather
 * than dependent on Map insertion order.
 */
export function aggregateBySubject(results: EnrichedResult[]): SubjectStat[] {
  const acc = new Map<string, { quizzes: number; scoreSum: number }>();
  for (const r of results) {
    const cur = acc.get(r.subject) ?? { quizzes: 0, scoreSum: 0 };
    cur.quizzes += 1;
    cur.scoreSum += r.score;
    acc.set(r.subject, cur);
  }
  return [...acc.entries()]
    .map(([subject, { quizzes, scoreSum }]) => ({
      subject,
      quizzes,
      avgScore: Math.round((scoreSum / quizzes) * 100),
    }))
    .sort(
      (a, b) =>
        b.quizzes - a.quizzes ||
        b.avgScore - a.avgScore ||
        a.subject.localeCompare(b.subject),
    );
}

/** Strongest subject first — the "what should I study next" ordering, read bottom-up. */
export function byAvgScoreDesc(stats: SubjectStat[]): SubjectStat[] {
  return [...stats].sort(
    (a, b) =>
      b.avgScore - a.avgScore ||
      b.quizzes - a.quizzes ||
      a.subject.localeCompare(b.subject),
  );
}

// ---------------------------------------------------------------------------
// Axis labels
//
// The radar previously handed raw names to Recharts, which clipped them at the
// SVG edge: "Motion Desi…", "Comput…", and — worst — two different subjects both
// reading "History". A truncated label is not a shorter label, it is a wrong one.
// So: never truncate. Wrap on the spaces that are already in the name, and fall
// back to a defined short name only when wrapping alone would need a third line.
// ---------------------------------------------------------------------------

/** Names that cannot wrap into MAX_LINES on their own. Keep this list tiny. */
const SHORT_NAMES: Record<string, string> = {
  "Motion Design & Video": "Motion Design",
};

const MAX_LINE_CHARS = 12;
const MAX_LINES = 2;

/**
 * Greedy word wrap. Splits only on existing spaces, so `lines.join(" ")` always
 * reconstructs the input exactly — the property the uniqueness pass below relies on.
 */
function wrap(name: string): string[] {
  const lines: string[] = [];
  for (const word of name.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= MAX_LINE_CHARS) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

function labelLines(name: string): string[] {
  const wrapped = wrap(name);
  if (wrapped.length <= MAX_LINES) return wrapped;
  const short = SHORT_NAMES[name];
  // Nothing defined for this name: a third line is untidy, but it is still the
  // whole name. Dropping characters is the one thing we will not do.
  return short ? wrap(short) : wrapped;
}

/**
 * The radar's series: the most-played subjects, capped, each with a label that is
 * guaranteed distinct from every other label in the same chart.
 *
 * The guarantee holds because `aggregateBySubject` keys by subject name, so the
 * inputs are already distinct, and `wrap()` preserves its input exactly — falling
 * back to the full name therefore always breaks a collision. Only SHORT_NAMES can
 * introduce one in the first place.
 */
export function toRadarPoints(
  stats: SubjectStat[],
  limit: number = RADAR_SUBJECT_LIMIT,
): RadarPoint[] {
  const points = stats.slice(0, limit).map((s) => ({ ...s, lines: labelLines(s.subject) }));

  const uses = new Map<string, number>();
  for (const p of points) {
    const text = p.lines.join(" ");
    uses.set(text, (uses.get(text) ?? 0) + 1);
  }

  return points.map((p) =>
    (uses.get(p.lines.join(" ")) ?? 0) > 1 ? { ...p, lines: wrap(p.subject) } : p,
  );
}
