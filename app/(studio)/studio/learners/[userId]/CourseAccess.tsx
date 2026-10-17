"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { grantAction, grantStateNote, type GrantableCourse } from "@/lib/courseGrants";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-009 (docs/decisions/0164) — open or close a self-paced course for this
// linked student. One row per course the teacher edits; the state and the
// button come from teacher_grantable_courses (087), and the RPC refuses
// anything the button should not have offered. Composed from the group page's
// button classes, row frame and AlertDialog confirm; no new tokens.

const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function CourseAccessInner({
  studentId,
  studentLabel,
  courses,
}: {
  studentId: string;
  studentLabel: string;
  courses: GrantableCourse[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<GrantableCourse | null>(null);

  async function act(course: GrantableCourse, action: "grant" | "revoke") {
    setBusyId(course.courseId);
    try {
      await postJson("/api/studio/course-grants", { action, courseId: course.courseId, studentId });
      toast.success(action === "grant" ? "Access opened." : "Access closed.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2" data-studio="course-access">
      <h2 className="text-sm font-semibold text-foreground">Course access</h2>
      {courses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          You don&apos;t edit a self-paced course yet. Cohort courses are opened with runs and invites.
        </p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => {
            const action = grantAction(c.state);
            const note = grantStateNote(c.state);
            return (
              <li
                key={c.courseId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground break-words min-w-0">{c.title}</span>
                    {c.state === "granted" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text">
                        Access opened
                      </span>
                    )}
                    {!c.published && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Draft</span>
                    )}
                  </div>
                  {c.state === "granted" && c.grantedAt && (
                    <p className="text-xs text-muted-foreground">
                      Since <LocalTime iso={c.grantedAt} dateOnly />
                    </p>
                  )}
                  {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </div>
                {action === "grant" && (
                  <button
                    type="button"
                    onClick={() => act(c, "grant")}
                    disabled={busyId !== null}
                    className={PRIMARY_BUTTON}
                    aria-label={`Open ${c.title} for ${studentLabel}`}
                  >
                    Open access
                  </button>
                )}
                {action === "revoke" && (
                  <button
                    type="button"
                    onClick={() => setConfirm(c)}
                    disabled={busyId !== null}
                    className={SECONDARY_BUTTON}
                    aria-label={`Close ${c.title} for ${studentLabel}`}
                  >
                    Close access
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        For a student who paid you outside the app. Open access shows all of a course&apos;s lessons to them.
      </p>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close access to {confirm?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {studentLabel} won&apos;t be able to open this course&apos;s paid lessons any more. You can open it again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) void act(confirm, "revoke");
                setConfirm(null);
              }}
            >
              Close access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function CourseAccess(props: React.ComponentProps<typeof CourseAccessInner>) {
  return (
    <WriteArea>
      <CourseAccessInner {...props} />
    </WriteArea>
  );
}
