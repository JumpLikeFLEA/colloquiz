"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookMarked,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  GripVertical,
  History,
  Info,
  Lightbulb,
  List,
  Plus,
  RotateCcw,
  Save,
  Sigma,
  Text,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { cn } from "@/lib/utils";
import { CALLOUT_TONE } from "@/lib/calloutTone";
import type { TheoryBlock } from "@/lib/courseContent";
import { THEORY_BLOCK_TYPES } from "@/lib/courseContent";
import type { AuthoringGroup } from "@/lib/courses";
import { loadKatex, renderRichTextNodes } from "@/app/components/clientMath";

// Katex module type — the same shape loadKatex resolves to. Used only for the
// local katex-loaded state; the render call goes through renderRichTextNodes.
type LoadedKatex = Awaited<ReturnType<typeof loadKatex>>;

/**
 * The set of authored strings a block exposes to the editor, addressed by the
 * same field labels the server-side theoryBlockFields uses. Kept in sync by
 * construction with the block union — a new block type needs a case here or
 * the compiler will refuse (exhaustive switch). Mirroring the server's field
 * enumeration keeps the client-rendered previews addressable by the same
 * (blockIndex, field) pairs an AuthoredField already reads.
 */
function blockAuthoredFields(block: EditableBlock): { field: string; value: string }[] {
  switch (block.type) {
    case "prose":
    case "formula":
    case "callout":
      return [{ field: "body", value: block.body }];
    case "example":
      return [
        { field: "statement", value: block.statement },
        ...block.steps.map((it, i) => ({ field: `steps[${i}]`, value: it.value })),
      ];
    case "list":
      return block.items.map((it, i) => ({ field: `items[${i}]`, value: it.value }));
    case "definition":
      return [
        { field: "term", value: block.term },
        { field: "body", value: block.body },
      ];
  }
}

type Version = {
  id: string;
  version: number;
  editedAt: string;
  editedBy: string | null;
  editorName: string | null;
};

type EditorSection = "theory" | "exercises";

// useSyncExternalStore inputs for "am I on the client?" — module scope so the
// function identities are stable across renders (React uses referential
// equality on subscribe to know when to re-subscribe).
const subscribeNoop = () => () => {};
const getSnapshotTrue = () => true;
const getSnapshotFalse = () => false;

// ── Client-only ephemeral ids ───────────────────────────────
// Every in-memory block carries a `_id` so React keys (and dnd-kit) have a
// stable per-block identity that survives reorder. Array-of-string fields
// (example.steps, list.items) get the same treatment via ItemWithId, so a
// deleted middle item can't shift another item's key onto stale focus state.
// All `_id`s are client-only: minted here, never come from the server, and
// MUST be stripped at every serialize boundary (dirty compare, PUT save,
// post-save snapshot) because the server zod schema is strictObject and would
// 400 on any leaked `_id` / `{value}` object.
type ItemWithId = { _id: string; value: string };
type EditableBlock =
  | ({ _id: string } & Extract<TheoryBlock, { type: "prose" }>)
  | ({ _id: string } & Extract<TheoryBlock, { type: "formula" }>)
  | ({ _id: string } & Extract<TheoryBlock, { type: "callout" }>)
  | ({ _id: string } & Extract<TheoryBlock, { type: "definition" }>)
  | { _id: string; type: "example"; statement: string; steps: ItemWithId[] }
  | { _id: string; type: "list"; ordered: boolean; items: ItemWithId[] };

const mintItem = (value: string): ItemWithId => ({ _id: crypto.randomUUID(), value });

// withId is the SINGLE funnel that ids the whole tree — block _id plus item
// _ids for example.steps and list.items. Every mount path (initialBlocks.map,
// addBlockAt, discard's JSON.parse.map) goes through here, so nothing enters
// state with bare string items.
const withId = (b: TheoryBlock): EditableBlock => {
  const _id = crypto.randomUUID();
  switch (b.type) {
    case "example":
      return { _id, type: "example", statement: b.statement, steps: b.steps.map(mintItem) };
    case "list":
      return { _id, type: "list", ordered: b.ordered, items: b.items.map(mintItem) };
    case "prose":
    case "formula":
    case "callout":
    case "definition":
      return { ...b, _id };
  }
};

