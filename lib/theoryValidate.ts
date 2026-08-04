import katex from "katex";
import { TheoryBlocksSchema, type TheoryBlock } from "@/lib/courseContent";
import { segmentMath, KATEX_BASE } from "@/lib/richText";

/**
 * Shared theory validation — the ONE place that decides whether a theory-block
 * array is safe to persist. Both the offline importer (`scripts/import-course.ts`)
 * and the in-app authoring route (`PUT /api/admin/courses/stages/[id]/theory`)
 * call this so they can never drift: a block that imports must save, a block that
 * saves must import.
 *
 * Two layers, in order:
 *   1. zod (TheoryBlocksSchema) — shape + the authored-string refinements
 *      (min length, C0-control guard). See lib/courseContent.ts for why C0 is
 *      forbidden even in server-side content.
 *   2. KaTeX compile — every \(…\) / \[…\] segment is rendered with
 *      throwOnError:true, strict:true (shared KATEX_BASE), so an unbalanced
 *      brace or typo'd command fails the save rather than silently degrading in
 *      the learner's render.
 *
 * The route runs this BEFORE the SECURITY DEFINER RPC. The RPC keeps a light
 * structural check (jsonb_typeof + known discriminators) as defence-in-depth for
 * a direct call, but the real content bar lives here in TypeScript where zod and
 * katex actually run.
 */

export type TheoryValidateError = {
  /** Zero-based index into the blocks array. */
  blockIndex: number;
  /** Which authored field on the block failed ("body", "steps[2]", "term", …). */
  field: string;
  message: string;
};

export type TheoryValidateResult =
  | { ok: true; blocks: TheoryBlock[] }
  | { ok: false; errors: TheoryValidateError[] };

/**
 * The authored strings inside a block, paired with a stable field label. Kept in
 * sync by construction with `courseContent.ts`'s block union — any new block
 * type needs a case here or the compiler will refuse (exhaustive switch).
 */
export function theoryBlockFields(block: TheoryBlock): { field: string; value: string }[] {
  switch (block.type) {
    case "prose":
    case "formula":
    case "callout":
      return [{ field: "body", value: block.body }];
    case "example":
      return [
        { field: "statement", value: block.statement },
        ...block.steps.map((s, i) => ({ field: `steps[${i}]`, value: s })),
      ];
    case "list":
      return block.items.map((s, i) => ({ field: `items[${i}]`, value: s }));
    case "definition":
      return [
        { field: "term", value: block.term },
        { field: "body", value: block.body },
      ];
  }
}

/**
 * Compile every math segment in `text` with KaTeX and collect the failures.
 * A `text`-only string returns []. Errors preserve KaTeX's own message, which
 * is already position-aware ("Expected 'EOF', got '}' at position 12").
 */
function compileErrors(text: string): string[] {
  const errs: string[] = [];
  for (const seg of segmentMath(text)) {
    if (seg.type === "text") continue;
    try {
      katex.renderToString(seg.value, {
        ...KATEX_BASE,
        throwOnError: true,
        strict: true,
        displayMode: seg.type === "block",
      });
    } catch (e) {
      errs.push(`KaTeX rejected ${seg.type} math "${seg.value}" — ${(e as Error).message}`);
    }
  }
  return errs;
}

/**
 * Validate an arbitrary payload as a theory-block array. Returns the parsed
 * blocks on success, or a flat list of per-block errors on failure. Never
 * throws: a validation error is a normal outcome the caller must render.
 */
export function validateTheoryBlocks(input: unknown): TheoryValidateResult {
  const parsed = TheoryBlocksSchema.safeParse(input);
  if (!parsed.success) {
    const errors: TheoryValidateError[] = parsed.error.issues.map((issue) => {
      // Zod paths look like [0, "body"] or [2, "steps", 1]; the first element
      // is the block index, the rest describes the field.
      const path = issue.path.slice();
      const first = path.shift();
      const blockIndex =
        typeof first === "number" ? first : typeof first === "string" ? Number(first) : -1;
      const field =
        path.length === 0
          ? "(block)"
          : path
              .map((p, i) =>
                typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`,
              )
              .join("");
      return { blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1, field, message: issue.message };
    });
    return { ok: false, errors };
  }

  const errors: TheoryValidateError[] = [];
  parsed.data.forEach((block, blockIndex) => {
    for (const { field, value } of theoryBlockFields(block)) {
      for (const message of compileErrors(value)) {
        errors.push({ blockIndex, field, message });
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, blocks: parsed.data };
}
