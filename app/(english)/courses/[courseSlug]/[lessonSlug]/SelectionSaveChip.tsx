"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BookmarkPlus, CheckCircle2, X } from "lucide-react";
import { placeChip, type ChipAnchor } from "@/lib/notebook/chipPlacement";
import { notebookHref } from "@/lib/notebook/href";
import type { NoteError } from "@/lib/notebook/noteForm";
import { phraseKey } from "@/lib/notebook/phraseKey";
import { selectionPhrase } from "@/lib/notebook/selectionPhrase";
import { PAPER_LINK_INLINE_CLASS } from "../../../surfaceClasses";
import { LESSON_SCOPE_ATTR, readLessonSelection, SELECTION_CHIP_ATTR } from "./lessonSelection";
import type { LessonNoteTarget } from "./NotebookStripButton";
import { saveSelectedPhrase, undoSelectedPhrase } from "./selectionSaveAction";
import { selectionSaveCopy as t } from "./selectionSaveCopy";

/**
 * PROG-024 (docs/decisions/0255, 0256) — the Save chip: select a phrase anywhere in the lesson, tap
 * once, and it is in the notebook, filed under this course and lesson. It replaced PROG-023's bar
 * under the strip (0254); the states, refusals, 8 s timer and saved-phrase rule are PROG-023's,
 * unchanged. Signed-in only: NotebookStripButton, which only SignedInLessonPageClient renders,
 * draws it.
 *
 * Placement: portalled to <body> and `position: absolute` in document coordinates
 * (lib/notebook/chipPlacement), from the selection's last client rect plus the scroll offset, so it
 * moves with the text when the page scrolls, with no scroll listener. Recomputed on a selection
 * change and on resize. After a tap clears the highlight it stays where the selection was. Rendered
 * only while it shows, so the strip's row ends with the strip button (PROG-022's shape).
 *
 * One `selectionchange` listener, at most one read per animation frame. The phrase is taken when
 * the selection changes and kept in state, so a save never depends on the highlight surviving the
 * tap. A phrase saved in this page view (keyed by phraseKey, so a capitalised repeat is the same
 * phrase) shows as saved when selected again, until it is undone, so a second tap never adds a
 * second row.
 *
 * The notebook dialog has one owner, NotebookStripButton (0254 Decision 4): "Add a note" asks it to
 * open in edit mode, and this chip's 8 s timer does not run while it is open.
 */
type State =
  | { s: "hidden" }
  | { s: "ready"; phrase: string }
  | { s: "too_long"; length: number }
  | { s: "saving"; phrase: string }
  | { s: "saved"; phrase: string; id: string }
  | { s: "undoing"; phrase: string; id: string }
  | { s: "removed" }
  | { s: "refused"; error: NoteError; undo?: { phrase: string; id: string } };

/** States that stay on a collapsed or non-counting selection, until close, a new selection or 8 s. */
const STICKY = new Set<State["s"]>(["saving", "saved", "undoing", "removed", "refused"]);
/** States the 8 s timer may close (not while a write is on its way). */
const TIMED = new Set<State["s"]>(["saved", "removed", "refused"]);
const IDLE_MS = 8000;
const HIDDEN: State = { s: "hidden" };

const CHIP_BUTTON =
  "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-60";
/** The chip's frame in every state but ready and saving, where the violet button stands alone. */
const PANEL = "min-w-0 rounded-xl border-2 border-ink bg-card p-1 shadow-offset";

