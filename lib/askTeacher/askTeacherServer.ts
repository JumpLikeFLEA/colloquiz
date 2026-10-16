import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toAskTeacherOptions, type AskTeacherOption, type AskTeacherRow } from "./options";

/**
 * TCH-006 — the teachers a signed-in student may ask about this lesson
 * (`ask_teacher_options`, 081). Fail-soft on purpose: it runs on the lesson
 * page, so a missing function (081 not yet applied) or a transient error must
 * cost the link, not the lesson. null for an anonymous visitor (no read at
 * all) and for a student nobody qualifies for.
 */
export async function getAskTeacherOptions(
  lessonId: string,
): Promise<{ studentId: string; teachers: AskTeacherOption[] } | null> {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return null;
    const { data, error } = await supabase.rpc("ask_teacher_options", { p_lesson: lessonId });
    if (error) {
      console.error("ask_teacher_options failed", error.message);
      return null;
    }
    const teachers = toAskTeacherOptions(data as AskTeacherRow[] | null);
    return teachers.length > 0 ? { studentId: user.id, teachers } : null;
  } catch (e) {
    console.error("ask_teacher_options threw", e);
    return null;
  }
}
