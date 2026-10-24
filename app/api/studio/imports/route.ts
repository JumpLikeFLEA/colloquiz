import { after, NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CREATE_ERRORS, parseImportCap } from "@/lib/courseImport/caps";
import { parseCourseImportMode } from "@/lib/courseImport/mode";
import { runImportById } from "@/lib/courseImport/server";

/**
 * POST /api/studio/imports — { objectName, format, title, slug, level } -> { ok, importId }
 * (CNT-018, docs/decisions/0203). Starts an import of a file the browser has just uploaded with
 * the URL from .../upload-url.
 *
 * course_import_create (103) is the gate: the grant, the seat, the caller's own folder, the file
 * being there, a free slug, and (through its insert) the daily and monthly caps. This route
 * validates the shape and relays the code as a message. A cap is answered 429 with
 * { error, cap: { kind, retryAt } }.
 *
 * The pipeline runs in after(), once the response is out. The row is the record of where it got
 * to, under a lease; a lost or stalled run is claimed again by the status route
 * (GET .../[id]) and failed by the daily sweep. maxDuration is the platform's 300 s: one run
 * does as many steps as fit in about 130 s and hands over (lib/courseImport/steps.ts).
 */
export const maxDuration = 300;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401, headers });

  if (parseCourseImportMode(process.env.COURSE_IMPORT_MODE) !== "on") {
    return NextResponse.json({ ok: false, error: "Course import is switched off right now." }, { status: 403, headers });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Treated as missing fields below.
  }
  const objectName = str(body.objectName);
  const format = str(body.format);
  const title = str(body.title);
  const slug = str(body.slug);
  const level = str(body.level);
  if (!objectName || !format || !title || !slug || !level) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400, headers });
  }

  const { data, error } = await supabase.rpc("course_import_create", {
    p_object_name: objectName,
    p_format: format,
    p_title: title,
    p_slug: slug,
    p_level: level,
  });
  if (error) {
    const cap = parseImportCap(error);
    if (cap) {
      return NextResponse.json(
        { ok: false, error: "import_cap", cap },
        { status: 429, headers },
      );
    }
    console.error("course_import_create:", error);
    return NextResponse.json({ ok: false, error: "Could not start the import." }, { status: 500, headers });
  }

  const result = (data ?? {}) as { ok?: boolean; error?: string; import_id?: string };
  if (!result.ok || !result.import_id) {
    const known = result.error ? CREATE_ERRORS[result.error] : undefined;
    return NextResponse.json(
      { ok: false, error: known?.message ?? "Could not start the import.", code: result.error ?? "unknown" },
      { status: known?.status ?? 400, headers },
    );
  }

  const importId = result.import_id;
  after(() => runImportById(importId));
  return NextResponse.json({ ok: true, importId }, { headers });
}
