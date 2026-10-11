"use client";

import { useMemo, useRef, useState } from "react";
import { Bold } from "lucide-react";
import { toast } from "sonner";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { FEEDBACK_CONTENT_MAX_CHARS, feedbackTextLength, type FeedbackContent } from "@/lib/feedback/content";
import { feedbackFromMarkup, markupFromFeedback, toggleBold } from "@/lib/feedback/markup";
import { markupFromClipboardHtml, type PasteNode } from "@/lib/feedback/paste";

// The VOICE-002 editor (docs/decisions/0096 Decision 2), used for voice
// feedback and for COH-005's final comment (VOICE-006, 0114). A plain
// textarea holding `**bold**`; the Bold button and Ctrl/⌘+B wrap or unwrap
// the selection; a paste with `text/html` is converted to the same text
// (bold by effective font-weight, never HTML). The preview renders the
// converter's output with the learner's own component, so what the author
// sees is what is stored and what the learner gets.

const BUTTON =
  "cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-brand text-white hover:bg-brand/90`;
const SECONDARY = `${BUTTON} border border-border bg-card text-foreground hover:bg-accent`;

export function FeedbackEditor({
  initial,
  publishedAt,
  label,
  publishHint,
  onSave,
}: {
  initial: FeedbackContent | null;
  publishedAt: string | null;
  /** The textarea's accessible name, e.g. "Feedback for Maria". */
  label: string;
  /** What publishing does, shown next to the buttons before publishing. */
  publishHint: string;
  /** Resolves once saved; throws with a message to toast. */
  onSave: (body: FeedbackContent, publish: boolean) => Promise<void>;
}) {
  const savedMarkup = useMemo(() => (initial ? markupFromFeedback(initial) : ""), [initial]);
  const [text, setText] = useState(savedMarkup);
  // What the server last accepted, kept locally so the buttons are right
  // straight after a save, before the page's refresh brings the new props.
  const [savedText, setSavedText] = useState(savedMarkup);
  const [publishedNow, setPublishedNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const content = useMemo(() => feedbackFromMarkup(text), [text]);
  const length = content ? feedbackTextLength(content) : 0;
  const tooLong = length > FEEDBACK_CONTENT_MAX_CHARS;
  const dirty = text !== savedText;
  const published = publishedAt != null || publishedNow;

  function replaceSelection(next: { text: string; start: number; end: number }) {
    setText(next.text);
    // Restore the selection after React writes the new value.
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
      // listener; without this the same keypress also opens the nav
      // (measured at 360px, 0114).
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

  async function save(publish: boolean) {
    if (!content || tooLong) return;
    setBusy(true);
    try {
      await onSave(content, publish);
      setSavedText(text);
      if (publish) setPublishedNow(true);
      toast.success(publish && !published ? "Published." : published ? "Saved. The learner sees this version." : "Draft saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-brand">
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <button
            type="button"
            onClick={bold}
            aria-label="Bold"
            title="Bold (Ctrl+B)"
            className="cursor-pointer inline-flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Bold size={16} />
          </button>
          <span className="text-xs text-muted-foreground">
            **bold** · blank line = new paragraph
          </span>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label={label}
          rows={5}
          className="block w-full resize-y bg-transparent px-3 py-2 text-base sm:text-sm text-foreground outline-none"
        />
      </div>
      <p className={`text-xs ${tooLong ? "text-destructive-text" : "text-muted-foreground"}`}>
        {length.toLocaleString("en-GB")} / {FEEDBACK_CONTENT_MAX_CHARS.toLocaleString("en-GB")} characters
      </p>

      {content && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">What the learner sees</p>
          <div className="rounded-xl bg-brand-subtle px-3 py-2.5 text-sm text-foreground">
            <FeedbackContentView content={content} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {published ? (
          <>
            <button type="button" onClick={() => save(false)} disabled={busy || !dirty || !content || tooLong} className={PRIMARY}>
              Save changes
            </button>
            <span className="text-xs text-muted-foreground">Published. Saving updates what the learner sees.</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => save(true)} disabled={busy || !content || tooLong} className={PRIMARY}>
              Publish
            </button>
            <button type="button" onClick={() => save(false)} disabled={busy || !dirty || !content || tooLong} className={SECONDARY}>
              Save draft
            </button>
            <span className="text-xs text-muted-foreground">{publishHint}</span>
          </>
        )}
      </div>
    </div>
  );
}
