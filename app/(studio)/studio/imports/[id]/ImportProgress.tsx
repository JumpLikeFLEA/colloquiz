"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { qaHasFindings, readStoredQa } from "@/lib/courseImport/qaView";
import type { ImportQa } from "@/lib/courseImport/qa";
import type { ImportStatusBody, ImportStepView } from "@/lib/courseImport/status";
import { pluralize } from "@/lib/format";

// The import page's body (CNT-019, docs/decisions/0204). It shows what the status route returns
// and polls it every POLL_MS while the import runs. A poll is also what re-claims a stalled run
// (GET /api/studio/imports/<id>), so keeping the page open is what recovers a lost run quickly.
// Everything shown is the route's own view: steps, counts and failure sentence come from
// importStatusView, the report from the stored qa.

const POLL_MS = 4000;

function StepRow({ step }: { step: ImportStepView }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
          step.state === "done" ? "bg-brand text-white" : step.state === "active" ? "bg-brand-subtle text-brand-text" : "bg-muted text-muted-foreground"
        }`}
      >
        {step.state === "done" ? <Check className="size-4" /> : step.state === "active" ? <Loader2 className="size-4 motion-safe:animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className={`text-sm min-w-0 break-words ${step.state === "todo" ? "text-muted-foreground" : "text-foreground font-medium"}`}>
        {step.label}
        <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "active" ? " (in progress)" : " (waiting)"}</span>
      </span>
    </li>
  );
}

function QaReport({ qa }: { qa: ImportQa }) {
  return (
    <section className="space-y-4" aria-labelledby="qa-heading">
      <h2 id="qa-heading" className="text-lg font-semibold text-foreground">
        Review before you publish
      </h2>
      <p className="text-sm text-muted-foreground">
        These notes come from the drafting and from checks on the result. The course is a draft: nothing is visible to learners yet.
        Every imported lesson starts closed to visitors, so open at least one lesson to anyone in the course editor before publishing.
      </p>

      {(qa.flags.length > 0 || qa.markMapping || qa.planNotes.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          {qa.flags.length > 0 && (
            <ul className="space-y-1.5">
              {qa.flags.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 break-words">{f}</span>
                </li>
              ))}
            </ul>
          )}
          {qa.markMapping && (
            <p className="text-sm text-foreground break-words">
              <span className="font-medium">How marks became scores: </span>
              {qa.markMapping}
            </p>
          )}
          {qa.planNotes.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {qa.planNotes.map((n, i) => (
                <li key={i} className="break-words">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!qaHasFindings(qa) && <p className="text-sm text-muted-foreground">The drafting left no notes and the checks found nothing to flag. Read the lessons anyway.</p>}

      <ol className="space-y-3">
        {qa.lessons.map((l, i) => (
          <li key={l.slug} className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground break-words">
                {i + 1}. {l.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pluralize(l.exercises, "exercise")}
                {l.estimatedMinutes !== null ? ` · about ${l.estimatedMinutes} min` : ""}
              </p>
            </div>
            {l.flags.length > 0 && (
              <ul className="space-y-1">
                {l.flags.map((f, j) => (
                  <li key={j} className="flex gap-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {l.conversions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Rewritten for the screen</p>
                <ul className="space-y-1">
                  {l.conversions.map((c) => (
                    <li key={c.blockId} className="text-xs text-muted-foreground break-words">
                      <span className="mr-1.5 rounded-full bg-warning-subtle px-2 py-0.5 text-warning">Converted</span>
                      {c.from}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {l.notes.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                {l.notes.map((n, j) => (
                  <li key={j} className="break-words">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ImportProgress({ importId, initial }: { importId: string; initial: ImportStatusBody }) {
  const [view, setView] = useState<ImportStatusBody>(initial);
  const [stale, setStale] = useState(false);

  const running = view.state === "running";
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/studio/imports/${importId}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.ok) {
          setView(data as ImportStatusBody);
          setStale(false);
          if (data.state !== "running") return;
        } else {
          setStale(true);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [importId, running]);

  const qa = view.state === "done" ? readStoredQa(view.qa) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4" aria-live="polite">
        <ol className="space-y-3">
          {view.steps.map((s) => (
            <StepRow key={s.key} step={s} />
          ))}
        </ol>

        {running && (
          <p className="text-xs text-muted-foreground">
            This takes several minutes. You can leave this page and the import carries on; open it again from Imports. If it looks stuck, keep this page open: it picks a stalled import up again.
          </p>
        )}
        {running && stale && <p className="text-xs text-muted-foreground">Can&rsquo;t refresh right now. Trying again.</p>}

        {view.state === "failed" && (
          <div role="alert" className="space-y-3">
            <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text break-words">
              {view.failure?.message ?? "The import failed. Try again; if it keeps failing, tell the admin."}
            </div>
            {view.failure && <p className="text-xs text-muted-foreground break-all">Code: {view.failure.code}</p>}
            <Link
              href="/studio/imports/new"
              className="inline-flex min-h-9 items-center px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Start a new import
            </Link>
          </div>
        )}

        {view.state === "done" && view.courseId && (
          <Link
            href={`/studio/courses/${view.courseId}`}
            className="inline-flex min-h-9 items-center px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            Open course
          </Link>
        )}
      </section>

      {view.state === "done" && (qa ? <QaReport qa={qa} /> : <p className="text-sm text-muted-foreground">No report was stored for this import. Read the lessons in the course editor.</p>)}
    </div>
  );
}
