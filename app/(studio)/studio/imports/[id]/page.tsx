import Link from "next/link";
import { notFound } from "next/navigation";
import { IMPORT_STATUS_COLUMNS, importStatusView, type ImportStatusRow } from "@/lib/courseImport/status";
import { createClient } from "@/lib/supabase/server";
import { ImportProgress } from "./ImportProgress";

// /studio/imports/[id] — one import: its steps while it runs, then the QA report (CNT-019,
// docs/decisions/0204). The first paint is the same view the status route returns
// (importStatusView), and the client polls that route after it. The row is read under the
// owner's session (RLS, migration 103), so another author's id is a 404, as is a malformed one.
// Not gated on the grant: an author whose grant was withdrawn can still read what they ran.

export const metadata = { title: "Import" };

type Row = ImportStatusRow & { title: string; slug: string; level: string };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_imports")
    .select(`${IMPORT_STATUS_COLUMNS}, title, slug, level`)
    .eq("id", id)
    .maybeSingle();
  if (error && error.code !== "22P02") throw error;
  if (!data) notFound();

  const row = data as unknown as Row;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/studio/imports" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          ← Imports
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2 break-words">{row.title}</h1>
        <p className="text-sm text-muted-foreground mt-1 break-words">
          {row.slug} · {row.level}
        </p>
      </div>
      <ImportProgress importId={id} initial={importStatusView(row)} />
    </div>
  );
}
