"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { BookmarkPlus, CheckCircle2, X } from "lucide-react";
import { notebookHref } from "@/lib/notebook/href";
import type { NoteError } from "@/lib/notebook/noteForm";
import { phraseKey } from "@/lib/notebook/phraseKey";
import { selectionPhrase } from "@/lib/notebook/selectionPhrase";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { PAPER_LINK_INLINE_CLASS } from "../../../surfaceClasses";
import { LESSON_SCOPE_ATTR, readLessonSelection, SELECTION_BAR_ATTR } from "./lessonSelection";
import type { LessonNoteTarget } from "./NotebookStripButton";
import { saveSelectedPhrase, undoSelectedPhrase } from "./selectionSaveAction";
import { selectionSaveCopy as t } from "./selectionSaveCopy";

/**
 * PROG-023 (docs/decisions/0253, 0254) — the Save bar: select a phrase anywhere in the lesson, tap
 * once, and it is in the notebook, filed under this course and lesson. Signed-in only: it is drawn
 * from the strip's action slot, which only SignedInLessonPageClient fills.
 *
 * Placement: `absolute inset-x-0 top-full`. The strip's root is `position: sticky`, a positioned
 * box, and its inner row is not positioned, so the bar resolves against the strip root: full width,
 * directly under it, sticking with it, with LessonProgressStrip unchanged. Being out of flow, it
 * covers about one row under the strip while it shows (0253's trade-off).
 *
 * One `selectionchange` listener, at most one read per animation frame. The phrase is taken when
 * the selection changes and kept in state, so a save never depends on the highlight surviving the
 * tap. A phrase saved in this page view (keyed by phraseKey, so a capitalised repeat is the same
 * phrase) shows as saved when selected again, until it is undone, so a second tap never adds a
 * second row.
 *
 * The notebook dialog has one owner, NotebookStripButton (0254 Decision 4): "Add a note" asks it to
 * open in edit mode, and this bar's 8 s timer does not run while it is open.
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

const BAR_BUTTON =
  "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-60";

export function SelectionSaveBar({
  target,
  dialogOpen,
  onAddNote,
  addNoteRef,
}: {
  target: LessonNoteTarget;
  /** The strip's notebook dialog is open: the idle timer waits. */
  dialogOpen: boolean;
  onAddNote: (id: string, phrase: string) => void;
  /** Where focus returns when the edit dialog closes. */
  addNoteRef: RefObject<HTMLButtonElement | null>;
}) {
  const [state, setState] = useState<State>({ s: "hidden" });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const saved = useRef(new Map<string, string>());
  const pressing = useRef(false);
  const pointerInside = useRef(false);
  const focusInside = useRef(false);

  // The selection, read once per frame.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const scope = wrapper?.closest(`[${LESSON_SCOPE_ATTR}]`);
    const strip = wrapper?.closest(".sticky") ?? null;
    if (!scope) return;
    let frame = 0;

    const read = () => {
      frame = 0;
      const sel = readLessonSelection(scope, strip);
      // A tap on the bar's own button can collapse the selection before its click lands.
      if (!sel && pressing.current) return;
      const result = sel ? selectionPhrase(sel) : null;
      setState((current) => {
        if (!result || (!result.ok && result.reason === "empty")) return STICKY.has(current.s) ? current : HIDDEN;
        // A write on its way is not interrupted by a new selection.
        if (current.s === "saving" || current.s === "undoing") return current;
        if (!result.ok) return current.s === "too_long" && current.length === result.length ? current : { s: "too_long", length: result.length };
        const id = saved.current.get(phraseKey(result.phrase));
        if (id) return current.s === "saved" && current.id === id ? current : { s: "saved", phrase: result.phrase, id };
        return current.s === "ready" && current.phrase === result.phrase ? current : { s: "ready", phrase: result.phrase };
      });
    };

    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The idle timer: 8 s with neither focus nor pointer inside the bar, and no dialog open.
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
    <button type="button" onClick={close} aria-label={t.close} className={`${BAR_BUTTON} -mr-2 ml-auto size-11 justify-center px-0`}>
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
          className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border-2 border-ink bg-brand px-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-default disabled:opacity-70"
          data-selection-save="button"
        >
          <BookmarkPlus className="size-4 flex-none" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {state.s === "saving" ? t.saving : `${t.save} “${state.phrase}”`}
          </span>
        </button>
      );
      break;
    case "too_long":
      body = (
        <p className="min-w-0 py-1 text-sm text-foreground" data-selection-save="too-long">
          {t.tooLong(state.length)}
        </p>
      );
      break;
    case "saved":
    case "undoing":
      body = (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-0">
          <div role="status" className="flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-5 flex-none text-success" aria-hidden="true" />
            <span className="min-w-0 truncate">{t.saved}</span>
          </div>
          <button
            ref={addNoteRef}
            type="button"
            disabled={state.s === "undoing"}
            onClick={() => onAddNote(state.id, state.phrase)}
            className={`${BAR_BUTTON} -ml-2`}
          >
            {t.addNote}
          </button>
          <button type="button" disabled={state.s === "undoing"} onClick={() => undo(state.phrase, state.id)} className={BAR_BUTTON}>
            {state.s === "undoing" ? t.undoing : t.undo}
          </button>
          <Link href={notebookHref("phrases", target.courseId)} className={`inline-flex min-h-11 flex-none items-center rounded-lg px-2 text-sm ${PAPER_LINK_INLINE_CLASS}`}>
            {t.notebook}
          </Link>
          {closeButton}
        </div>
      );
      break;
    case "removed":
      body = (
        <div className="flex w-full min-w-0 items-center gap-2">
          <p role="status" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {t.removed}
          </p>
          {closeButton}
        </div>
      );
      break;
    case "refused":
      body = (
        <div className="flex w-full min-w-0 items-center gap-2">
          <p role="status" className="min-w-0 flex-1 py-1 text-sm text-destructive-text" data-selection-save="refused">
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
            <button type="button" onClick={() => state.undo && undo(state.undo.phrase, state.undo.id)} className={BAR_BUTTON}>
              {t.undo}
            </button>
          )}
          {closeButton}
        </div>
      );
      break;
  }

  return (
    <div
      ref={wrapperRef}
      {...{ [SELECTION_BAR_ATTR]: "" }}
      data-state={state.s}
      className="absolute inset-x-0 top-full"
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
      {body && (
        <div className="border-b-2 border-ink bg-paper/95 backdrop-blur">
          <div className={`${LESSON_READING_FRAME_CLASS} py-1`}>{body}</div>
        </div>
      )}
    </div>
  );
}
