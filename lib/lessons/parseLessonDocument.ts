import { z } from "zod";
import { parseItem, type Item } from "../items";
import { TheoryBlockSchema, type TheoryBlock } from "./theoryBlocks";

/**
 * The single validator for a lesson document (CNT-003; 0018 Decision 2). A
 * document is an ordered array of blocks, each either a THEORY block (parsed
 * here, lib/lessons/theoryBlocks.ts) or a PRACTICE block — a `lib/items`
 * item, parsed by delegating to `parseItem` so every 0008-0017 invariant
 * (including explanation coverage) applies unchanged and is enforced in
 * exactly one place.
 *
 * A practice block IS an item envelope plus `kind: 'practice'`: its `id`,
 * `type` and `payload` are passed to `parseItem` as-is (the extra `kind` key
 * is silently ignored by `ItemEnvelopeSchema`, which is non-strict — see
 * lib/items/types.ts). This means a lesson document needs no separate
 * "practice payload" schema of its own; the item registry already owns that
 * contract.
 */

export interface LessonParseError {
  /** "<blockId>: <field>" when the underlying error names a field, else just
   * "<blockId>" — always names the block, per CNT-003's acceptance line.
   * Falls back to a positional "blocks[N]" only when the block's own `id`
   * could not be read at all (the id field itself is what's broken). */
  field: string;
  message: string;
}

/**
 * `convertedFrom` (CNT-005, docs/decisions/0022 Decision 6): an optional
 * authoring-provenance note on a practice block, set when the drafting step
 * converted a paper-only task into a scorable one — the original paper
 * instruction, so the partner can see what changed. Deliberately NOT on
 * `ItemEnvelopeSchema`/`Item` (lib/items/types.ts): that would put an
 * authoring concern inside the item-scoring contract every type module
 * shares, which is the "if accommodating it requires changing the
 * interface, the abstraction was wrong" trap docs/handoff.md names for
 * `free_text`. It is read directly off the raw block here, one layer above
 * `parseItem`, so the five item type modules and their shared envelope are
 * untouched. See docs/decisions/<CNT-005 field addition> for why capture is
 * one-shot and why no editor renders it yet.
 */
const ConvertedFromSchema = z.string().min(1);

export type LessonPracticeBlock = { id: string; kind: "practice"; item: Item; convertedFrom?: string };
export type LessonBlock = TheoryBlock | LessonPracticeBlock;
export type LessonDocument = LessonBlock[];

export type LessonParseResult =
  | { ok: true; document: LessonDocument }
  | { ok: false; errors: LessonParseError[] };

function blockLabel(raw: unknown, index: number): string {
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return `blocks[${index}]`;
}

function prefixField(label: string, field: string): string {
  return field ? `${label}: ${field}` : label;
}

function readKind(raw: unknown): "theory" | "practice" | undefined {
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) return undefined;
  const kind = (raw as { kind: unknown }).kind;
  return kind === "theory" || kind === "practice" ? kind : undefined;
}

export function parseLessonDocument(input: unknown): LessonParseResult {
  const arrayCheck = z.array(z.unknown()).safeParse(input);
  if (!arrayCheck.success) {
    return { ok: false, errors: [{ field: "", message: "lesson document must be a JSON array of blocks" }] };
  }
  const rawBlocks = arrayCheck.data;

  const errors: LessonParseError[] = [];
  const blocks: LessonBlock[] = [];
  const seenIds = new Map<string, number>();

  rawBlocks.forEach((raw, index) => {
    const label = blockLabel(raw, index);
    const kind = readKind(raw);

    if (kind === undefined) {
      errors.push({
        field: label,
        message: `block has no valid "kind" (expected "theory" or "practice"), got ${JSON.stringify(
          (raw as { kind?: unknown })?.kind,
        )}`,
      });
      return;
    }

    if (kind === "theory") {
      const result = TheoryBlockSchema.safeParse(raw);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            field: prefixField(label, formatIssuePath(issue.path)),
            message: issue.message,
          });
        }
        return;
      }
      recordId(result.data.id, index, label, seenIds, errors);
      blocks.push(result.data);
      return;
    }

    // kind === "practice": delegate entirely to the item registry.
    const result = parseItem(raw);
    if (!result.ok) {
      for (const issue of result.errors) {
        errors.push({ field: prefixField(label, issue.field), message: issue.message });
      }
      return;
    }

    const convertedFrom = parseConvertedFrom(raw, label);
    if (convertedFrom.error) {
      errors.push(convertedFrom.error);
      return;
    }

    recordId(result.item.id, index, label, seenIds, errors);
    blocks.push({
      id: result.item.id,
      kind: "practice",
      item: result.item,
      ...(convertedFrom.value !== undefined ? { convertedFrom: convertedFrom.value } : {}),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, document: blocks };
}

