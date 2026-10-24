import Link from "next/link";
import { notFound } from "next/navigation";
import { canImportCourse, courseImportMode } from "@/lib/courseImport/access";
import { ImportForm } from "./ImportForm";

// /studio/imports/new — start an import (CNT-019, docs/decisions/0203, 0204). The grant gates the
// page; the upload URL, course_import_create and the commit each check it again. With the kill
// switch off the page says so instead of offering a form every route would refuse.

export const metadata = { title: "Import from file" };

export default async function NewImportPage() {
  if (!(await canImportCourse())) notFound();
  const on = courseImportMode() === "on";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/studio/imports" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          ← Imports
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">Import from file</h1>
        <p className="text-muted-foreground mt-1">
          Turn a document into a draft course. You review it, open a lesson to visitors and publish it yourself.
        </p>
      </div>
      {on ? (
        <ImportForm />
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Course import is switched off right now. Ask the admin when it will be available.
        </div>
      )}
    </div>
  );
}
