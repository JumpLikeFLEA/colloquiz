"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

// ── Types the preview endpoint returns ──────────────────────
type PreviewField = { field: string; html: string };
type PreviewBlock = { blockIndex: number; type: string; fields: PreviewField[] };
type PreviewError = { blockIndex: number; field: string; message: string };
type PreviewOk = { ok: true; rendered: PreviewBlock[] };
type PreviewFail = { ok: false; errors: PreviewError[] };
type PreviewResponse = PreviewOk | PreviewFail;

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

// ── Client-only ephemeral id ────────────────────────────────
// Every in-memory block carries a `_id` so React keys (and, next step, dnd-kit)
// have a stable per-block identity that survives reorder. `_id` is client-only:
// it is minted here, never comes from the server, and MUST be stripped at every
// serialize boundary (dirty compare, preview POST, PUT save, post-save
// snapshot) because the server zod schema is strictObject and would 400 on it.
type EditableBlock = TheoryBlock & { _id: string };
const withId = (b: TheoryBlock): EditableBlock => ({ ...b, _id: crypto.randomUUID() });
const toWire = (bs: EditableBlock[]): TheoryBlock[] =>
  bs.map(({ _id: _drop, ...rest }) => rest as TheoryBlock);

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
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
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
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(initialBlocks),
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

  // Debounced preview: fetch after 300ms of no changes. Cancelled by the next
  // edit via the AbortController, so a burst of typing never queues N requests.
  useEffect(() => {
    const timer = setTimeout(() => {
      const ctrl = new AbortController();
      void (async () => {
        try {
          const res = await fetch("/api/admin/courses/theory/preview", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ blocks: toWire(blocks) }),
            signal: ctrl.signal,
          });
          const data = (await res.json().catch(() => null)) as PreviewResponse | null;
          if (data) setPreview(data);
        } catch {
          // aborted or network error — leave the previous preview visible
        }
      })();
      return () => ctrl.abort();
    }, 300);
    return () => clearTimeout(timer);
  }, [blocks]);

  // Per-(blockIndex, field) helpers so the block editors can look up their own
  // rendered HTML and error without walking the response every render.
  const renderedByBlock = useMemo(() => {
    const map = new Map<number, Map<string, string>>();
    if (preview?.ok) {
      for (const b of preview.rendered) {
        const inner = new Map<string, string>();
        for (const f of b.fields) inner.set(f.field, f.html);
        map.set(b.blockIndex, inner);
      }
    }
    return map;
  }, [preview]);

  const errorsByBlock = useMemo(() => {
    const map = new Map<number, PreviewError[]>();
    if (preview && !preview.ok) {
      for (const err of preview.errors) {
        const list = map.get(err.blockIndex) ?? [];
        list.push(err);
        map.set(err.blockIndex, list);
      }
    }
    return map;
  }, [preview]);

  const hasErrors = preview !== null && !preview.ok;

  const setBlockAt = useCallback((i: number, next: TheoryBlock) => {
    // BlockCard/BlockFields see block as TheoryBlock (no _id in the type), so
    // their `{ ...block, field: v }` spreads carry _id at runtime but drop it
    // from the type. Re-attach the existing block's _id here so the state
    // stays EditableBlock[] and the id is preserved even if a future onChange
    // caller builds a block without spreading. Runtime is a no-op today.
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
                      errors={errorsByBlock.get(i) ?? []}
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
                  hasErrors ? (
                    <span className="text-destructive-text">Fix errors before saving.</span>
                  ) : (
                    <span>Unsaved changes.</span>
                  )
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
                  disabled={!dirty || saving || hasErrors}
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
  rendered: Map<string, string>;
  errors: PreviewError[];
  onChange: (next: TheoryBlock) => void;
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
  errors,
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
  const errByField = new Map<string, string[]>();
  for (const e of errors) {
    const list = errByField.get(e.field) ?? [];
    list.push(e.message);
    errByField.set(e.field, list);
  }

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
        <BlockFields
          block={block}
          rendered={rendered}
          errByField={errByField}
          onChange={onChange}
        />
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
  errByField,
  onChange,
}: {
  block: TheoryBlock;
  rendered: Map<string, string>;
  errByField: Map<string, string[]>;
  onChange: (next: TheoryBlock) => void;
}) {
  switch (block.type) {
    case "prose":
    case "formula":
      return (
        <AuthoredField
          label={block.type === "formula" ? "Body (LaTeX; wrap in \\[…\\])" : "Body"}
          field="body"
          value={block.body}
          rendered={rendered}
          errByField={errByField}
          onChange={(v) => onChange({ ...block, body: v })}
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
            errByField={errByField}
            onChange={(v) => onChange({ ...block, body: v })}
            previewClassName={CALLOUT_TONE[block.tone].className}
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
            errByField={errByField}
            onChange={(v) => onChange({ ...block, term: v })}
          />
          <AuthoredField
            label="Body"
            field="body"
            value={block.body}
            rendered={rendered}
            errByField={errByField}
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
            errByField={errByField}
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
            errByField={errByField}
            onChange={(v) => onChange({ ...block, statement: v })}
          />
          <ArrayField
            label="Steps"
            fieldPrefix="steps"
            values={block.steps}
            rendered={rendered}
            errByField={errByField}
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
function AuthoredField({
  label,
  field,
  value,
  rendered,
  errByField,
  onChange,
  previewClassName,
}: {
  label: string;
  field: string;
  value: string;
  rendered: Map<string, string>;
  errByField: Map<string, string[]>;
  onChange: (v: string) => void;
  // Optional colour tail (bg + border colour + text) for the preview strip.
  // Geometry (px, py, radius, text size, border width, overflow) stays fixed
  // so every field's preview keeps a consistent shape; only the tone changes.
  // Ignored when errs.length > 0 — validation errors still show the destructive
  // box regardless of caller-provided tone.
  previewClassName?: string;
}) {
  const html = rendered.get(field);
  const errs = errByField.get(field) ?? [];
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
      {errs.length > 0 ? (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-xs text-destructive-text space-y-0.5">
          {errs.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      ) : html !== undefined ? (
        <div
          className={`px-3 py-2 rounded-lg text-sm overflow-x-auto border ${previewClassName ?? "bg-muted/40 border-border text-foreground"}`}
        >
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : null}
    </div>
  );
}

// ── Array-of-strings field (list.items, example.steps) ──────
function ArrayField({
  label,
  fieldPrefix,
  values,
  rendered,
  errByField,
  onChange,
  addLabel,
  minLength,
}: {
  label: string;
  fieldPrefix: "items" | "steps";
  values: string[];
  rendered: Map<string, string>;
  errByField: Map<string, string[]>;
  onChange: (next: string[]) => void;
  addLabel: string;
  minLength: number;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <AuthoredField
              label={`${fieldPrefix}[${i}]`}
              field={`${fieldPrefix}[${i}]`}
              value={v}
              rendered={rendered}
              errByField={errByField}
              onChange={(nv) => onChange(values.map((x, j) => (j === i ? nv : x)))}
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
        onClick={() => onChange([...values, ""])}
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
