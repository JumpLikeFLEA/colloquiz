# 0033 — AUTH-002: lesson block editor decisions

Context: AUTH-002 ("Lesson editor: block list and theory-block forms") asks
for add/edit/delete/reorder of lesson blocks, forms for all nine theory
block types, inline emphasis/English-span/mark_a/mark_b applied without
typing markup, save-time validation via `parseLessonDocument` (CNT-003) with
per-field errors, a stale-save guard, and restorable version history. Three
points were left for the implementer to decide; recorded here per the
working agreement rather than only in the PR.

## Decision 1 — block id generation

New blocks get `crypto.randomUUID()` client-side. `theoryBlocks.ts` only
requires `id: z.string().min(1)` and `parseLessonDocument` only requires
uniqueness within the document (`recordId`) — no format is mandated — so any
collision-safe generator satisfies the schema. `crypto.randomUUID()` is
available in the browser and needs no counter state to thread through the
block-list component, unlike the quiz builder's `draft_${n}` counter (which
works there only because those ids are never persisted).

**Revisit if:** a block id ever needs to be human-readable or stable across
re-import (it currently isn't — CNT-003 doesn't require it).

## Decision 2 — restoring a version

There is no `restore_lesson_version` RPC. Restoring version V means: fetch
V's `document`, then call `save_lesson_version(lessonId, V.document,
currentLatestVersionId)` through the normal save route — the same RPC every
other save uses, with the CURRENT latest id as the base version (not V's own
id). This creates a new `lesson_versions` row with V's content, which is
literally "restored as a new draft" per the acceptance line, and reuses the
same stale-check path a normal save gets: if someone else saved between the
page load and the restore click, the restore itself surfaces "changed
elsewhere, reload" instead of silently overwriting.

The alternative — a dedicated restore RPC that doesn't round-trip the
document through the client — was rejected: it would duplicate
`save_lesson_version`'s locking and staleness logic for no behavioural
difference, and 041's `lesson_versions` table is already append-only by
design (no UPDATE/DELETE grant), so there is nothing a restore RPC could do
that re-inserting can't.

**Revisit if:** version documents grow large enough that round-tripping
through the client becomes a real cost — unlikely at "10-15 minute lesson"
scale (docs/handoff.md).

## Decision 3 — the inline-markup control

`InlineEditor.tsx` represents an `InlineContent` value (lib/lessons/inline.ts)
as a flat list of runs, each its own text input plus mark-toggle buttons
(Emphasis / English / Highlight A / Highlight B, A and B mutually exclusive
per the schema's own refinement). A mixed-mark sentence is built by manually
splitting it into multiple runs — there is no click-and-drag text-range
selection.

This is the "minimal in-house control over the structural markup" the issue
names as the default assumption. A true range-selecting rich-text control
(the kind a contenteditable + selection-API implementation or a library like
Slate/TipTap would give) was not built: it is a materially larger
component, and the issue explicitly asks to stop and ask before adding a
rich-text npm dependency — building an equivalent one in-house carries the
same complexity for a course whose theory blocks run one short paragraph at
a time (docs/handoff.md: "short theory block, then a couple of exercises").

**Revisit if:** the partner (the actual author, docs/handoff.md
"Authoring") finds splitting sentences into runs to select a mid-sentence
mark genuinely obstructive in practice — that's a usability finding this
decision can't anticipate from the schema alone, and the fix is a real
range-selection control, which then IS the "ask before adding a dependency"
conversation the issue anticipated.

## Scope boundary carried over from the issue list

Practice blocks (the five `lib/items` types) appear in the block list —
reorderable and deletable, since the list is one ordered array of theory and
practice blocks together — but have no edit form here; AUTH-003 owns
practice-block forms. The image block's `url` field is a plain pasted URL;
AUTH-004 owns upload. Publish is not in this editor; AUTH-005 owns
preview/publish. This is drawn directly from the sibling AUTH-003/004/005
card titles, not an independent call.
