import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COURSE_IMPORT_FORMAT_INFO, IMPORT_BUCKET, checkUpload, importObjectName } from "@/lib/courseImport/formats";
import { parseCourseImportMode } from "@/lib/courseImport/mode";

/**
 * POST /api/studio/imports/upload-url — { fileName, size } -> { ok, objectName, token, contentType }
 * (CNT-018, docs/decisions/0203 Decision 5). The author's file is too big for a Vercel request body
 * (4.5 MB), so the browser uploads it straight to the private course-imports bucket with the
 * signed token this returns.
 *
 * The object name is made here, never taken from the browser: `<user id>/<random>.<ext>`, the
 * first segment being what the bucket's policy checks. The caller is asked can_import_course() on
 * their own session, and the URL is created on that session too, so the bucket's INSERT policy
 * (migration 103: the caller's folder and the grant) applies to the signed upload as well. Nothing
 * is recorded yet: course_import_create (POST /api/studio/imports) starts the import once the
 * upload is done, and an upload never started is removed by the daily sweep.
 */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401, headers });

  if (parseCourseImportMode(process.env.COURSE_IMPORT_MODE) !== "on") {
    return NextResponse.json({ ok: false, error: "Course import is switched off right now." }, { status: 403, headers });
  }

  let body: { fileName?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400, headers });
  }
  if (typeof body.fileName !== "string" || typeof body.size !== "number") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400, headers });
  }
  const check = checkUpload(body.fileName, body.size);
  if (!check.ok) {
    const message =
      check.error === "unsupported_format"
        ? "Upload a PDF, DOCX, Markdown or plain text file."
        : check.error === "too_large"
          ? "The file is larger than 32 MB."
          : "The file is empty.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers });
  }

  const { data: allowed, error: allowedError } = await supabase.rpc("can_import_course");
  if (allowedError) return NextResponse.json({ ok: false, error: "Could not check your access." }, { status: 500, headers });
  if (allowed !== true) {
    return NextResponse.json({ ok: false, error: "You don't have access to course import." }, { status: 403, headers });
  }

  const objectName = importObjectName(user.id, randomUUID(), check.format);
  const { data, error } = await supabase.storage.from(IMPORT_BUCKET).createSignedUploadUrl(objectName);
  if (error || !data) {
    console.error("course import upload url:", error?.message);
    return NextResponse.json({ ok: false, error: "Could not start the upload." }, { status: 500, headers });
  }

  return NextResponse.json(
    { ok: true, objectName, token: data.token, format: check.format, contentType: COURSE_IMPORT_FORMAT_INFO[check.format].contentType },
    { headers },
  );
}
