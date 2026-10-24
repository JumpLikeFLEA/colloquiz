import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authUserFrom } from "@/lib/auth";
import type { DeleteBlockingGroup } from "@/lib/accountDelete";
import { removeVoiceObjects } from "@/lib/voice/storage";
import { IMPORT_BUCKET } from "@/lib/courseImport/formats";
import { claudeFromEnv } from "@/lib/courseImport/server";

/**
 * POST /api/account/delete — erase the caller's account by anonymisation
 * (ADR 0002). Same discipline as the export route: NO caller-supplied input.
 * The caller's own JWT is the only selector; RLS and auth.uid() inside the
 * SECURITY DEFINER RPC are the scoping boundary. There is nothing to forge.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Anonymise in one transaction. This also enforces the group-owner block:
    //    it makes no change and reports the blocking groups instead.
    const { data, error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.error("delete_my_account:", error);
      return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
    }

    const result = data as
      | { ok: true; voice_objects?: string[]; import_objects?: string[]; import_files?: string[] }
      | { ok: false; reason: string; groups?: DeleteBlockingGroup[] };

    if (!result.ok) {
      if (result.reason === "owns_groups") {
        // 409: the caller owns a group with other members. Name them so the UI
        // can link the user to transfer ownership or remove members first.
        return NextResponse.json(
          { error: "owns_groups", groups: result.groups ?? [] },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not delete the account." }, { status: 400 });
    }

    // 2) Privileged cleanup with the service role, only AFTER the anonymise
    //    succeeded: remove avatar objects and close sign-in.
    const admin = createAdminClient();

    // Avatar objects live under "<user_id>/…" in the public avatars bucket.
    const { data: objects } = await admin.storage.from("avatars").list(user.id);
    if (objects && objects.length > 0) {
      await admin.storage.from("avatars").remove(objects.map((o) => `${user.id}/${o.name}`));
    }

    // Voice recordings live under "<course_id>/<user_id>/…" in the private
    // voice-recordings bucket, so there is no single prefix to list. The RPC
    // listed every object under the caller's segment, queued it and returned
    // it (migration 060); remove them here. Anything that fails stays queued
    // and the daily purge (app/api/cron/voice-purge) removes it.
    if (result.voice_objects && result.voice_objects.length > 0) {
      const { failed } = await removeVoiceObjects(admin, result.voice_objects);
      if (failed.length > 0) {
        console.error(`account delete: ${failed.length} voice object(s) left queued for the purge`);
      }
    }

    // Course imports (CNT-018, migration 103): the RPC deleted the rows and returned what they
    // held, the uploaded files in the private course-imports bucket and the copies at Anthropic.
    // A bucket object that is not removed here has no row left to name it, so the daily sweep
    // (app/api/cron/course-import-sweep) finds it as an orphan. An Anthropic file that is not
    // deleted has nothing left to find it by: the failure is logged and nothing retries it.
    if (result.import_objects && result.import_objects.length > 0) {
      const { error: removeError } = await admin.storage.from(IMPORT_BUCKET).remove(result.import_objects);
      if (removeError) console.error("account delete: import objects left for the sweep:", removeError.message);
    }
    if (result.import_files && result.import_files.length > 0) {
      if (process.env.ANTHROPIC_API_KEY?.trim()) {
        const claude = claudeFromEnv();
        for (const fileId of result.import_files) {
          if (!(await claude.deleteFile(fileId))) console.error("account delete: an Anthropic import file was not deleted");
        }
      } else {
        console.error("account delete: ANTHROPIC_API_KEY is not set; Anthropic import files were not deleted");
      }
    }

    // Ban far into the future. A hard delete of auth.users fails on the six FKs
    // still pointing at the profile (ADR 0002), so ban is the erasure mechanism:
    // from the user's side the account is gone and sign-in is disabled.
    const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h", // ~100 years
    });
    if (banError) {
      console.error("ban user:", banError);
      return NextResponse.json(
        {
          error:
            "Your data was erased, but closing sign-in failed. Please email privacy@colloquiz.app.",
        },
        { status: 500 },
      );
    }

    // 3) Clear the caller's own session.
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
