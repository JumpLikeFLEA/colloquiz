import Link from "next/link";
import { FileUp } from "lucide-react";
import { notFound } from "next/navigation";
import { canImportCourse } from "@/lib/courseImport/access";
import { COURSE_IMPORT_FORMAT_INFO, isCourseImportFormat } from "@/lib/courseImport/formats";
import { importListState } from "@/lib/courseImport/qaView";
import { createClient } from "@/lib/supabase/server";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";

// /studio/imports — the caller's past course imports (CNT-019, docs/decisions/0203, 0204).
// course_imports' RLS lets the owner read their own rows only (migration 103), so no filter here
// is the boundary. The page is for a holder of the grant, the same as the nav entry.

export const metadata = { title: "Imports" };

const PILL: Record<"done" | "running" | "failed", string> = {
  done: "bg-brand-subtle text-brand-text",
  running: "bg-muted text-muted-foreground",
  failed: "bg-warning-subtle text-warning",
};

type Row = { id: string; title: string; slug: string; level: string; format: string; status: string; created_at: string };

export default async function ImportsPage() {
  if (!(await canImportCourse())) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_imports")
    .select("id, title, slug, level, format, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) console.error("imports list:", error);
  const rows = (data ?? []) as Row[];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Imports</h1>
          <p className="text-muted-foreground mt-1">Courses drafted from a file. Each one ends as a draft course you review and publish.</p>
        </div>
        <Link
          href="/studio/imports/new"
          className="flex min-h-9 shrink-0 items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
        >
          <FileUp className="size-4" />
          Import from file
        </Link>
      </div>

      {error ? (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          Could not load your imports. Try again.
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
          <FileUp size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No imports yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const state = importListState(r.status);
            return (
              <Link
                key={r.id}
                href={`/studio/imports/${r.id}`}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0 basis-48">
                  <p className="text-sm font-medium text-foreground break-words">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {r.slug} · {r.level} · {isCourseImportFormat(r.format) ? COURSE_IMPORT_FORMAT_INFO[r.format].label : r.format} ·{" "}
                    <LocalTime iso={r.created_at} />
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${PILL[state.tone]}`}>{state.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