// toWire is the inverse: strip block _id AND flatten item arrays back to bare
// string[] so the payload is exact TheoryBlock shape. Property order matches
// the server-produced JSON per variant (type first, then variant fields), so
// JSON.stringify(toWire(withId(x))) is byte-identical to the server's own
// JSON.stringify(x) — the boot-dirty invariant rides on this.
const toWire = (bs: EditableBlock[]): TheoryBlock[] =>
  bs.map((b): TheoryBlock => {
    switch (b.type) {
      case "example":
        return { type: "example", statement: b.statement, steps: b.steps.map((it) => it.value) };
      case "list":
        return { type: "list", ordered: b.ordered, items: b.items.map((it) => it.value) };
      case "prose":
        return { type: "prose", body: b.body };
      case "formula":
        return { type: "formula", body: b.body };
      case "callout":
        return { type: "callout", tone: b.tone, body: b.body };
      case "definition":
        return { type: "definition", term: b.term, body: b.body };
    }
  });

// ── Empty templates for the "add block" picker ──────────────
// Discriminated by block.type so TypeScript keeps the union honest. Kept in one
// place so the block palette can iterate the discriminators exhaustively.
function emptyBlock(type: TheoryBlock["type"]): TheoryBlock {
  switch (type) {
    case "prose":
      return { type: "prose", body: "New paragraph." };
    case "formula":
      return { type: "formula", body: "\\[ a^2 + b^2 = c^2 \\]" };
    case "callout":
      return { type: "callout", tone: "note", body: "Note." };
    case "list":
      return { type: "list", ordered: false, items: ["First item"] };
    case "definition":
      return { type: "definition", term: "Term", body: "Definition." };
    case "example":
      return { type: "example", statement: "Example statement.", steps: ["First step"] };
  }
}

// Per-block-type metadata for the editor's block-card header: label, icon and
// which of the three base accents the pill wears. Callout's accent is a
// runtime override (see BlockCard) driven by block.tone, so its entry here is
// just its "resting" accent.
type AccentKey = "brand" | "success" | "neutral";

const BLOCK_META: Record<TheoryBlock["type"], { label: string; Icon: LucideIcon; accent: AccentKey }> = {
  prose:      { label: "Prose",      Icon: Text,       accent: "brand"   },
  definition: { label: "Definition", Icon: BookMarked, accent: "brand"   },
  formula:    { label: "Formula",    Icon: Sigma,      accent: "success" },
  example:    { label: "Example",    Icon: Lightbulb,  accent: "success" },
  list:       { label: "List",       Icon: List,       accent: "neutral" },
  callout:    { label: "Callout",    Icon: Info,       accent: "brand"   },
};

