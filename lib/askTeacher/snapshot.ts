import { z } from "zod";
import { parseItem } from "../items";
import { answerText } from "../learners/answerText";
import { exerciseAnchorId } from "../lessonPlayer/anchors";
import { inlinePlainText } from "../lessons/plainText";
import { VoiceTaskBlockSchema } from "../lessons/taskBlocks";

/**
 * TCH-006 (docs/decisions/0153) — the frozen copy of an exercise or voice task
 * a linked student sends to their teacher with a question ("Ask the teacher").
 * Pure: building it from the lesson document the page was served, reading it
 * back from a stored message, and laying it out as text. Who may attach one,
 * and whether it is genuine, is decided in SQL (migration 081,
 * `_attachment_normalise`): the database keeps only the version id, the block
 * and the response from a client, requires the block to equal the version's
 * own, and writes the course/lesson names, slugs and "Exercise N" itself. The
 * names and the number this module puts in a snapshot are therefore only what
 * the composer previews; the stored ones are the database's.
 *
 * The stored snapshot is the RAW block from the lesson document (the shape the
 * database holds, `{ id, kind, type, payload }`), not the player's parsed
 * block, so the database can compare them. It carries the answer key the
 * player already shipped to the student; the card never shows it (see
 * `exerciseLines`).
 */

export const ATTACHMENT_VERSION = 1;
export const ATTACHMENT_KINDS = ["exercise", "voice_task"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

const AttachmentSchema = z.object({
  v: z.literal(ATTACHMENT_VERSION),
  kind: z.enum(ATTACHMENT_KINDS),
  courseSlug: z.string(),
  courseTitle: z.string(),
  lessonSlug: z.string(),
  lessonTitle: z.string(),
  lessonId: z.string(),
  versionId: z.string(),
  blockId: z.string().min(1),
  /** "Exercise N" among the lesson's practice blocks; null for a voice task. */
  number: z.number().int().nullable(),
  block: z.unknown(),
  /** The student's answer, present only when they chose to include it. */
  response: z.unknown().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/** The stored JSON back into a snapshot; null for anything that isn't one. */
export function parseAttachment(raw: unknown): Attachment | null {
  if (raw === null || raw === undefined) return null;
  const parsed = AttachmentSchema.safeParse(raw);
  if (!parsed.success) return null;
  // A snapshot with no block cannot be laid out; it is as good as unreadable.
  return isRecord(parsed.data.block) ? parsed.data : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** What the lesson page knows when the student opens the composer. */
export type SnapshotSource = {
  course: { slug: string; title: string };
  lesson: { id: string; slug: string; title: string };
  versionId: string;
  /** The lesson document as the page was served it (raw JSON). */
  document: readonly unknown[];
  blockId: string;
  /** The student's checked response; undefined before Check. */
  response?: unknown;
  /** The "Include my answer" toggle. Ignored before Check and for a voice task. */
  includeAnswer: boolean;
};

/** "Exercise N": practice blocks only, in document order, as the player
 * numbers them. null when the block is not a practice block of this document. */
export function exerciseNumber(document: readonly unknown[], blockId: string): number | null {
  let n = 0;
  for (const block of document) {
    if (!isRecord(block)) continue;
    if (block.kind === "practice") n += 1;
    if (block.id === blockId) return block.kind === "practice" ? n : null;
  }
  return null;
}

/** The snapshot for one card, or null when the block can't be asked about
 * (missing, theory, or a task that isn't a voice task). */
export function buildAttachment(src: SnapshotSource): Attachment | null {
  const block = src.document.find((b) => isRecord(b) && b.id === src.blockId);
  if (!isRecord(block)) return null;

  let kind: AttachmentKind;
  if (block.kind === "practice") kind = "exercise";
  else if (block.kind === "task" && block.type === "voice") kind = "voice_task";
  else return null;

  const attachment: Attachment = {
    v: ATTACHMENT_VERSION,
    kind,
    courseSlug: src.course.slug,
    courseTitle: src.course.title,
    lessonSlug: src.lesson.slug,
    lessonTitle: src.lesson.title,
    lessonId: src.lesson.id,
    versionId: src.versionId,
    blockId: src.blockId,
    number: kind === "exercise" ? exerciseNumber(src.document, src.blockId) : null,
    block,
  };
  if (kind === "exercise" && src.includeAnswer && src.response !== undefined && src.response !== null) {
    attachment.response = src.response;
  }
  return attachment;
}

/** The lesson the card links to, with the exercise's card when it has one. */
export function attachmentPath(a: Pick<Attachment, "courseSlug" | "lessonSlug" | "kind" | "blockId">): string {
  const base = `/courses/${a.courseSlug}/${a.lessonSlug}`;
  return a.kind === "exercise" ? `${base}#${exerciseAnchorId(a.blockId)}` : base;
}

export type AnswerView =
  /** Not included (never checked, or the student left it out). */
  | { status: "none" }
  /** Stored, but the block or the answer can't be read back. */
  | { status: "unreadable" }
  | { status: "ok"; lines: string[] };

export type AttachmentView = {
  kind: AttachmentKind;
  number: number | null;
  prompt: string;
  /** The exercise's content as text, with no answer key (see `exerciseLines`). */
  lines: string[];
  answer: AnswerView;
};

/** Plain text for one snapshot. English: the same fixed vocabulary as
 * `answerText` ("Gap 1: ...", "Nothing selected"). Never HTML. */
export function attachmentView(a: Attachment): AttachmentView {
  if (a.kind === "voice_task") {
    const parsed = VoiceTaskBlockSchema.safeParse(a.block);
    return {
      kind: a.kind,
      number: null,
      prompt: parsed.success ? inlinePlainText(parsed.data.prompt) : "",
      lines: [],
      answer: { status: "none" },
    };
  }

  const item = isRecord(a.block) ? parseItem({ id: a.block.id, type: a.block.type, payload: a.block.payload }) : null;
  const text = item?.ok ? exerciseLines(item.item) : null;
  const prompt = item?.ok ? item.item.payload.prompt : "";

  let answer: AnswerView = { status: "none" };
  if (a.response !== undefined && a.response !== null) {
    const read = answerText(a.block, a.response);
    answer =
      read.status === "ok"
        ? { status: "ok", lines: read.lines }
        : { status: "unreadable" };
  }
  return { kind: a.kind, number: a.number, prompt, lines: text ?? [], answer };
}

type ParsedItem = Extract<ReturnType<typeof parseItem>, { ok: true }>["item"];

/**
 * What the exercise offered, as lines. Never the answer key: a selection lists
 * its options without which are right, a True/False item its statements
 * without their truth, an ordering its elements alphabetically (authored
 * order IS the right order), a matching item its left items and, as one line,
 * its right-hand options (the pairing is the key). A slots item is its prompt
 * alone, with the gaps where the student typed.
 */
function exerciseLines(item: ParsedItem): string[] {
  switch (item.type) {
    case "selection":
      return item.payload.options.map((o) => o.text);
    case "selection_grid":
      return item.payload.rows.map((r) => r.statement);
    case "ordering":
      return item.payload.elements.map((e) => e.text).sort((x, y) => x.localeCompare(y));
    case "matching": {
      const label = (c: { kind: "text"; text: string } | { kind: "image"; src: string; alt: string }) =>
        c.kind === "text" ? c.text : `[image: ${c.alt}]`;
      const left = item.payload.left.map((l) => label(l.content));
      const right = item.payload.right.map((r) => label(r.content)).sort((x, y) => x.localeCompare(y));
      return right.length > 0 ? [...left, right.join(" · ")] : left;
    }
    case "slots":
      return [];
  }
}
