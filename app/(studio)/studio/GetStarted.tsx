import Link from "next/link";
import { Check } from "lucide-react";
import type { Checklist, ChecklistStep } from "@/lib/studioGuide/checklist";

// TCH-015 (docs/decisions/0206). The "Get started" card at the top of the
// inbox. A Server Component: ticks come from getChecklist(), nothing here
// decides what is done. Composed from the inbox's row frame and the sidebar's
// brand tokens; no new colours.

function Row({ step }: { step: ChecklistStep }) {
  const done = step.done === true;
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-brand text-white" : "border border-border bg-background"
        }`}
      >
        {done && <Check size={12} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium break-words ${done ? "text-muted-foreground" : "text-foreground"}`}>
          {step.label}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {!done && (
            <Link href={step.href} prefetch={false} className="inline-flex items-center min-h-6 text-xs font-medium text-brand-text hover:underline">
              {step.action}
            </Link>
          )}
          <Link
            href={`/studio/guide/${step.article}`}
            prefetch={false}
            className="inline-flex items-center min-h-6 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            How?
          </Link>
        </div>
      </div>
    </li>
  );
}

export function GetStarted({ checklist }: { checklist: Checklist }) {
  if (checklist.phase === "hidden") return null;

  if (checklist.phase === "setup") {
    return (
      <section aria-labelledby="get-started" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="get-started" className="text-sm font-semibold text-foreground">
          You&apos;re set up
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Your course is published and shared. A few optional things are left
          {checklist.focus ? <> for {checklist.focus.title}</> : null}.
        </p>
        <ul className="divide-y divide-border mt-2">
          {checklist.extras.map((s) => (
            <Row key={s.id} step={s} />
          ))}
        </ul>
      </section>
    );
  }

  const done = checklist.core.filter((s) => s.done === true).length;
  return (
    <section aria-labelledby="get-started" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="get-started" className="text-sm font-semibold text-foreground">
          Get started
        </h2>
        <p className="text-xs text-muted-foreground">
          {done} of {checklist.core.length} done
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {checklist.focus ? (
          <>
            The steps follow <span className="font-medium text-foreground break-words">{checklist.focus.title}</span>.{" "}
          </>
        ) : null}
        <Link href="/studio/guide/your-first-course" prefetch={false} className="font-medium text-brand-text hover:underline">
          Read the guide
        </Link>
      </p>
      <ul className="divide-y divide-border mt-2">
        {checklist.core.map((s) => (
          <Row key={s.id} step={s} />
        ))}
      </ul>
      <h3 className="text-xs font-semibold text-muted-foreground mt-3">Optional</h3>
      <ul className="divide-y divide-border">
        {checklist.extras.map((s) => (
          <Row key={s.id} step={s} />
        ))}
      </ul>
    </section>
  );
}
