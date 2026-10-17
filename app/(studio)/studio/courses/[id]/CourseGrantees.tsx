"use client";

import { useState } from "react";
import Link from "next/link";
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
import { postJson } from "./postJson";
import { LocalTime } from "./LocalTime";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-009 (docs/decisions/0164) — the students this teacher has opened this
// course for, with Close access. Granting happens on a student's page (the
// teacher picks a person, then the course); this is the per-course view of the
// same rows. Composed from the group page's rows and AlertDialog confirm.

const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export type GranteeView = { studentId: string; label: string; grantedAt: string };

function CourseGranteesInner({ courseId, grantees }: { courseId: string; grantees: GranteeView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<GranteeView | null>(null);

  async function revoke(g: GranteeView) {
    setBusy(true);
    try {
      await postJson("/api/studio/course-grants", { action: "revoke", courseId, studentId: g.studentId });
      toast.success("Access closed.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2" data-studio="course-grantees">
      <h2 className="text-sm font-semibold text-foreground">
        Granted access <span className="text-muted-foreground font-normal">({grantees.length})</span>
      </h2>
      {grantees.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          You haven&apos;t opened this course for any student. Open a linked student&apos;s page in Learners to do it.
        </p>
      ) : (
        <ul className="space-y-2">
          {grantees.map((g) => (
            <li
              key={g.studentId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/studio/learners/${g.studentId}`}
                  className="text-sm font-semibold text-foreground break-all hover:underline"
                >
                  {g.label}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Since <LocalTime iso={g.grantedAt} dateOnly />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirm(g)}
                disabled={busy}
                className={SECONDARY_BUTTON}
                aria-label={`Close access for ${g.label}`}
              >
                Close access
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Only students linked to you are listed. A student whose link ended keeps the access they have.
      </p>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close access for {confirm?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              They won&apos;t be able to open this course&apos;s paid lessons any more. You can open it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) void revoke(confirm);
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
export function CourseGrantees(props: React.ComponentProps<typeof CourseGranteesInner>) {
  return (
    <WriteArea>
      <CourseGranteesInner {...props} />
    </WriteArea>
  );
}
