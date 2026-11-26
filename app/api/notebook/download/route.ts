import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authUserFrom } from "@/lib/auth";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { parseNotebook } from "@/lib/notebook/parseNotebook";
import { notebookFileName, notebookTextFile } from "@/lib/notebook/textFile";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notebook/download — the caller's notebook as one text file (PROG-019,
 * docs/decisions/0236 section 8, 0243). Built on the server from `my_notebook()` (112), read under
 * the caller's own session, so RLS returns their own rows only; takes no input, so the JWT is the
 * only selector (the account export's rule). Headings follow the saved EN/RU choice. No AI call.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });

  const { data, error } = await supabase.rpc("my_notebook");
  if (error) {
    console.error("notebook download read:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500, headers: NO_STORE });
  }
  const notebook = parseNotebook(data, () => console.error("notebook download: a my_notebook row does not read"));
  if (!notebook) return NextResponse.json({ ok: false, error: "internal" }, { status: 500, headers: NO_STORE });

  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  const now = new Date();
  const body = notebookTextFile({ entries: notebook.entries, summaries: notebook.summaries, lang, now });
  return new NextResponse(new TextEncoder().encode(body), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${notebookFileName(now)}"`,
    },
  });
}
