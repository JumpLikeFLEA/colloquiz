"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bold } from "lucide-react";
import { feedbackTextLength } from "@/lib/feedback/content";
import { feedbackFromMarkup, toggleBold } from "@/lib/feedback/markup";
import { markupFromClipboardHtml, type PasteNode } from "@/lib/feedback/paste";
import { MESSAGE_MAX_CHARS } from "@/lib/messages/limits";

/**
 * TCH-004 (docs/decisions/0151) — the box a message is written in, for the
 * learner's page and Studio alike. A plain textarea holding `**bold**`, the
 * VOICE-002 editor's conventions without its preview or draft states: the
 * Bold button and Ctrl/⌘+B wrap the selection, an HTML paste is converted to
 * the same text, a blank line is a new paragraph. The conversion
 * (feedbackFromMarkup) is the one the feedback editor stores through.
 *
 * Every string comes in as a prop from the page, so neither language's copy
 * ships in this bundle (docs/decisions/0079 "Budget"). No toast: the English
 * surface has no Toaster, so a refusal is shown under the box.
 *
 * Sending posts to /api/messages and refreshes the page, which re-reads the
 * thread: no realtime (0141 Decision 8). The route and send_teacher_message
 * (079) decide whether the message is allowed; the counter and the disabled
 * button here are a courtesy.
 *
 * TCH-006 (docs/decisions/0153): the lesson page's "Ask the teacher" dialog
 * reuses this box. It passes `attachment` (the frozen exercise, sent with the
 * message) and `onSent`, which REPLACES the refresh: refreshing the lesson
 * page re-renders the player with a new attemptId (the 0086 note), so a sent
 * question must never refresh it.
 */
export type ComposerLabels = {
  label: string;
  bold: string;
  hint: string;
  send: string;
  sending: string;
  /** "{n} / {max}" */
  counter: string;
  failed: string;
};

export function MessageComposer({
  teacherId,
  studentId,
  labels,
  attachment,
  onSent,
}: {
  teacherId: string;
  studentId: string;
  labels: ComposerLabels;
  /** The frozen exercise to send with the message (TCH-006). */
  attachment?: unknown;
  /** Called after a successful send, instead of refreshing the page. */
  onSent?: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = feedbackFromMarkup(text);
  const length = content ? feedbackTextLength(content) : 0;
  const tooLong = length > MESSAGE_MAX_CHARS;

  function replaceSelection(next: { text: string; start: number; end: number }) {
    setText(next.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  function bold() {
    const el = ref.current;
    if (!el) return;
    replaceSelection(toggleBold({ text, start: el.selectionStart, end: el.selectionEnd }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      // ui/sidebar toggles the Studio nav on Ctrl/⌘+B from a window keydown
      // listener (the FeedbackEditor note, 0114).
      e.stopPropagation();
      bold();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // plain text: the textarea's own paste is right
    e.preventDefault();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const pasted = markupFromClipboardHtml(doc.body as unknown as PasteNode);
    const el = e.currentTarget;
    const start = el.selectionStart;
    const caret = start + pasted.length;
    replaceSelection({ text: text.slice(0, start) + pasted + text.slice(el.selectionEnd), start: caret, end: caret });
  }

  async function send() {
    if (!content || tooLong || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, studentId, body: content, ...(attachment ? { attachment } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? labels.failed);
        return;
      }
      setText("");
      if (onSent) onSent();
      else router.refresh();
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-brand">
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <button
            type="button"
            onClick={bold}
            aria-label={labels.bold}
            title={`${labels.bold} (Ctrl+B)`}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bold size={16} />
          </button>
          <span className="text-xs text-muted-foreground">{labels.hint}</span>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label={labels.label}
          rows={4}
          className="block w-full resize-y bg-transparent px-3 py-2 text-base text-foreground outline-none sm:text-sm"
        />
      </div>
      <p className={`text-xs ${tooLong ? "text-destructive-text" : "text-muted-foreground"}`}>
        {labels.counter
          .replace("{n}", length.toLocaleString("en-GB"))
          .replace("{max}", MESSAGE_MAX_CHARS.toLocaleString("en-GB"))}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text"
        >
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={send}
          disabled={busy || !content || tooLong}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? labels.sending : labels.send}
        </button>
      </div>
    </div>
  );
}
