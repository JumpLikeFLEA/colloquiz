"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { WRITING_ANSWER_MAX_CHARS, type WritingTaskBlock } from "@/lib/lessons";
import { writingCopy } from "@/lib/alliengll/writingCopy";
import { createDraftStore } from "@/lib/writing/draftStore";
import { normaliseWritingBody, WRITING_FALLBACK_ERRORS } from "@/lib/writing/answer";
import type { WritingTaskState } from "@/lib/writing/state";
import { PRACTICE_CARD_CLASS } from "../columnLayout";
import { InlineContentView } from "../InlineContent";
import { PROMPT_TEXT_CLASS, SUBMIT_BUTTON_CLASS } from "../practice/practiceClasses";
import { FeedbackContentView } from "./FeedbackContentView";

const SAVE_DELAY_MS = 500;
const NOTICE_CLASS = "rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground";
const ERROR_NOTICE_CLASS = "rounded-xl bg-destructive-subtle px-3 py-2 text-sm text-destructive-text";

type SendStatus = "idle" | "sending" | "error";

/**
 * The learner's side of a writing task: a prompt, a textarea that grows with
 * its text, and a counter. Not scored, not numbered "Exercise N of M".
 *
 * Two modes. PRACTICE (WRITE-001): the text is a draft kept in this browser
 * and never uploaded. SEND (WRITE-002, docs/decisions/0225): the page found a
 * route (`state.route` is cohort or linked), so the learner can send the
 * answer, edit it and send again until feedback is published, after which it
 * is read-only with the feedback under it. A refusal that says the page's read
 * is out of date (the lesson closed, the tick came off, the answer locked)
 * drops the card back to practice with the text kept.
 *
 * The draft is read AFTER mount (an effect), so the server HTML is the same
 * whatever is stored (the sent answer, in send mode). It is written debounced
 * and on `pagehide`, and cleared by a successful send. With no `draftKey`
 * (the Studio preview) it lives in memory only.
 */
export function WritingCard({
  block,
  draftKey,
  state,
  lessonId,
}: {
  block: WritingTaskBlock;
  draftKey: string | null;
  state?: WritingTaskState;
  lessonId?: string;
}) {
  const canSend = Boolean(state && state.route !== "practice" && block.sendToTeacher && lessonId);
  const store = useMemo(() => createDraftStore(draftKey), [draftKey]);
  const [mode, setMode] = useState<"send" | "practice">(canSend ? "send" : "practice");
  const [text, setText] = useState(canSend ? (state?.submission?.body ?? "") : "");
  const [sentBody, setSentBody] = useState<string | null>(canSend ? (state?.submission?.body ?? null) : null);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [refusedNotice, setRefusedNotice] = useState(false);
  const latest = useRef(canSend ? (state?.submission?.body ?? "") : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const locked = mode === "send" && Boolean(state?.locked);

  useEffect(() => {
    if (locked) return;
    // Reading storage after mount is the point: it is an external system.
    const saved = store.read();
    if (saved !== "") {
      latest.current = saved;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(saved);
    }
    function flush() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (dirty.current) {
        dirty.current = false;
        store.write(latest.current);
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store, locked]);

  function onChange(next: string) {
    latest.current = next;
    dirty.current = true;
    setText(next);
    if (status === "error") setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      dirty.current = false;
      store.write(latest.current);
    }, SAVE_DELAY_MS);
  }

  async function send() {
    if (!lessonId || status === "sending") return;
    setStatus("sending");
    const body = normaliseWritingBody(latest.current);
    try {
      const res = await fetch("/api/writing/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, blockId: block.id, body }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        // Sent: the draft has done its job.
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        dirty.current = false;
        store.write("");
        latest.current = body;
        setText(body);
        setSentBody(body);
        setStatus("idle");
        return;
      }
      if (json?.error && WRITING_FALLBACK_ERRORS.has(json.error)) {
        // The page's read is out of date. The text stays, on this device.
        setMode("practice");
        setRefusedNotice(true);
        setStatus("idle");
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  const inputId = `writing-${block.id}`;
  const sending = mode === "send";
  const unsent = sending && sentBody !== null && normaliseWritingBody(text) !== sentBody;
  const hasText = normaliseWritingBody(text).length > 0;

  return (
    <div className={PRACTICE_CARD_CLASS}>
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
        <PenLine className="size-3.5" aria-hidden="true" />
        {writingCopy.label}
      </p>
      {/* pre-line: the prompt may hold line breaks (docs/decisions/0224). */}
      <p id={`${inputId}-prompt`} className={`whitespace-pre-line ${PROMPT_TEXT_CLASS}`}>
        <InlineContentView content={block.prompt} />
      </p>

      {locked && state?.submission ? (
        <>
          <p className="mt-3 text-xs font-medium text-muted-foreground">{writingCopy.answerLabel}</p>
          <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm">
            {state.submission.body}
          </p>
          {state.feedback && (
            <div className="mt-3 break-words rounded-xl bg-brand-subtle px-4 py-3 text-sm text-foreground">
              <p className="mb-1 font-semibold text-brand-text">{writingCopy.feedbackHeading}</p>
              <FeedbackContentView content={state.feedback.body} />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{writingCopy.locked}</p>
        </>
      ) : (
        <>
          <textarea
            id={inputId}
            aria-labelledby={`${inputId}-prompt`}
            value={text}
            maxLength={WRITING_ANSWER_MAX_CHARS}
            placeholder={writingCopy.placeholder}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="mt-3 block min-h-28 w-full resize-none rounded-xl border-2 border-border bg-background px-3 py-2.5 text-sm outline-none [field-sizing:content] focus:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {sending
                ? state?.route === "cohort"
                  ? writingCopy.sendNoteCohort
                  : writingCopy.sendNoteLinked
                : writingCopy.practiceNote}
            </span>
            <span className="tabular-nums">{writingCopy.counter(text.length, WRITING_ANSWER_MAX_CHARS)}</span>
          </div>
          {refusedNotice && <p className={`mt-3 ${NOTICE_CLASS}`}>{writingCopy.refused}</p>}
          {sending && (
            <div className="mt-3 flex flex-col gap-2" role="status" aria-live="polite">
              {status === "error" && <p className={ERROR_NOTICE_CLASS}>{writingCopy.sendError}</p>}
              {sentBody !== null && !unsent && status !== "error" && (
                <p className="text-sm font-medium text-foreground">{writingCopy.sentWaiting}</p>
              )}
              {unsent && status !== "error" && <p className="text-sm text-muted-foreground">{writingCopy.unsent}</p>}
              {(sentBody === null || unsent || status === "error") && (
                <div>
                  <button
                    type="button"
                    onClick={send}
                    disabled={status === "sending" || !hasText}
                    className={SUBMIT_BUTTON_CLASS}
                  >
                    {status === "sending"
                      ? writingCopy.sending
                      : status === "error"
                        ? writingCopy.retry
                        : sentBody === null
                          ? writingCopy.send
                          : writingCopy.sendAgain}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
