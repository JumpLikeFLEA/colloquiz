"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Dumbbell,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { StageDetail } from "@/lib/courses";
import { COURSE_SECTIONS, stageHref, type CourseSection } from "@/lib/courseFilters";
import { PracticePlayer } from "./PracticePlayer";
import { CheckPlayer } from "./CheckPlayer";

const SECTION_META: Record<CourseSection, { label: string; Icon: LucideIcon }> = {
  theory: { label: "Theory", Icon: BookOpen },
  practice: { label: "Practice", Icon: Dumbbell },
  check: { label: "Knowledge check", Icon: ClipboardCheck },
};

export function StageView({
  detail,
  section,
  theory,
}: {
  detail: StageDetail;
  section: CourseSection;
  /** Server-rendered <TheorySection>, injected so this client component never imports katex. */
  theory: ReactNode;
}) {
  const { course, stage } = detail;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href={`/courses/${course.slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> {course.title}
        </Link>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stage {detail.index} of {detail.total}
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">{stage.title}</h1>
          {stage.summary && <p className="text-muted-foreground mt-1">{stage.summary}</p>}
        </div>
      </div>

      {!detail.enrolled ? (
        <EnrollGate detail={detail} />
      ) : !detail.unlocked ? (
        <LockedGate detail={detail} />
      ) : (
        <>
          <SectionSwitcher slug={course.slug} stageKey={stage.key} active={section} />

          {/*
            All three sections stay mounted and are toggled by visibility, not
            unmounted. Switching to Theory and back must NOT re-draw the practice
            item — the point is to let the learner re-read theory without losing
            the example they were on. Keeping the players mounted also preserves an
            in-progress knowledge check across a peek at theory. The switcher stays
            URL-driven (?section=) so links remain shareable; a ?section= change is a
            soft navigation that re-renders these props without remounting the tree.
          */}
          <div hidden={section !== "theory"} className="space-y-8">
            {theory}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <Link
                href={stageHref(course.slug, stage.key, "practice")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
              >
                <Dumbbell size={15} /> Practise this stage
              </Link>
              <Link
                href={stageHref(course.slug, stage.key, "check")}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Take the knowledge check <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <div hidden={section !== "practice"}>
            <PracticePlayer stageId={stage.id} />
          </div>

          <div hidden={section !== "check"}>
            <CheckPlayer detail={detail} />
          </div>
        </>
      )}
    </div>
  );
}

function SectionSwitcher({
  slug,
  stageKey,
  active,
}: {
  slug: string;
  stageKey: string;
  active: CourseSection;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
      {COURSE_SECTIONS.map((s) => {
        const { label, Icon } = SECTION_META[s];
        const isActive = s === active;
        return (
          <Link
            key={s}
            href={stageHref(slug, stageKey, s)}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (isActive
                ? "bg-brand-subtle text-brand-text"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </div>
  );
}

// Before enrolling, theory and course questions are RLS-gated — nothing to show.
// One click writes the enrollment and the page re-renders with content.
function EnrollGate({ detail }: { detail: StageDetail }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${detail.course.slug}/enroll`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start the course.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 text-center rounded-2xl border border-dashed border-border">
      <div className="w-12 h-12 rounded-2xl bg-brand-subtle text-brand-text flex items-center justify-center">
        <BookOpen size={24} />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold text-foreground">Start the course to open this stage</p>
        <p className="text-sm text-muted-foreground">
          Enrolling unlocks the theory, unlimited practice, and the knowledge check. It&apos;s free.
        </p>
      </div>
      <button
        onClick={start}
        disabled={saving}
        className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
      >
        {saving ? "Starting…" : "Start course"}
      </button>
      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}
    </div>
  );
}

// A stage never re-locks, so this only shows for stages genuinely ahead of the
// learner. The previous stage's check is the way forward.
function LockedGate({ detail }: { detail: StageDetail }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 text-center rounded-2xl border border-dashed border-border">
      <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
        <Lock size={22} />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold text-foreground">This stage is locked</p>
        <p className="text-sm text-muted-foreground">
          Pass the knowledge check on the earlier stages to unlock it.
        </p>
      </div>
      {detail.prev && (
        <Link
          href={stageHref(detail.course.slug, detail.prev.key, "check")}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
        >
          Go to {detail.prev.title} <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
