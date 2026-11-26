import { phraseRows, type PhraseRow } from "./phrases";
import { toCard } from "./summaryCard";
import { newestFirst } from "./newest";
import type { FixEntry, NotebookEntry, NotebookSummary } from "./types";

/**
 * PROG-019 (docs/decisions/0236 section 8, 0243) — the notebook as one text file, built from the
 * learner's own `my_notebook()` rows. UTF-8 with a BOM (older Windows Notepad needs it for
 * Cyrillic), LF line ends, headings in the saved language, a section with no rows left out, the
 * oldest course first and, inside a course, the oldest row first. AI text is copied as stored,
 * never re-worded. To try is not in the file: it is derived, not the learner's record.
 *
 * Phrases are merged as the page merges them (`phraseRows`: one row per course and phrase key,
 * the newest take's quote), so the file and the Phrases tab list the same rows.
 */

const BOM = "﻿";

/** The saved EN/RU choice; spelled out because this folder imports only its own modules. */
type SurfaceLang = "en" | "ru";

const strings = {
  en: {
    title: "ALINA CHER · NOTEBOOK",
    summaries: "SUMMARIES",
    phrases: "PHRASES",
    fixes: "FIXES",
    youSaid: "You said",
    close: "(close)",
    better: "Better",
    myNote: "[my note]",
    goal: "Goal",
    nextStep: "Next step",
    disclaimer: "AI feedback can be wrong. It is not a grade.",
    noCourse: "Not from a course",
    untitledCourse: "Course",
    locale: "en-GB",
  },
  ru: {
    title: "ALINA CHER · БЛОКНОТ",
    summaries: "РАЗБОРЫ",
    phrases: "ФРАЗЫ",
    fixes: "ИСПРАВЛЕНИЯ",
    youSaid: "Вы сказали",
    close: "(почти так)",
    better: "Лучше",
    myNote: "[моя заметка]",
    goal: "Цель",
    nextStep: "Следующий шаг",
    disclaimer: "ИИ-разбор может ошибаться и не является оценкой.",
    noCourse: "Не из курса",
    untitledCourse: "Курс",
    locale: "ru-RU",
  },
} as const;

/** `alina-cher-notebook-YYYY-MM-DD.txt`, the UTC date of `now`. */
export function notebookFileName(now: Date): string {
  return `alina-cher-notebook-${isoDate(now)}.txt`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

type Row = { courseId: string | null; courseTitle: string | null; createdAt: string };

/**
 * Rows grouped by course, the oldest course first (by its oldest row), rows oldest first; rows
 * with no course (own notes added on the page) come last. A course's heading is its newest row's
 * title snapshot, so a renamed course is one group under its later name.
 */
function byCourse<T extends Row>(rows: readonly T[], s: (typeof strings)[SurfaceLang]): { heading: string; rows: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const r of [...newestFirst(rows, (x) => x.createdAt)].reverse()) {
    const g = groups.get(r.courseId);
    if (g) g.push(r);
    else groups.set(r.courseId, [r]);
  }
  const ordered = [...groups.entries()].sort(([a, ra], [b, rb]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return Date.parse(ra[0].createdAt) - Date.parse(rb[0].createdAt);
  });
  return ordered.map(([id, list]) => ({
    heading: id === null ? s.noCourse : list[list.length - 1].courseTitle?.trim() || s.untitledCourse,
    rows: list,
  }));
}

function phraseLines(row: PhraseRow, s: (typeof strings)[SurfaceLang]): string[] {
  if (row.kind === "own") {
    const lines = [`- ${s.myNote} ${row.phrase}`];
    if (row.note !== null && row.note.trim() !== "") lines.push(...indent(row.note));
    return lines;
  }
  return [`- ${row.phrase}`, `  ${s.youSaid}: "${row.quote}"${row.close ? ` ${s.close}` : ""}`];
}

function fixLines(row: FixEntry, s: (typeof strings)[SurfaceLang]): string[] {
  return [`- ${s.youSaid}: "${row.quote}"`, `  ${s.better}: "${row.correction}"`];
}

/** A multi-line note keeps its own line breaks, each line indented under its bullet. */
function indent(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => `  ${l}`);
}

function summaryLines(summary: NotebookSummary, s: (typeof strings)[SurfaceLang]): string[] | null {
  const card = toCard(summary);
  if (!card) return null;
  const source = [summary.courseTitle, summary.lessonTitle, shortDate(summary.takenAt, s.locale)].filter(
    (x): x is string => typeof x === "string" && x.trim() !== "",
  );
  const lines = [source.join(" · ")];
  if (card.text !== null) lines.push(...card.text.replace(/\r\n?/g, "\n").split("\n"));
  if (card.follow.kind !== "none") lines.push(`${card.follow.kind === "goal" ? s.goal : s.nextStep}: ${card.follow.text}`);
  lines.push(s.disclaimer);
  return lines;
}

export function notebookTextFile(input: {
  entries: readonly NotebookEntry[];
  summaries: readonly NotebookSummary[];
  lang: SurfaceLang;
  now: Date;
}): string {
  const s = strings[input.lang];
  const out: string[] = [s.title, isoDate(input.now)];

  // Every summary, newest first (0236 section 8).
  const summaries = newestFirst(input.summaries, (x) => x.takenAt)
    .map((x) => summaryLines(x, s))
    .filter((x): x is string[] => x !== null);
  if (summaries.length > 0) {
    out.push("", `== ${s.summaries} ==`);
    summaries.forEach((lines, i) => {
      if (i > 0) out.push("");
      out.push(...lines);
    });
  }

  const sections: [string, { heading: string; lines: string[] }[]][] = [
    [
      s.phrases,
      byCourse(phraseRows(input.entries), s).map((g) => ({ heading: g.heading, lines: g.rows.flatMap((r) => phraseLines(r, s)) })),
    ],
    [
      s.fixes,
      byCourse(
        input.entries.filter((e): e is FixEntry => e.kind === "fix"),
        s,
      ).map((g) => ({ heading: g.heading, lines: g.rows.flatMap((r) => fixLines(r, s)) })),
    ],
  ];
  for (const [title, groups] of sections) {
    if (groups.length === 0) continue;
    out.push("", `== ${title} ==`);
    groups.forEach((g, i) => {
      if (i > 0) out.push("");
      out.push(g.heading, ...g.lines);
    });
  }

  return `${BOM}${out.join("\n")}\n`;
}