export function SelectionSaveChip({
  target,
  stripRef,
  dialogOpen,
  onAddNote,
  addNoteRef,
}: {
  target: LessonNoteTarget;
  /** The strip button: the lesson scope and the strip are found from it. */
  stripRef: RefObject<HTMLElement | null>;
  /** The strip's notebook dialog is open: the idle timer waits. */
  dialogOpen: boolean;
  onAddNote: (id: string, phrase: string) => void;
  /** Where focus returns when the edit dialog closes. */
  addNoteRef: RefObject<HTMLButtonElement | null>;
}) {
  const [state, setState] = useState<State>({ s: "hidden" });
  const [anchor, setAnchor] = useState<ChipAnchor | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const chipRef = useRef<HTMLDivElement>(null);
  const saved = useRef(new Map<string, string>());
  const pressing = useRef(false);
  const pointerInside = useRef(false);
  const focusInside = useRef(false);

  // The selection, read once per frame.
  useEffect(() => {
    const button = stripRef.current;
    const scope = button?.closest(`[${LESSON_SCOPE_ATTR}]`);
    const strip = button?.closest(".sticky") ?? null;
    if (!scope) return;
    let frame = 0;

    // Where the selection is, in document coordinates. Kept when it stops counting, so a chip in a
    // sticky state stays where the selection was.
    const readAnchor = () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const box = range.getBoundingClientRect();
      // A line-end rect can be zero wide; the last one with width is the last line's text.
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      const last = rects.at(-1) ?? box;
      const next: ChipAnchor = { top: box.top + window.scrollY, bottom: last.bottom + window.scrollY, endX: last.right + window.scrollX };
      setAnchor((cur) => (cur && cur.top === next.top && cur.bottom === next.bottom && cur.endX === next.endX ? cur : next));
    };

    const read = () => {
      frame = 0;
      const sel = readLessonSelection(scope, strip);
      // A tap on the chip's own button can collapse the selection before its click lands.
      if (!sel && pressing.current) return;
      const result = sel ? selectionPhrase(sel) : null;
      const counts = result !== null && (result.ok || result.reason !== "empty");
      setState((current) => {
        if (!result || (!result.ok && result.reason === "empty")) return STICKY.has(current.s) ? current : HIDDEN;
        // A write on its way is not interrupted by a new selection.
        if (current.s === "saving" || current.s === "undoing") return current;
        if (!result.ok) return current.s === "too_long" && current.length === result.length ? current : { s: "too_long", length: result.length };
        const id = saved.current.get(phraseKey(result.phrase));
        if (id) return current.s === "saved" && current.id === id ? current : { s: "saved", phrase: result.phrase, id };
        return current.s === "ready" && current.phrase === result.phrase ? current : { s: "ready", phrase: result.phrase };
      });
      if (counts) readAnchor();
    };

    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const onResize = () => {
      if (readLessonSelection(scope, strip)) readAnchor();
      setResizeTick((n) => n + 1);
    };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stripRef]);

  // Placed before paint, from the chip's own size, which changes with the state.
  useLayoutEffect(() => {
    const el = chipRef.current;
    if (!el || !anchor) return;
    const p = placeChip(
      anchor,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: document.documentElement.clientWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
    );
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    el.dataset.flipped = String(p.flipped);
  }, [state, anchor, resizeTick]);

  // The idle timer: 8 s with neither focus nor pointer inside the chip, and no dialog open.
  const [idleTick, setIdleTick] = useState(0);
  const rearm = useCallback(() => setIdleTick((n) => n + 1), []);
  useEffect(() => {
    if (!TIMED.has(state.s) || dialogOpen) return;
    if (pointerInside.current || focusInside.current) return;
    const timer = setTimeout(() => setState({ s: "hidden" }), IDLE_MS);
    return () => clearTimeout(timer);
  }, [state, dialogOpen, idleTick]);

  async function save(phrase: string) {
    setState({ s: "saving", phrase });
    const result = await saveSelectedPhrase(phrase, target.lessonId).catch(() => ({ ok: false as const, error: "failed" as const }));
    if (result.ok) {
      saved.current.set(phraseKey(phrase), result.id);
      setState({ s: "saved", phrase, id: result.id });
    } else {
      setState({ s: "refused", error: result.error });
    }
  }

  async function undo(phrase: string, id: string) {
    setState({ s: "undoing", phrase, id });
    const result = await undoSelectedPhrase(id).catch(() => ({ ok: false as const, error: "failed" as const }));
    if (result.ok) {
      saved.current.delete(phraseKey(phrase));
      setState({ s: "removed" });
    } else {
      setState({ s: "refused", error: result.error, undo: { phrase, id } });
    }
  }

  const close = () => setState({ s: "hidden" });
  const signIn = `/login?next=${encodeURIComponent(target.lessonPath)}`;

  const closeButton = (
    <button type="button" onClick={close} aria-label={t.close} className={`${CHIP_BUTTON} ml-auto size-11 justify-center px-0`}>
      <X className="size-5" aria-hidden="true" />
    </button>
  );

  function refusalText(s: Extract<State, { s: "refused" }>): string {
    if (s.undo) return s.error === "unauthenticated" ? t.undoRefusals.unauthenticated : t.undoRefusals.failed;
    return s.error in t.saveRefusals ? t.saveRefusals[s.error as keyof typeof t.saveRefusals] : t.saveRefusals.failed;
  }

  let body: ReactNode = null;
  switch (state.s) {
    case "hidden":
      break;
    case "ready":
    case "saving":
      body = (
        <button
          type="button"
          disabled={state.s === "saving"}
          onClick={() => state.s === "ready" && save(state.phrase)}
          // Keeps the selection on a mouse press (desktop); a touch is covered by `pressing`.
          onMouseDown={(e) => e.preventDefault()}
          className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border-2 border-ink bg-brand px-3 text-sm font-semibold text-white shadow-offset outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-default disabled:opacity-70"
          data-selection-save="button"
        >
          <BookmarkPlus className="size-4 flex-none" aria-hidden="true" />
          <span className="min-w-0 truncate">{state.s === "saving" ? t.saving : `${t.save} “${state.phrase}”`}</span>
        </button>
      );
      break;
    case "too_long":
      body = (
        <p className={`${PANEL} px-3 py-2 text-sm text-foreground`} data-selection-save="too-long">
          {t.tooLong(state.length)}
        </p>
      );
      break;
    case "saved":
    case "undoing":
      body = (
        <div className={`${PANEL} flex flex-col`}>
          <div className="flex min-w-0 items-center gap-2">
            <div role="status" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 pl-1 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-5 flex-none text-success" aria-hidden="true" />
              <span className="min-w-0 truncate">{t.saved}</span>
            </div>
            {closeButton}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1">
            <button
              ref={addNoteRef}
              type="button"
              disabled={state.s === "undoing"}
              onClick={() => onAddNote(state.id, state.phrase)}
              className={CHIP_BUTTON}
            >
              {t.addNote}
            </button>
            <button type="button" disabled={state.s === "undoing"} onClick={() => undo(state.phrase, state.id)} className={CHIP_BUTTON}>
              {state.s === "undoing" ? t.undoing : t.undo}
            </button>
            <Link
              href={notebookHref("phrases", target.courseId)}
              className={`inline-flex min-h-11 flex-none items-center rounded-lg px-2 text-sm ${PAPER_LINK_INLINE_CLASS}`}
            >
              {t.notebook}
            </Link>
          </div>
        </div>
      );
      break;
    case "removed":
      body = (
        <div className={`${PANEL} flex items-center gap-2`}>
          <p role="status" className="min-w-0 flex-1 pl-2 text-sm font-semibold text-foreground">
            {t.removed}
          </p>
          {closeButton}
        </div>
      );
      break;
    case "refused":
      body = (
        <div className={`${PANEL} flex items-center gap-2`}>
          <p role="status" className="min-w-0 flex-1 py-1 pl-2 text-sm text-destructive-text" data-selection-save="refused">
            {refusalText(state)}
            {state.error === "unauthenticated" && (
              <>
                {" "}
                <a href={signIn} className={PAPER_LINK_INLINE_CLASS}>
                  {t.signIn}
                </a>
              </>
            )}
          </p>
          {state.undo && (
            <button type="button" onClick={() => state.undo && undo(state.undo.phrase, state.undo.id)} className={CHIP_BUTTON}>
              {t.undo}
            </button>
          )}
          {closeButton}
        </div>
      );
      break;
  }

  // Nothing is drawn while hidden, and never during server rendering (the state starts hidden and
  // only a selectionchange, on the client, moves it).
  if (!body || !anchor) return null;
  return createPortal(
    <div
      ref={chipRef}
      {...{ [SELECTION_CHIP_ATTR]: "" }}
      data-state={state.s}
      className="absolute left-0 top-0 z-30 w-max max-w-[min(22rem,calc(100vw-2rem))]"
      onPointerDown={() => {
        pressing.current = true;
      }}
      onPointerUp={() => {
        // After the click handler has run.
        setTimeout(() => (pressing.current = false), 0);
      }}
      onPointerCancel={() => (pressing.current = false)}
      onPointerEnter={() => {
        pointerInside.current = true;
        rearm();
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
        rearm();
      }}
      onFocus={() => {
        focusInside.current = true;
        rearm();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focusInside.current = false;
        rearm();
      }}
    >
      {body}
    </div>,
    document.body,
  );
}
