import { describe, expect, it } from "vitest";
import { fix, own, said, summary } from "./fixtures";
import { notebookFileName, notebookTextFile } from "./textFile";

const now = new Date("2026-11-25T08:00:00Z");

describe("notebookTextFile", () => {
  it("writes every kind in 0236's format, oldest course first", () => {
    const text = notebookTextFile({
      lang: "en",
      now,
      summaries: [
        summary({ submissionId: "t1", courseTitle: "Future Imperfect", lessonTitle: "Vocabulary", kind: "first", summary: "A clear story.", goal: "Use two linkers.", takenAt: "2026-11-12T10:00:00Z" }),
        summary({ submissionId: "t2", courseTitle: "Future Imperfect", lessonTitle: "Review", kind: "final", summary: "Smoother now.", nextStep: "Try the past perfect.", takenAt: "2026-11-20T10:00:00Z" }),
      ],
      entries: [
        said("be about to", { courseId: "c2", courseTitle: "Small Talk", quote: "I'm about to go", createdAt: "2026-11-15T10:00:00Z" }),
        said("be about to", { courseId: "c1", courseTitle: "Future Imperfect", quote: "I was about to leave", exact: false, createdAt: "2026-11-12T10:00:00Z" }),
        own("on second thought", { courseId: "c1", courseTitle: "Future Imperfect", note: "Use it to change my mind.\nAlso: on reflection", createdAt: "2026-11-13T10:00:00Z" }),
        own("a free note", { courseId: null, courseTitle: null, createdAt: "2026-11-01T10:00:00Z" }),
        fix({ courseId: "c1", courseTitle: "Future Imperfect", quote: "I have went", correction: "I went" }),
      ],
    });
    expect(text).toBe(
      [
        "﻿ALINA CHER · NOTEBOOK",
        "2026-11-25",
        "",
        "== SUMMARIES ==",
        "Future Imperfect · Review · 20 Nov 2026",
        "Smoother now.",
        "Next step: Try the past perfect.",
        "AI feedback can be wrong. It is not a grade.",
        "",
        "Future Imperfect · Vocabulary · 12 Nov 2026",
        "A clear story.",
        "Goal: Use two linkers.",
        "AI feedback can be wrong. It is not a grade.",
        "",
        "== PHRASES ==",
        "Future Imperfect",
        "- be about to",
        '  You said: "I was about to leave" (close)',
        "- [my note] on second thought",
        "  Use it to change my mind.",
        "  Also: on reflection",
        "",
        "Small Talk",
        "- be about to",
        '  You said: "I\'m about to go"',
        "",
        "Not from a course",
        "- [my note] a free note",
        "",
        "== FIXES ==",
        "Future Imperfect",
        '- You said: "I have went"',
        '  Better: "I went"',
        "",
      ].join("\n"),
    );
  });

  it("keeps Cyrillic intact and uses Russian headings", () => {
    const text = notebookTextFile({
      lang: "ru",
      now,
      summaries: [summary({ courseTitle: "Будущее", lessonTitle: "Словарь", summary: "Вы рассказали историю.", goal: null, takenAt: "2026-11-12T10:00:00Z" })],
      entries: [own("на всякий случай", { courseTitle: "Будущее", note: "just in case — запомнить" })],
    });
    expect(text.startsWith("﻿ALINA CHER · БЛОКНОТ\n2026-11-25\n")).toBe(true);
    expect(text).toContain("== РАЗБОРЫ ==\nБудущее · Словарь · 12 нояб. 2026 г.\nВы рассказали историю.\nИИ-разбор может ошибаться и не является оценкой.\n");
    expect(text).toContain("== ФРАЗЫ ==\nБудущее\n- [моя заметка] на всякий случай\n  just in case — запомнить\n");
    expect(text).not.toContain("== ИСПРАВЛЕНИЯ ==");
    // Encodes to UTF-8 with the BOM's three bytes first, and round-trips unchanged.
    const bytes = new TextEncoder().encode(text);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(text);
  });

  it("leaves out empty sections and a summary with nothing to draw", () => {
    const text = notebookTextFile({ lang: "en", now, entries: [], summaries: [summary({ summary: " ", goal: null })] });
    expect(text).toBe("﻿ALINA CHER · NOTEBOOK\n2026-11-25\n");
  });

  it("merges a phrase said in two takes of one course into one row, newest quote", () => {
    const text = notebookTextFile({
      lang: "en",
      now,
      summaries: [],
      entries: [
        said("be about to", { submissionId: "t1", quote: "old", createdAt: "2026-11-01T10:00:00Z" }),
        said("Be about to", { submissionId: "t2", quote: "new", createdAt: "2026-11-05T10:00:00Z" }),
      ],
    });
    expect(text.match(/about to/gi)).toHaveLength(1);
    expect(text).toContain('You said: "new"');
  });
});

describe("notebookFileName", () => {
  it("names the file by the UTC date", () => {
    expect(notebookFileName(new Date("2026-11-25T23:30:00Z"))).toBe("alina-cher-notebook-2026-11-25.txt");
  });
});
