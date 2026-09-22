import { z } from "zod";
import { authoredString } from "../authoredString";
import { InlineContentSchema } from "./inline";

/**
 * The Alliengll theory-block set (0018 Decision 2; field shapes decided here,
 * recorded in docs/decisions/0020-cnt003-lesson-blocks.md). Deliberately NOT
 * the retired Colloquiz `TheoryBlock` union (`lib/courseContent.ts`, deleted
 * by CNT-001) — that type had a `formula` block pulling KaTeX, which is
 * banned from every English route (docs/handoff.md, performance boundary).
 * No block type defined in this file imports KaTeX, directly or transitively
 * — see lib/lessons/katexFree.test.ts.
 *
 * Every block is a `z.strictObject`: an authoring typo that adds an
 * unrecognized field is a parse error, not a silently-dropped key.
 */

export const THEORY_BLOCK_TYPES = [
  "heading",
  "prose",
  "example",
  "callout",
  "list",
  "image",
  "video",
] as const;
export type TheoryBlockType = (typeof THEORY_BLOCK_TYPES)[number];

const TheoryBlockBase = {
  id: z.string().min(1),
  kind: z.literal("theory"),
};

export const HeadingBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("heading"),
  /** Two levels only: a lesson runs 10-15 minutes, not a document needing a
   * deep outline. 1 = section heading, 2 = subheading. */
  level: z.union([z.literal(1), z.literal(2)]).default(1),
  text: InlineContentSchema,
});

export const ProseBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("prose"),
  /** One paragraph. A second paragraph is a second `prose` block — this
   * keeps every block independently addressable by id, matching "short
   * theory block, then practice, repeated" (docs/handoff.md). */
  text: InlineContentSchema,
});

export const ExampleBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("example"),
  /** Optional heading over the example, e.g. "Example: past tense". Defaults
   * to a generic "Example" label at render time when absent — this schema
   * only records whether the author gave one. */
  label: authoredString().optional(),
  text: InlineContentSchema,
});

export const CALLOUT_VARIANTS = ["tip", "note", "warning"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const CalloutBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("callout"),
  variant: z.enum(CALLOUT_VARIANTS),
  text: InlineContentSchema,
});

export const ListBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("list"),
  ordered: z.boolean(),
  /** Each item is itself inline content (its own run sequence), so a list
   * item can carry emphasis/English-span exactly like a paragraph. */
  items: z.array(InlineContentSchema).min(1),
});

export const ImageBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("image"),
  /** A public URL into the "lesson-images" bucket (migration 041) — that
   * bucket is public specifically so a free-sample image loads for an
   * anonymous visitor, so storing the resolved URL (not a bare object path)
   * needs no extra resolution step at render time. Not restricted to that
   * bucket's hostname here: doing so would hard-code an environment (local
   * vs. hosted Supabase URL differ), which is exactly the kind of
   * environment-specific literal this module must not carry. */
  url: z.string().url(),
  /** Required, not optional: an image with no alt text is inaccessible, and
   * unlike a caption (learner-facing, optional) alt text has no good
   * default. */
  alt: authoredString(),
  caption: InlineContentSchema.optional(),
});

/** YouTube's video id format: 11 characters, URL-safe base64 alphabet. This
 * is deliberately narrower than "looks like a URL" — see CNT-003's
 * acceptance line: "accepts only a YouTube video id, not an arbitrary URL."
 * Pasting a full watch URL is a parse error, not a silently-broken embed. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const VideoBlockSchema = z.strictObject({
  ...TheoryBlockBase,
  type: z.literal("video"),
  youtubeId: z.string().regex(YOUTUBE_ID_RE, "must be an 11-character YouTube video id, not a URL"),
  caption: InlineContentSchema.optional(),
});

export const TheoryBlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  ProseBlockSchema,
  ExampleBlockSchema,
  CalloutBlockSchema,
  ListBlockSchema,
  ImageBlockSchema,
  VideoBlockSchema,
]);

export type TheoryBlock = z.infer<typeof TheoryBlockSchema>;
