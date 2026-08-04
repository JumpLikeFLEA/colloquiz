"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  PlayCircle,
} from "lucide-react";
import type { CourseSyllabus as Syllabus, SyllabusStage, StageDisplayState } from "@/lib/courses";
import { stageHref } from "@/lib/courseFilters";

// Badge copy + token families per display state. Never literal hex — the
// success / warning / muted / brand token families only (design-fidelity rule).
const STATE_META: Record<
  StageDisplayState,
  { label: string; className: string; Icon: typeof Lock }
> = {
  locked: { label: "Locked", className: "text-muted-foreground", Icon: Lock },
  available: { label: "Start", className: "text-brand-text", Icon: PlayCircle },
  in_progress: { label: "In progress", className: "text-warning", Icon: CircleDashed },
  complete: { label: "Complete", className: "text-success", Icon: CheckCircle2 },
  needs_review: { label: "Review", className: "text-warning", Icon: AlertCircle },
};

export function CourseSyllabus({ syllabus }: { syllabus: Syllabus }) {
  const router = useRouter();
  const { course, enrolled, stages, passThreshold } = syllabus;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = stages.find((s) => s.state === "available" || s.state === "in_progress");

  async function start() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${course.slug}/enroll`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start the course.");
        return;
      }
      // Re-render the server component: enrolled flips true and the stage states
      // refresh (stage 1 becomes available).
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> All courses
      </Link>

      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
        {course.subtitle && <p className="text-muted-foreground">{course.subtitle}</p>}
        {course.description && (
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {course.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {enrolled ? (
            next ? (
              <Link
                href={stageHref(course.slug, next.key)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
              >
                Continue: {next.title} <ArrowRight size={15} />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 size={16} /> All stages complete
              </span>
            )
          ) : (
            <button
              onClick={start}
              disabled={saving}
              className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Starting…" : "Start course"}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {stages.length} stages · pass at {passThreshold}%
            {course.access === "free" && " · free"}
          </span>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text max-w-md">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {stages.map((s, i) => (
          <StageRow key={s.id} stage={s} index={i} slug={course.slug} enrolled={enrolled} />
        ))}
      </div>
    </div>
  );
}

function StageRow({
  stage,
  index,
  slug,
  enrolled,
}: {
  stage: SyllabusStage;
  index: number;
  slug: string;
  enrolled: boolean;
}) {
  const meta = STATE_META[stage.state];
  // A locked stage — or the whole syllabus before enrolling — is inert: a
  // <div>, never an <a> that goes nowhere (the HistoryView pagination rule).
  const clickable = enrolled && stage.state !== "locked";

  const inner = (
    <div className="flex items-center gap-4 p-4">
      <div
        className={
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 " +
          (stage.state === "locked"
            ? "bg-muted text-muted-foreground"
            : "bg-brand-subtle text-brand-text")
        }
      >
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{stage.title}</p>
        {stage.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stage.summary}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {stage.attempts > 0 && stage.bestScore != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Best {Math.round(stage.bestScore)}%
          </span>
        )}
        <span className={"inline-flex items-center gap-1.5 text-xs font-medium " + meta.className}>
          <meta.Icon size={15} />
          {meta.label}
        </span>
        {clickable && <ArrowRight size={15} className="text-muted-foreground" />}
      </div>
    </div>
  );

  if (clickable) {
    return (
      <Link href={stageHref(slug, stage.key)} className="block hover:bg-accent transition-colors">
        {inner}
      </Link>
    );
  }
  return (
    <div aria-disabled={stage.state === "locked"} className="opacity-100">
      {inner}
    </div>
  );
}
