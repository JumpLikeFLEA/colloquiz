"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, RefreshCw, UserMinus } from "lucide-react";
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
import { joinPath, type JoinLinkState, type LinkedStudent } from "@/lib/teacherLinks";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-001 (docs/decisions/0148) — the teacher's student link and the
// students linked through it or through a run invite. Composed from the
// runs page's classes (invite link block, row cards, AlertDialog confirms);
// no new tokens. Who is a teacher, whether a token resolves and who may
// remove a student are all decided in SQL (076); this only relays.

const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors";
const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors";
const SOURCE_LABEL: Record<LinkedStudent["source"], string> = {
  join_link: "Student link",
  run_invite: "Run invite",
};

function StudentLinksPanelInner({ linkState, students }: { linkState: JoinLinkState; students: LinkedStudent[] }) {
  const router = useRouter();
  // The raw token exists only in this response; it is never stored (076),
  // so a reload hides it and the teacher rotates to see a new one.
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [removing, setRemoving] = useState<LinkedStudent | null>(null);

  async function rotate() {
    setBusy(true);
    try {
      const data = (await postJson("/api/studio/teacher-links", { action: "rotate" })) as { token: string };
      setLink(`${window.location.origin}${joinPath(data.token)}`);
      setCopied(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function remove(student: LinkedStudent) {
    try {
      await postJson("/api/studio/teacher-links", { action: "remove", linkId: student.linkId });
      toast.success("Student removed.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the student.");
    }
  }

  return (
    <section className="space-y-4" data-studio="student-links">
      <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Your student link</h2>
          <p className="text-xs text-muted-foreground mt-1">
            A learner who opens it sees what you will be able to see, and chooses to link. Linked students can be
            grouped, assigned homework and written to, and you see their answers.
          </p>
        </div>
        {link && (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Student link"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
              />
              <button onClick={copy} className={PRIMARY_BUTTON}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              It can&apos;t be shown again once you leave this page, so copy it now.
            </p>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => (linkState.exists ? setConfirmRotate(true) : rotate())}
            disabled={busy}
            className={SECONDARY_BUTTON}
          >
            <RefreshCw className="size-4" />
            {linkState.exists ? "Rotate link" : "Create link"}
          </button>
          {linkState.exists && linkState.rotatedAt && (
            <span className="text-xs text-muted-foreground">
              Current link made <LocalTime iso={linkState.rotatedAt} dateOnly />
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          {students.length === 1 ? "1 linked student" : `${students.length} linked students`}
        </h2>
        {students.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No one has linked to you yet. A learner appears here as soon as they join through your link or claim a run
            invite you made, even before they open a lesson.
          </p>
        ) : (
          <ul className="space-y-2">
            {students.map((student) => (
              <li
                key={student.linkId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground break-all">
                      {student.label || "Unnamed learner"}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-brand-subtle text-brand-text">Linked</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {SOURCE_LABEL[student.source]} · <LocalTime iso={student.linkedAt} dateOnly />
                  </p>
                </div>
                <button
                  onClick={() => setRemoving(student)}
                  className={SECONDARY_BUTTON}
                  aria-label={`Remove ${student.label || "student"}`}
                >
                  <UserMinus className="size-4" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your student link?</AlertDialogTitle>
            <AlertDialogDescription>
              The old link stops working at once. Students already linked stay linked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rotate}>Replace link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.label || "this student"}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer see their answers or scores, and they leave your groups and homework. Their
              conversation with you stays readable to both of you. They can link again with your link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove(removing)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function StudentLinksPanel(props: React.ComponentProps<typeof StudentLinksPanelInner>) {
  return (
    <WriteArea>
      <StudentLinksPanelInner {...props} />
    </WriteArea>
  );
}
