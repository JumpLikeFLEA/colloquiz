"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Bug, CheckCircle2, Lightbulb, MessageCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  collectFeedbackContext,
  FEEDBACK_CATEGORIES,
  FEEDBACK_ENDPOINT,
  FEEDBACK_ERRORS,
  FEEDBACK_MAX_LENGTH,
  validateFeedbackMessage,
  type FeedbackCategory,
  type FeedbackContext,
} from "@/lib/feedback";

const CATEGORY_ICONS = {
  bug: Bug,
  idea: Lightbulb,
  other: MessageCircle,
} as const;

/**
 * "5 minutes" reads better than "312 seconds", and rounding UP never promises a
 * retry that will still be refused.
 */
function formatRetry(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || seconds <= 0) return null;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  return "about an hour";
}

type SubmitError = { code: string; reason: string; retryAfterSeconds?: number | null };

/**
 * The in-app feedback button and its modal.
 *
 * A MODAL, NOT A ROUTE, and that is load-bearing rather than a style choice.
 * The single most useful thing a report carries is the page it was filed from;
 * navigating to a feedback page would throw that away before the user had typed
 * anything. Everything the form knows about the context is captured at the
 * moment the dialog OPENS, for the same reason.
 *
 * ACCESSIBILITY comes from using the Radix primitive properly rather than from
 * hand-rolled handlers: focus moves into the content and is trapped there,
 * Escape closes, and focus returns to the trigger on close — all of which
 * requires only that the trigger live inside the <Dialog>, which it does even
 * though `open` is controlled here. DialogTitle/DialogDescription are what wire
 * up aria-labelledby/aria-describedby, so neither is optional.
 */
export function FeedbackDialog() {
  const { resolvedTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [error, setError] = useState<SubmitError | null>(null);
  const [context, setContext] = useState<FeedbackContext>({});

  // Captured on OPEN, never shown, never asked for. Reading it here rather than
  // at submit time means it describes the page the user was looking at when
  // something went wrong, not wherever they happen to be several seconds later.
  //
  // The route is read off `window.location` rather than usePathname() so it
  // keeps the query string — ?tab=history, ?difficulty=hard and ?subject= are
  // real state in this app, and a report that dropped them would point at a
  // page in the wrong condition. Doing it here also avoids useSearchParams(),
  // which would drag a Suspense requirement into the shell layout.
  function handleOpenChange(next: boolean) {
    if (next) {
      setCategory("bug");
      setMessage("");
      setStatus("idle");
      setError(null);
      setContext(
        collectFeedbackContext(
          window.location.pathname + window.location.search,
          resolvedTheme,
        ),
      );
    }
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    // The same function the server runs, so the wording of a rejection is
    // identical whichever side produced it.
    const invalid = validateFeedbackMessage(message);
    if (invalid) {
      setError({ code: invalid.code, reason: invalid.reason });
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, ...context }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("idle");
        setError({
          code: typeof data?.error === "string" ? data.error : FEEDBACK_ERRORS.serverError,
          reason:
            typeof data?.reason === "string"
              ? data.reason
              : "Something went wrong sending that. Please try again.",
          retryAfterSeconds: data?.retryAfterSeconds ?? null,
        });
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError({
        code: FEEDBACK_ERRORS.serverError,
        reason: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  const length = message.trim().length;
  const overLimit = length > FEEDBACK_MAX_LENGTH;
  const retry = formatRetry(error?.retryAfterSeconds);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {/* Matches the bell's weight deliberately: same p-2/rounded-xl/hover
            treatment and the same muted foreground, so it reads as a utility
            in the chrome rather than competing with anything on the page. */}
        <button
          type="button"
          className="px-2.5 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Feedback
        </button>
      </DialogTrigger>

      {/* The vendored primitive animates with a fade + 95% zoom; the zoom is the
          part reduced-motion users are asking not to see. Dropping the whole
          keyframe here rather than editing ui/dialog.tsx (vendored, re-vendored
          on each add).
          THE `!` IS REQUIRED. The animation comes from `data-[state=open]:
          animate-in`, an attribute selector at specificity (0,2,0); a
          motion-reduce variant is only a media query wrapped around (0,1,0), and
          media queries contribute no specificity. Without the important flag
          this class is silently outranked and the dialog still zooms — verified,
          not theorised. */}
      <DialogContent className="motion-reduce:animate-none! sm:max-w-md">
        {status === "sent" ? (
          // role="status" so the change is announced, not just seen — the form
          // vanishing under a keyboard user is otherwise silent.
          <div className="flex flex-col gap-4" role="status">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
                Thanks — that reached us
              </DialogTitle>
              <DialogDescription>
                It&apos;s saved, along with the page you were on. Thanks for taking
                the time to tell us.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              {/* autoFocus because the button that had focus just unmounted. */}
              <Button autoFocus onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Tell us what&apos;s broken, what&apos;s missing, or what would help.
                We&apos;ll see the page you were on.
              </DialogDescription>
            </DialogHeader>

            {/* Real radio inputs behind styled labels, matching the Appearance
                theme control exactly: a radiogroup is expected to support
                arrow-key traversal from a single tab stop, and the platform
                gives that for free. sr-only keeps each input in the focus order
                and the accessibility tree, so peer-focus-visible can draw the
                ring on the label. */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground mb-2">
                What kind of feedback is this?
              </legend>
              <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-background w-fit">
                {FEEDBACK_CATEGORIES.map(({ key, label }) => {
                  const Icon = CATEGORY_ICONS[key];
                  const active = category === key;
                  return (
                    <label key={key} className="cursor-pointer">
                      <input
                        type="radio"
                        name="feedback-category"
                        value={key}
                        checked={active}
                        onChange={() => setCategory(key)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors motion-reduce:transition-none",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                          active
                            ? "bg-brand-subtle text-brand-text font-medium"
                            : "text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <Icon size={14} aria-hidden="true" />
                        {label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
                Your message
              </label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="min-h-32"
                placeholder="What happened, and what did you expect instead?"
                aria-invalid={overLimit || undefined}
                aria-describedby="feedback-counter feedback-error"
              />
              {/* Deliberately no maxLength on the textarea: it would silently
                  swallow the tail of a pasted paragraph. Show the overage and
                  let the person edit it down. */}
              <p
                id="feedback-counter"
                className={cn(
                  "text-xs",
                  overLimit ? "text-destructive-text" : "text-muted-foreground",
                )}
              >
                {length} / {FEEDBACK_MAX_LENGTH} characters
              </p>
            </div>

            {/* One quiet line, so question-specific problems go where the
                question id can travel with them. This form has no way to know
                which question was on screen; the in-quiz control does. */}
            <p className="text-xs text-muted-foreground">
              Something wrong with a specific quiz question? Use{" "}
              <span className="text-foreground">Report question</span> inside the quiz
              instead — that sends us the question itself.
            </p>

            {/* role="alert" so a failure is announced rather than only rendered.
                Always in the tree so assistive tech sees a live region change. */}
            <div id="feedback-error" role="alert" aria-live="polite">
              {error && (
                <div className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2">
                  <p className="text-sm text-destructive-text">
                    {error.reason}
                    {error.code === FEEDBACK_ERRORS.rateLimited && retry
                      ? ` You can send another in ${retry}.`
                      : ""}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={status === "submitting"}
              >
                Cancel
              </Button>
              {/* Never disabled for a too-short message: a button that is dead
                  for a reason it does not state is worse than one that explains
                  itself when pressed. Only the in-flight state disables it. */}
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
