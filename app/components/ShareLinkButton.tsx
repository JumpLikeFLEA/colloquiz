"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * PROG-008 (docs/decisions/0209) — shares a course-complete link. The phone's
 * own share sheet where there is one (`navigator.share`, which the Instagram
 * and Telegram in-app browsers mostly lack), else the link goes to the
 * clipboard and the label says so. Labels come in as props so no strings
 * module rides along to the course page (docs/decisions/0079 "Budget").
 * A cancelled share sheet is not an error and changes nothing.
 */
export function ShareLinkButton({
  path,
  title,
  text,
  label,
  copiedLabel,
  className,
}: {
  /** Site-relative, e.g. `/completed/<course>`; made absolute on click. */
  path: string;
  title: string;
  text: string;
  label: string;
  copiedLabel: string;
  className: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other refusal falls through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (err) {
      console.error("failed to copy the share link", err);
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      {copied ? <Check className="size-4 flex-none" aria-hidden="true" /> : <Share2 className="size-4 flex-none" aria-hidden="true" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