/**
 * The inverse of the practice branch of `parseLessonDocument`: turns a
 * parsed `LessonDocument` back into the flat authored shape
 * ({ id, kind: 'practice', type, payload } for a practice block, ItemEnvelopeSchema)
 * that `parseLessonDocument` itself accepts as input. Needed because a
 * practice block's PARSED form nests the item under `item: { id, type,
 * payload }` (so the editor can address `block.item.type` /
 * `block.item.payload` while working on it), which is not the shape
 * `parseItem` — and so `parseLessonDocument` — reads back. Any caller that
 * holds a `LessonDocument` (parsed) and needs to hand it to something that
 * will re-parse it (a save endpoint, a re-import) must serialize it back
 * through this function first; writing the parsed form directly reproduces
 * the "type: missing item type" failure this function exists to prevent.
 * Theory blocks need no conversion: `TheoryBlockSchema`'s parsed output is
 * already valid input to itself (zod fills in defaults, it does not add a
 * wrapper), so they pass through unchanged.
 */
export function serializeLessonDocument(document: LessonDocument): unknown[] {
  return document.map((block) => {
    if (block.kind !== "practice") return block;
    return {
      id: block.item.id,
      kind: "practice",
      type: block.item.type,
      payload: block.item.payload,
      ...(block.convertedFrom !== undefined ? { convertedFrom: block.convertedFrom } : {}),
    };
  });
}

/**
 * The practice-block count the future publish route feeds to
 * `publish_lesson`'s `p_item_count` parameter (migration 041, 0018 Decision
 * 4) — counted here, once, rather than reintrospected per caller. Filters on
 * `kind === "practice"`, so a theory block — including `self_check`, which
 * exists specifically to hold ungraded content (docs/decisions/0022 Decision
 * 2) — never contributes, with no self_check-specific branch needed: it is
 * simply not a practice block.
 */
export function countPracticeBlocks(document: LessonDocument): number {
  return document.filter((block) => block.kind === "practice").length;
}

/** Reads the optional `convertedFrom` marker directly off the raw block —
 * never off `parseItem`'s result, since `ItemEnvelopeSchema` is a plain
 * `z.object` that would silently drop an unrecognized key rather than carry
 * it into `Item`. Absent is valid (most blocks are not conversions); present
 * but not a non-empty string is a validation error naming the block, same
 * as every other field-level error in this file. */
function parseConvertedFrom(raw: unknown, label: string): { value?: string; error?: LessonParseError } {
  if (typeof raw !== "object" || raw === null || !("convertedFrom" in raw)) return {};
  const result = ConvertedFromSchema.safeParse((raw as { convertedFrom: unknown }).convertedFrom);
  if (!result.success) {
    return {
      error: {
        field: prefixField(label, "convertedFrom"),
        message: result.error.issues[0]?.message ?? "convertedFrom must be a non-empty string",
      },
    };
  }
  return { value: result.data };
}

function recordId(
  id: string,
  index: number,
  label: string,
  seenIds: Map<string, number>,
  errors: LessonParseError[],
): void {
  const prior = seenIds.get(id);
  if (prior !== undefined) {
    errors.push({
      field: label,
      message: `duplicate block id "${id}" (already used by blocks[${prior}]) — every block id must be unique within the lesson`,
    });
    return;
  }
  seenIds.set(id, index);
}

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number" ? `${acc}[${segment}]` : acc ? `${acc}.${String(segment)}` : String(segment),
    "",
  );
}