const ACCENT_CLASSES: Record<AccentKey, string> = {
  brand:   "bg-brand-subtle text-brand-text border-brand-border",
  success: "bg-success-subtle text-success border-success-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function StageEditor({
  course,
  stage,
  prev,
  next,
  initialBlocks,
  initialUpdatedAt,
  groups,
}: {
  course: { slug: string; title: string };
  stage: {
    id: string;
    key: string;
    title: string;
    summary: string | null;
    index: number;
    total: number;
  };
  prev: { key: string; title: string } | null;
  next: { key: string; title: string } | null;
  initialBlocks: TheoryBlock[];
  initialUpdatedAt: string | null;
  groups: AuthoringGroup[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<EditorSection>("theory");
  // @dnd-kit mints monotonic ids (aria-describedby="DndDescribedBy-N") from a
  // module-level counter shared by DndContext and every useSortable call. In
  // SSR + hydration, the order in which those counters tick differs between
  // server and client, so the ids drift by one and React logs a hydration
  // mismatch. Gating DnD on this flag means the server (and the first client
  // render, which must match it) never touches those hooks — the DnD tree
  // mounts only in a subsequent client render, where SSR isn't involved.
  // useSyncExternalStore is the sanctioned "is this the client?" primitive:
  // getServerSnapshot returns false on the server, getSnapshot returns true on
  // the client, and subscribe is a no-op since the value never changes after
  // hydration.
  const dndReady = useSyncExternalStore(
    subscribeNoop,
    getSnapshotTrue,
    getSnapshotFalse,
  );
  // Mint one id per initial block ONCE, then use the SAME id'd array as both
  // the initial state and the initial savedSnapshot source, so the boot-time
  // dirty compare (which stringifies toWire(blocks)) is byte-identical to the
  // stored snapshot — otherwise the editor would boot permanently dirty.
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => initialBlocks.map(withId));
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Loaded katex module. Dynamic-imported once on editor mount (see effect
  // below); every field's preview shares this one module. Null while the
  // ~80 KB katex chunk is in flight — during that brief window AuthoredField
  // shows raw source rather than a blank preview.
  const [katex, setKatex] = useState<LoadedKatex | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Confirmation dialog state. A pending href means "user tried to leave with
  // unsaved changes; the AlertDialog is open"; confirming pushes to that href.
  // Discard/revert use their own boolean/id so their AlertDialogs stay independent.
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingRevertId, setPendingRevertId] = useState<string | null>(null);

  // Dirty = local blocks differ from the last-known-saved snapshot. Using a
  // JSON compare (rather than a boolean flag flipped in every setter) keeps
  // "edit, then edit back" from spuriously blocking navigation. The snapshot
  // is kept in useState (not useRef) because React forbids reading a ref's
  // .current during render — see react-hooks/refs.
  // Route the initial snapshot through the SAME withId→toWire round trip the
  // dirty compare uses, so byte-equality is structural (not "key-order luck").
  // Any future field reorder in EditableBlock or toWire updates both sides in
  // lockstep; without this, adding a field to withId that toWire didn't strip
  // would silently boot every existing course dirty.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(toWire(initialBlocks.map(withId))),
  );
  const dirty = JSON.stringify(toWire(blocks)) !== savedSnapshot;

  // Unsaved-changes guard: matches the confirm() the Groups builder uses. The
  // beforeunload event only fires on real page unloads, not soft navigations —
  // that is intentional; the Link back-arrow warning is handled in-app.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Load katex once per editor mount. The dynamic import inside loadKatex is
  // cached at module scope, so revisiting this route (or opening a second
  // editor in the same session) resolves synchronously and setKatex fires
  // immediately. No debounce, no fetch, no AbortController: the render is now
  // local and synchronous.
  useEffect(() => {
    let alive = true;
    void loadKatex().then((mod) => {
      if (alive) setKatex(mod);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Per-(blockIndex, field) rendered nodes, computed locally from blocks +
  // katex. Field enumeration mirrors the server's theoryBlockFields via
  // blockAuthoredFields so every field that had a server-rendered preview
  // still gets one, addressed by the same (blockIndex, field) key.
  //
  // While katex is null (chunk in flight) each value is the raw string wrapped
  // as a plain text node — the preview strip shows the LaTeX source rather
  // than blanking. Once katex sets, this memo re-runs and every field flips
  // to rendered form. renderRichTextNodes is synchronous with katex in hand.
  const renderedByBlock = useMemo(() => {
    const map = new Map<number, Map<string, ReactNode>>();
    blocks.forEach((block, blockIndex) => {
      const inner = new Map<string, ReactNode>();
      for (const { field, value } of blockAuthoredFields(block)) {
        inner.set(field, katex ? renderRichTextNodes(value, katex) : value);
      }
      map.set(blockIndex, inner);
    });
    return map;
  }, [blocks, katex]);

  const setBlockAt = useCallback((i: number, next: EditableBlock) => {
    // Callers spread `{ ...block, field: v }` which preserves `_id` at runtime
    // and (now that block is typed as EditableBlock end-to-end) at the type
    // level too. Re-attach here defensively in case a future caller builds a
    // block without spreading.
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...next, _id: b._id } : b)));
  }, []);

  const removeBlockAt = useCallback((i: number) => {
    setBlocks((prev) => prev.filter((_, j) => j !== i));
  }, []);

  const moveBlock = useCallback((i: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      const [x] = copy.splice(i, 1);
      copy.splice(j, 0, x);
      return copy;
    });
  }, []);

  // Pointer sensor only — no KeyboardSensor (chevrons cover keyboard reorder).
  // activationConstraint.distance means a click on the handle (mousedown +
  // mouseup with no movement) is NOT interpreted as a drag, so accidental
  // taps do not fire onDragEnd.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      setBlocks((prev) => {
        const from = prev.findIndex((b) => b._id === active.id);
        const to = prev.findIndex((b) => b._id === over.id);
        if (from === -1 || to === -1 || from === to) return prev;
        const copy = prev.slice();
        const [x] = copy.splice(from, 1);
        copy.splice(to, 0, x);
        return copy;
      });
    },
    [],
  );

  // Index-aware insert: the inline "+" zones live between blocks and pass their
  // own index (0 = before first block, N = after last block, i+1 = after
  // block i). Clamping keeps the call safe if the array shrank between hover
  // and click (e.g. a concurrent delete).
  const addBlockAt = useCallback((index: number, type: TheoryBlock["type"]) => {
    setBlocks((prev) => {
      const copy = prev.slice();
      const clamped = Math.max(0, Math.min(index, copy.length));
      copy.splice(clamped, 0, withId(emptyBlock(type)));
      return copy;
    });
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/courses/stages/${stage.id}/theory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks: toWire(blocks), baseUpdatedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSaveError(data.message ?? data.error ?? "Save failed.");
        return;
      }
      setSavedSnapshot(JSON.stringify(toWire(blocks)));
      setBaseUpdatedAt(data.updatedAt as string);
      toast.success("Saved.");
      // Server surfaces (per-stage "Edited" pill on the parent page) update
      // through router.refresh; local state stays authoritative here.
      router.refresh();
    } catch {
      setSaveError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setBlocks((JSON.parse(savedSnapshot) as TheoryBlock[]).map(withId));
    setSaveError(null);
    setShowDiscardConfirm(false);
  }

  async function revertTo(versionId: string) {
    setPendingRevertId(null);
    try {
      const res = await fetch(`/api/admin/courses/stages/${stage.id}/theory/history`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId, baseUpdatedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? data.error ?? "Revert failed.");
        return;
      }
      toast.success("Restored.");
      // The RPC wrote fresh blocks; we no longer have them locally without a
      // reload. router.refresh() re-runs the server component, which re-fetches
      // via get_stage_authoring and re-mounts this editor with fresh initial*.
      router.refresh();
    } catch {
      toast.error("Network error.");
    }
  }

  // Intercepts a Link click when there are unsaved changes: prevents the soft
  // navigation, opens the leave-confirmation AlertDialog, and remembers where
  // the user was trying to go so confirming can push to it.
  function handleLeaveClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty) return;
    e.preventDefault();
    setPendingLeaveHref(href);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href={`/admin/courses/${course.slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => handleLeaveClick(e, `/admin/courses/${course.slug}`)}
        >
          <ArrowLeft size={15} /> {course.title}
        </Link>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stage {stage.index} of {stage.total} · Editor
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">{stage.title}</h1>
          {stage.summary && <p className="text-muted-foreground mt-1">{stage.summary}</p>}
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
        <SectionTab
          active={section === "theory"}
          onClick={() => setSection("theory")}
          Icon={BookOpen}
          label="Theory"
        />
        <SectionTab
          active={section === "exercises"}
          onClick={() => setSection("exercises")}
          Icon={ClipboardCheck}
          label={`Exercises (${groups.length})`}
        />
      </div>

      {section === "theory" ? (
        <div className="space-y-6">
          {blocks.length === 0 ? (
            <EmptyStagePicker onInsert={addBlockAt} />
          ) : (() => {
            // InsertZones are siblings of BlockCards in the flex-col, NOT
            // inside sortable nodes — SortableContext.items stays blocks-only
            // so zones can't be drop targets and don't confuse dnd.
            const list = (
              <div className="flex flex-col gap-1">
                <InsertZone index={0} onInsert={addBlockAt} />
                {blocks.map((b, i) => (
                  <Fragment key={b._id}>
                    <BlockCard
                      index={i}
                      total={blocks.length}
                      block={b}
                      sortable={dndReady}
                      rendered={renderedByBlock.get(i) ?? new Map()}
                      onChange={(next) => setBlockAt(i, next)}
                      onRemove={() => removeBlockAt(i)}
                      onMove={(dir) => moveBlock(i, dir)}
                    />
                    <InsertZone
                      index={i + 1}
                      onInsert={addBlockAt}
                      openUp={i === blocks.length - 1}
                    />
                  </Fragment>
                ))}
              </div>
            );
            return dndReady ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={blocks.map((b) => b._id)}
                  strategy={verticalListSortingStrategy}
                >
                  {list}
                </SortableContext>
              </DndContext>
            ) : (
              list
            );
          })()}

          <div className="sticky bottom-4 z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="text-sm text-muted-foreground">
                {dirty ? (
                  <span>Unsaved changes.</span>
                ) : (
                  <span>All changes saved.</span>
                )}
                {saveError && (
                  <span className="ml-2 text-destructive-text">· {saveError}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <History size={15} /> Version history
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  disabled={!dirty || saving}
                  className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <Undo2 size={15} /> Discard
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                  className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  <Save size={15} /> {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          {historyOpen && (
            <VersionHistoryPanel stageId={stage.id} onRevert={setPendingRevertId} />
          )}
        </div>
      ) : (
        <ExercisesView groups={groups} />
      )}

      <div className="flex items-center justify-between gap-3 pt-6 border-t border-border">
        {prev ? (
          <Link
            href={`/admin/courses/${course.slug}/${prev.key}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) =>
              handleLeaveClick(e, `/admin/courses/${course.slug}/${prev.key}`)
            }
          >
            <ArrowLeft size={15} /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/admin/courses/${course.slug}/${next.key}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) =>
              handleLeaveClick(e, `/admin/courses/${course.slug}/${next.key}`)
            }
          >
            {next.title} <ArrowRight size={15} />
          </Link>
        ) : (
          <span />
        )}
      </div>

      <AlertDialog
        open={pendingLeaveHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLeaveHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved edits to this stage will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLeaveHref) router.push(pendingLeaveHref);
                setPendingLeaveHref(null);
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive-hover"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The blocks will return to the last saved version. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={discard}
              className="rounded-xl bg-destructive text-white hover:bg-destructive-hover"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingRevertId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevertId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this earlier version?</AlertDialogTitle>
            <AlertDialogDescription>
              The stage will be saved with the older blocks and become the current
              version. Your current unsaved edits will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRevertId) void revertTo(pendingRevertId);
              }}
              className="rounded-xl bg-brand text-white hover:bg-brand-hover"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Section switcher tab ────────────────────────────────────
