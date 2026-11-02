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
import { postJson } from "./postJson";

/**
 * AUTH-022 (docs/decisions/0214). The confirm for "Duplicate" on a lesson row
 * and on the course editor. SQL decides what is copied and who may (migration
 * 107); this only says it and lands the author on the copy.
 */
export type DuplicateTarget =
  | { kind: "lesson"; courseId: string; lessonId: string; title: string }
  | { kind: "course"; courseId: string; title: string };

export function DuplicateDialog({
  target,
  onClose,
}: {
  target: DuplicateTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!target) return;
    setBusy(true);
    try {
      if (target.kind === "lesson") {
        const data = await postJson(`/api/admin/courses/${target.courseId}/lessons/${target.lessonId}/duplicate`, {});
        toast.success("Lesson duplicated. This is the copy.");
        onClose();
        router.push(`/studio/courses/${target.courseId}/lessons/${data.lessonId}`);
      } else {
        const data = await postJson(`/api/admin/courses/${target.courseId}/duplicate`, {});
        toast.success("Course duplicated. This is the copy.");
        onClose();
        router.push(`/studio/courses/${data.courseId}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate.");
    } finally {
      setBusy(false);
    }
  }

  const isCourse = target?.kind === "course";

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Duplicate {target?.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isCourse
              ? "This makes a new draft course with a copy of each lesson's latest draft and its images. The copy is not published and not listed, and you are its only editor. Nothing about learners is copied: no answers, access, runs, invites, homework or recordings."
              : "This adds a copy of the lesson's latest draft, with its images, at the end of this course. The copy is not published. Nothing about learners is copied."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            className="rounded-xl"
          >
            {busy ? "Duplicating…" : "Duplicate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
