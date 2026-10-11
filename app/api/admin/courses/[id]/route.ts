import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authUserFrom } from "@/lib/auth";
import { CEFR_LEVELS } from "@/lib/courseLevels";
import { COURSE_SUBTITLE_MAX_LENGTH } from "@/lib/courseCatalogue";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { courseDeleteBlockedMessage, courseImageObjectPaths } from "@/lib/courseDelete";
import { LESSON_IMAGE_BUCKET } from "@/lib/lessonImages";

const UpdateCourseSchema = z.object({
  title: z.string().trim().min(1),
  level: z.enum(CEFR_LEVELS),
  description: z.string().trim().optional(),
  // Nullable, not just optional: the client must be able to explicitly
  // clear a previously-set subtitle/cover, not merely omit it (update_course
  // is a full-record replace — see migration 047).
  subtitle: z.string().trim().max(COURSE_SUBTITLE_MAX_LENGTH).nullable().optional(),
  coverImageUrl: z.string().trim().url().nullable().optional(),
});

// PATCH { title, level, description?, subtitle?, coverImageUrl? } →
// update_course. can_edit_course-gated inside the RPC (admin or a delegated
// editor of this course).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = UpdateCourseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { title, level, description, subtitle, coverImageUrl } = parsed.data;

    const { data, error } = await supabase.rpc("update_course", {
      p_course_id: id,
      p_title: title,
      p_description: description ?? null,
      p_level: level,
      p_subtitle: subtitle ?? null,
      p_cover_image_url: coverImageUrl ?? null,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const DeleteCourseSchema = z.object({ confirmTitle: z.string() });

/** Storage list() page size; a course folder is flat (lib/lessonImages.ts). */
const IMAGE_LIST_PAGE = 1000;

// DELETE { confirmTitle } → delete_course (068): a draft course nobody has
// played (docs/decisions/0125 Decision 8, 0129). SQL decides; a refusal
// names its blockers. Only AFTER the RPC succeeds, the course's
// lesson-images folder is purged with the service role (the account-delete
// precedent): "<courseId>/", checked by courseImageObjectPaths first. A
// failed purge is logged and leaves orphans that
// scripts/sweep-lesson-images.ts reports; the course is already gone, so
// the response is still ok.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = DeleteCourseSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { data, error } = await supabase.rpc("delete_course", {
      p_course_id: id,
      p_confirm_title: parsed.data.confirmTitle,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; blockers?: string[] };
    if (!result.ok) {
      if (result.error === "not_deletable") {
        return NextResponse.json(
          { error: courseDeleteBlockedMessage(result.blockers ?? []), blockers: result.blockers ?? [] },
          { status: 409 },
        );
      }
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    try {
      const bucket = createAdminClient().storage.from(LESSON_IMAGE_BUCKET);
      const paths: string[] = [];
      for (let offset = 0; ; offset += IMAGE_LIST_PAGE) {
        const { data: entries, error: listError } = await bucket.list(id, { limit: IMAGE_LIST_PAGE, offset });
        if (listError) throw listError;
        paths.push(...courseImageObjectPaths(id, entries ?? []));
        if (!entries || entries.length < IMAGE_LIST_PAGE) break;
      }
      if (paths.length > 0) {
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) throw removeError;
      }
    } catch (purgeError) {
      console.error(`delete course ${id}: lesson images not purged`, purgeError);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