function SectionTab({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof BookOpen;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-subtle text-brand-text" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={15} /> {label}
    </button>
  );
}

// ── Inline insert affordance ────────────────────────────────
// A thin, near-invisible zone in every gap between blocks (and before/after
// the list). Hover/focus reveals a horizontal rule with a "+" button; clicking
// opens a small popover listing the six block types. Selecting a type inserts
// AT this zone's index and closes the popover.
//
// The popover is a plain absolutely-positioned div (no new dependency);
// dismissal covers select, Escape, and outside-click via a mousedown listener
// that's attached only while `open` and cleaned up on close/unmount.
function InsertZone({
  index,
  onInsert,
  openUp = false,
}: {
  index: number;
  onInsert: (index: number, type: TheoryBlock["type"]) => void;
  // Set on the trailing zone (index === blocks.length) so its popover opens
  // upward instead of downward — a downward menu on the last gap grows the
  // <main> scroller past the visible bottom, toggling the vertical scrollbar
  // and jittering layout. Purely a class swap; no space measurement.
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="group relative h-4 flex items-center justify-center"
    >
      {/* Resting: a very faint line, revealed a bit on hover of the zone */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert block here"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative z-10 cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded-full border border-border bg-card text-muted-foreground transition-opacity",
          "opacity-35 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
          "hover:text-brand hover:border-brand",
          open && "opacity-100 text-brand border-brand",
        )}
      >
        <Plus size={12} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute left-1/2 z-20 -translate-x-1/2 min-w-44 rounded-lg border border-border bg-card p-1 shadow-md",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {THEORY_BLOCK_TYPES.map((t) => {
            const meta = BLOCK_META[t];
            return (
              <button
                key={t}
                type="button"
                role="menuitem"
                onClick={() => {
                  onInsert(index, t);
                  setOpen(false);
                }}
                className="cursor-pointer w-full inline-flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent"
              >
                <meta.Icon className="w-3.5 h-3.5 text-muted-foreground" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Empty-stage affordance: a dashed panel with an always-visible "+" that opens
// the same type menu. A resting-invisible InsertZone on an empty page would be
// a dead surface; this makes the "add your first block" action obvious.
function EmptyStagePicker({
  onInsert,
}: {
  onInsert: (index: number, type: TheoryBlock["type"]) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground rounded-2xl border border-dashed border-border">
      <p className="text-sm">No blocks yet — add one to get started.</p>
      <InsertZoneMenu index={0} onInsert={onInsert} alwaysVisible />
    </div>
  );
}

// The "+" + menu extracted so EmptyStagePicker can render it always-visible
// (no hover reveal, no relative-positioned line) without duplicating the menu
// markup. InsertZone above uses its own inline version for the compact gap
// affordance; this one is the standalone control.
function InsertZoneMenu({
  index,
  onInsert,
  alwaysVisible,
}: {
  index: number;
  onInsert: (index: number, type: TheoryBlock["type"]) => void;
  alwaysVisible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert block"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors",
          !alwaysVisible && "opacity-0 group-hover:opacity-100",
        )}
      >
        <Plus size={13} /> Add block
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 min-w-44 rounded-lg border border-border bg-card p-1 shadow-md"
        >
          {THEORY_BLOCK_TYPES.map((t) => {
            const meta = BLOCK_META[t];
            return (
              <button
                key={t}
                type="button"
                role="menuitem"
                onClick={() => {
                  onInsert(index, t);
                  setOpen(false);
                }}
                className="cursor-pointer w-full inline-flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent"
              >
                <meta.Icon className="w-3.5 h-3.5 text-muted-foreground" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Block card ──────────────────────────────────────────────
// Wraps every block with the shared chrome: type label, move/delete, and the
// per-block error banner. The type-specific fields render inside.
function BlockCard(props: {
  index: number;
  total: number;
  block: EditableBlock;
  sortable: boolean;
  rendered: Map<string, ReactNode>;
  onChange: (next: EditableBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  // Two rendering paths, chosen at the component boundary so the Rules of
  // Hooks are honored: pre-mount (server + first client render) we take the
  // Static path which calls no dnd hooks at all — no DndContext exists yet,
  // so no aria-describedby ids are minted and hydration matches. Post-mount
  // we take the Sortable path which calls useSortable exactly once.
  return props.sortable ? <SortableBlockCard {...props} /> : <StaticBlockCard {...props} />;
}

function SortableBlockCard(props: React.ComponentProps<typeof BlockCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.block._id });
  return (
    <BlockCardBody
      {...props}
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      isDragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function StaticBlockCard(props: React.ComponentProps<typeof BlockCard>) {
  return <BlockCardBody {...props} />;
}

// Shared body — same DOM in both paths so the SSR HTML matches the first
// client render byte-for-byte. Only the grip handle carries drag listeners
// (post-mount), so textareas and buttons stay fully interactive.
function BlockCardBody({
  index,
  total,
  block,
  rendered,
  onChange,
  onRemove,
  onMove,
  innerRef,
  style,
  isDragging,
  handleProps,
}: React.ComponentProps<typeof BlockCard> & {
  innerRef?: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  isDragging?: boolean;
  handleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const meta = BLOCK_META[block.type];
  // Callout's accent tracks its tone, not its type: a "warning" callout wears
  // the amber wash while a "note" callout keeps the resting brand accent. The
  // warning classes are literal here rather than a fourth AccentKey because
  // no other block type opts in to it.
  const accentClass =
    block.type === "callout"
      ? block.tone === "warning"
        ? "bg-warning-subtle text-warning border-warning-border"
        : ACCENT_CLASSES.brand
      : ACCENT_CLASSES[meta.accent];

  return (
    <div
      ref={innerRef}
      style={style}
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        isDragging && "opacity-60 z-10",
      )}
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...handleProps}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            className="cursor-grab active:cursor-grabbing text-muted-foreground touch-none p-1 -m-1 rounded hover:text-foreground"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
              accentClass,
            )}
          >
            <meta.Icon className="w-3.5 h-3.5" />
            {meta.label}
          </span>
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
            Icon={ChevronUp}
          />
          <IconBtn
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Move down"
            Icon={ChevronDown}
          />
          <IconBtn onClick={onRemove} title="Delete block" Icon={Trash2} tone="destructive" />
        </div>
      </div>

      <div className="pt-3">
        <BlockFields block={block} rendered={rendered} onChange={onChange} />
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  title,
  Icon,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  Icon: typeof ChevronUp;
  tone?: "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "cursor-pointer disabled:cursor-not-allowed p-1.5 rounded-lg transition-colors",
        tone === "destructive"
          ? "text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        "disabled:opacity-30 disabled:hover:bg-transparent",
      )}
    >
      <Icon size={14} />
    </button>
  );
}

// ── Field renderer per block type ───────────────────────────
function BlockFields({
  block,
  rendered,
  onChange,
}: {
  block: EditableBlock;
  rendered: Map<string, ReactNode>;
  onChange: (next: EditableBlock) => void;
}) {
  switch (block.type) {
    case "prose":
      return (
        <AuthoredField
          label="Body"
          field="body"
          value={block.body}
          rendered={rendered}
          onChange={(v) => onChange({ ...block, body: v })}
          multiline
        />
      );

    case "formula":
      // Formula opts out of swap-to-edit: raw LaTeX source and rendered math
      // look nothing alike, and authors iterate on the source, so keep both
      // visible at all times (textarea + preview strip).
      return (
        <AuthoredField
          label="Body (LaTeX; wrap in \\[…\\])"
          field="body"
          value={block.body}
          rendered={rendered}
          onChange={(v) => onChange({ ...block, body: v })}
          swapMode={false}
        />
      );

    case "callout":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tone
            </label>
            <Select
              value={block.tone}
              onValueChange={(v) => onChange({ ...block, tone: v as "note" | "warning" })}
            >
              <SelectTrigger className="w-40 rounded-lg border-border bg-card text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AuthoredField
            label="Body"
            field="body"
            value={block.body}
            rendered={rendered}
            onChange={(v) => onChange({ ...block, body: v })}
            previewClassName={CALLOUT_TONE[block.tone].className}
            multiline
          />
        </div>
      );

    case "definition":
      return (
        <div className="space-y-3">
          <AuthoredField
            label="Term"
            field="term"
            value={block.term}
            rendered={rendered}
            onChange={(v) => onChange({ ...block, term: v })}
          />
          <AuthoredField
            label="Body"
            field="body"
            value={block.body}
            rendered={rendered}
            onChange={(v) => onChange({ ...block, body: v })}
          />
        </div>
      );

    case "list":
      return (
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={block.ordered}
              onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
              className="cursor-pointer"
            />
            Ordered (numbered) list
          </label>
          <ArrayField
            label="Items"
            fieldPrefix="items"
            values={block.items}
            rendered={rendered}
            onChange={(items) => onChange({ ...block, items })}
            addLabel="Add item"
            minLength={1}
          />
        </div>
      );

    case "example":
      return (
        <div className="space-y-3">
          <AuthoredField
            label="Statement"
            field="statement"
            value={block.statement}
            rendered={rendered}
            onChange={(v) => onChange({ ...block, statement: v })}
            multiline
          />
          <ArrayField
            label="Steps"
            fieldPrefix="steps"
            values={block.steps}
            rendered={rendered}
            onChange={(steps) => onChange({ ...block, steps })}
            addLabel="Add step"
            minLength={1}
          />
        </div>
      );

    default: {
      const _never: never = block;
      void _never;
      return null;
    }
  }
}

// ── Single authored-string field with rendered preview ──────
// Two rendering modes:
//   swapMode = true  (default; prose/callout/definition/list-item/example)
//     At rest: a clickable rendered view — the ReactNode from renderedByBlock
//     shown in a box the same shape as the textarea. Clicking (or tabbing +
//     Enter/Space) swaps to a textarea for editing; blur (or Escape / Enter)
//     swaps back. One box, not two — the rest state IS the preview.
//   swapMode = false (formula only)
//     Textarea AND preview always visible. Raw LaTeX and rendered math don't
//     resemble each other and authors iterate on the source, so hiding the
//     source behind a click would fight the workflow.
// Live-error boxes were removed with the server-preview fetch: errors now
// surface only at SAVE time via the sticky footer's saveError.
function AuthoredField({
  label,
  field,
  value,
  rendered,
  onChange,
  previewClassName,
  swapMode = true,
  multiline = false,
}: {
  label: string;
  field: string;
  value: string;
  rendered: Map<string, ReactNode>;
  onChange: (v: string) => void;
  // Optional colour tail (bg + border colour + text) for the preview strip.
  // Geometry (px, py, radius, text size, border width, overflow) stays fixed
  // so every field's preview keeps a consistent shape; only the tone changes.
  previewClassName?: string;
  swapMode?: boolean;
  // When true (prose/callout body, example statement) Enter inserts a newline
  // and the textarea grows with content. When false (default; single-line
  // fields like term, list items, example steps) Enter commits (blurs) and
  // the textarea stays rows={1} + resize-none.
  multiline?: boolean;
}) {
  const node = rendered.get(field);
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea in the SAME tick it mounts (useLayoutEffect, not
  // useEffect) so there's no paint of an unfocused control. Cursor at end so
  // the click-to-edit continues where the value already reads.
  useLayoutEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  // Formula: unchanged legacy layout — textarea above, preview strip below.
  if (!swapMode) {
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">{label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(6, Math.max(2, value.split("\n").length))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          spellCheck={false}
        />
        {node !== undefined ? (
          <div
            className={`px-3 py-2 rounded-lg text-sm overflow-x-auto border ${previewClassName ?? "bg-muted/40 border-border text-foreground"}`}
          >
            <span>{node}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Swap mode. Rest and editing share the SAME box geometry (px-3 py-2,
  // rounded-lg, border, text-sm, min-h-[3.5rem] ≈ a 2-row textarea's height)
  // so the swap never resizes the block.
  const boxShape = "w-full px-3 py-2 rounded-lg border text-sm min-h-[3.5rem]";
  const restTone = previewClassName ?? "bg-background border-border text-foreground";

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {editing ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            // Escape always blurs (swap back). Enter blurs only for single-
            // line fields; in multiline mode Enter falls through to the
            // textarea default (inserts \n).
            if (e.key === "Escape") {
              e.preventDefault();
              taRef.current?.blur();
            } else if (!multiline && e.key === "Enter") {
              e.preventDefault();
              taRef.current?.blur();
            }
          }}
          // Single-line: rows={1} so the textarea's intrinsic height isn't
          // larger than the shared min-h from boxShape — otherwise Chrome's
          // default rows={2} makes the textarea a few px taller than the
          // rest-view and swap nudges the block. Multiline: grow with content
          // (2..6 rows), and drop resize-none so the user can drag taller.
          rows={multiline ? Math.min(6, Math.max(2, value.split("\n").length)) : 1}
          className={`${boxShape} block ${multiline ? "" : "resize-none"} bg-background border-border font-mono focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring`}
          spellCheck={false}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onFocus={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditing(true);
            }
          }}
          className={`${boxShape} ${restTone} cursor-text overflow-x-auto hover:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors`}
        >
          {value.trim() === "" ? (
            <span className="text-muted-foreground/60 italic">
              Empty — click to edit
            </span>
          ) : node !== undefined ? (
            <span>{node}</span>
          ) : (
            <span>{value}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Array-of-strings field (list.items, example.steps) ──────
// Items carry a client-only `_id` so React keys are stable across edits and
// mid-array deletes — a deleted middle item can't shift another item's key
// onto stale focus state. The EDIT path preserves the item's existing `_id`
// (never re-mints it, or every keystroke would look like a fresh item to
// React and destroy stable-key semantics). The wire flatten happens in
// toWire; ids never reach the server.
function ArrayField({
  label,
  fieldPrefix,
  values,
  rendered,
  onChange,
  addLabel,
  minLength,
}: {
  label: string;
  fieldPrefix: "items" | "steps";
  values: ItemWithId[];
  rendered: Map<string, ReactNode>;
  onChange: (next: ItemWithId[]) => void;
  addLabel: string;
  minLength: number;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {values.map((item, i) => (
        <div key={item._id} className="flex items-start gap-2">
          <div className="flex-1">
            <AuthoredField
              label={`${fieldPrefix}[${i}]`}
              field={`${fieldPrefix}[${i}]`}
              value={item.value}
              rendered={rendered}
              onChange={(nv) =>
                onChange(values.map((x, j) => (j === i ? { ...x, value: nv } : x)))
              }
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            disabled={values.length <= minLength}
            title="Remove item"
            aria-label="Remove item"
            className="mt-6 cursor-pointer disabled:cursor-not-allowed p-1.5 rounded-lg text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, mintItem("")])}
        className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground hover:bg-accent transition-colors"
      >
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  );
}

// ── Exercises (read-only) ───────────────────────────────────
function ExercisesView({ groups }: { groups: AuthoringGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border">
        <p className="text-sm">This stage has no exercises yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Exercises are read-only in the editor for now. To change wording, use the admin questions
        moderation surface or re-run the importer.
      </p>
      {groups.map((g, gi) => (
        <div key={g.variant_group} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Variant group {gi + 1} · {g.siblings.length} variant{g.siblings.length === 1 ? "" : "s"}
          </p>
          {g.siblings.map((v) => (
            <div key={v.id} className="rounded-xl border border-border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Variant {v.variant_ordinal}</span>
                <span>·</span>
                <span>{v.difficulty}</span>
                <span>·</span>
                <span>{v.status}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{v.question}</p>
              <ol className="list-[lower-alpha] pl-5 space-y-1 text-sm marker:text-muted-foreground">
                {v.options.map((opt, i) => (
                  <li
                    key={i}
                    className={
                      opt === v.correct_answer
                        ? "text-success font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {opt}
                  </li>
                ))}
              </ol>
              {v.explanation && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Explanation: </span>
                  {v.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Version history ─────────────────────────────────────────
function VersionHistoryPanel({
  stageId,
  onRevert,
}: {
  stageId: string;
  onRevert: (versionId: string) => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The version pending deletion — its row's trash icon opens the AlertDialog.
  // Kept local because the parent has no reason to know about pruning history.
  const [pendingDelete, setPendingDelete] = useState<Version | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/admin/courses/stages/${stageId}/theory/history`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setError((d?.error as string) ?? "Could not load history.");
          return;
        }
        setVersions(d.versions as Version[]);
        setError(null);
      })
      .catch(() => setError("Network error."));
  }, [stageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteVersion(id: string) {
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/admin/courses/stages/${stageId}/theory/history`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? data.error ?? "Could not delete version.");
        return;
      }
      toast.success("Version deleted.");
      await load();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Version history</h2>
      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}
      {versions === null && !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : versions && versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No previous versions — this stage has been saved zero or one times.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {(versions ?? []).map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  Version {v.version}
                  {v.editorName && (
                    <span className="text-muted-foreground"> · by {v.editorName}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.editedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onRevert(v.id)}
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <RotateCcw size={14} /> Restore
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(v)}
                  title="Delete version"
                  aria-label={`Delete version ${v.version}`}
                  className="cursor-pointer p-1.5 rounded-lg text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete version {pendingDelete?.version} from history?</AlertDialogTitle>
            <AlertDialogDescription>
              The snapshot will be permanently removed from the version log. The stage&apos;s
              current blocks are untouched, and you can still restore any other version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void deleteVersion(pendingDelete.id);
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive-hover"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
