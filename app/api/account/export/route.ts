import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { buildExportPayload, exportFilename, type AuthorSeatExportRow, type CalendarFeedExportRow, type NotebookExport, type TelegramLinkExportRow, type VoiceAnalysisExportRow, type VoiceSubmissionRow, type WritingSubmissionRow } from "@/lib/accountExport";
import { VOICE_BUCKET } from "@/lib/voice/recording";
import { readAccountExportSections } from "@/lib/accountExportReads";

/**
 * GET /api/account/export — the caller's own data, as a downloadable JSON file.
 *
 * SCOPING: every query goes through PostgREST with the caller's own token, so
 * RLS is what actually confines the export to one user. The explicit
 * .eq("user_id", …) filters are belt-and-braces (and keep the owner indexes in
 * play) — never the security boundary. Nothing here uses the service role.
 *
 * SYNCHRONOUS on purpose. This is five indexed, owner-scoped reads over tables
 * that are small per user — notifications self-cap at 50 rows, achievements at
 * the size of the catalogue, and results at one row per quiz taken. There is no
 * join fan-out and no per-row work. Queuing this to a job runner would add a
 * store, a status endpoint and a delivery mechanism to save a few hundred
 * milliseconds. PostgREST cuts one response at max_rows without an error, so
 * every set is read in pages (lib/accountExportReads.ts, OPS-044,
 * docs/decisions/0250).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit BEFORE the reads. Logging the request is what the trigger
    // counts (migration 038); a PT429 from that trigger is the cap tripping.
    // No .select() chained — account_export_log has no owner SELECT policy, so
    // asking for the row back would fail (same as the feedback insert).
    const { error: logError } = await supabase
      .from("account_export_log")
      .insert({ user_id: user.id });
    if (logError) {
      if (logError.code === "PT429") {
        const { data: quota } = await supabase.rpc("account_export_quota");
        const resetsAt =
          quota && typeof quota === "object" && "resets_at" in quota
            ? (quota.resets_at as string | null)
            : null;
        const retryAfterSeconds = resetsAt
          ? Math.max(1, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000))
          : null;
        return NextResponse.json(
          {
            error:
              "You've exported your data several times in the last hour. " +
              "Please try again a little later.",
            retryAfterSeconds,
          },
          {
            status: 429,
            ...(retryAfterSeconds
              ? { headers: { "Retry-After": String(retryAfterSeconds) } }
              : {}),
          },
        );
      }
      console.error("account export log insert failed", logError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Every set is read in pages past PostgREST's max_rows (OPS-044, docs/decisions/0250).
    const sections = await readAccountExportSections(supabase, user.id);
    if (!sections.ok) {
      return NextResponse.json({ error: sections.message }, { status: 500 });
    }
    const { profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes, voiceAnalysesRes, writingRes, notebookRes } = sections;

    // my_notebook() always returns both lists; anything else is a failed section, not an empty one.
    const notebook = notebookRes.data as NotebookExport | null;
    if (!Array.isArray(notebook?.entries) || !Array.isArray(notebook.summaries)) {
      return NextResponse.json({ error: "Could not read the notebook." }, { status: 500 });
    }

    // A copy of each take's audio (privacy-policy.md section 8), downloaded
    // under the caller's own session: the bucket's SELECT policy is the
    // boundary, as RLS is for the rows. One at a time, to bound memory; a
    // learner has a handful of takes per run. A failed download fails the
    // export, for the same reason a failed section does.
    const voiceRows = (voiceRes.data ?? []) as (VoiceSubmissionRow & { object_name: string | null })[];
    const voiceAudio: Record<string, string> = {};
    for (const row of voiceRows) {
      if (!row.object_name) continue;
      const { data: blob, error: dlError } = await supabase.storage.from(VOICE_BUCKET).download(row.object_name);
      if (dlError || !blob) {
        return NextResponse.json({ error: "Could not copy a voice recording." }, { status: 500 });
      }
      voiceAudio[row.id] = Buffer.from(await blob.arrayBuffer()).toString("base64");
    }

    const now = new Date();
    const payload = buildExportPayload(
      {
        accountId: user.id,
        email: user.email,
        exportedAt: now,
        profile: profileRes.data ?? null,
        results: resultsRes.data ?? [],
        achievements: achievementsRes.data ?? [],
        memberships: membershipsRes.data ?? [],
        duels: duelsRes.data ?? [],
        lessonAttempts: lessonAttemptsRes.data ?? [],
        signupAcquisition: acquisitionRes.data ?? null,
        lessonOpens: lessonOpensRes.data ?? [],
        courseEntitlements: entitlementsRes.data ?? [],
        runEnrolments: enrolmentsRes.data ?? [],
        claimedInvites: invitesRes.data ?? [],
        voiceSubmissions: voiceRows,
        voiceAudio,
        finalComments: finalCommentsRes.data ?? [],
        writingSubmissions: (writingRes.data ?? []) as unknown as WritingSubmissionRow[],
        teacherLinks: teacherLinksRes.data ?? [],
        teacherGroups: teacherGroupsRes.data ?? [],
        conversations: conversationsRes.data ?? [],
        homework: homeworkRes.data ?? [],
        authorSeat: ((authorSeatRes.data ?? []) as AuthorSeatExportRow[])[0] ?? null,
        calendarFeed: ((calendarFeedRes.data ?? []) as CalendarFeedExportRow[])[0] ?? null,
        telegramLink: ((telegramLinkRes.data ?? []) as TelegramLinkExportRow[])[0] ?? null,
        notebook,
        voiceAnalyses: (voiceAnalysesRes.data ?? []) as VoiceAnalysisExportRow[],
      },
      ACHIEVEMENTS,
    );

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(now)}"`,
        // Personal data: never let a shared cache or the browser keep a copy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
