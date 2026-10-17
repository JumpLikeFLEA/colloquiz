"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { HOMEWORK_NOTE_MAX, type AssignableCourse } from "@/lib/homework/homework";
import { GROUP_EXPORT_NOTE } from "@/lib/teacherGroups";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-005 (docs/decisions/0152) — assign a lesson or a whole course to linked
// students and/or groups, with an optional due date and note. Used from the
// course editor (course fixed), a learner's page (student preselected) and a
// group's page (group preselected). The RPC (assign_homework, 080) decides
// everything: this dialog only collects and relays. Composed from the invite
// dialog's classes and the group page's checkbox rows; no new tokens.

const INPUT_CLASS = "px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none";
const WHOLE_COURSE = "whole";
const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export type AssignPerson = { userId: string; label: string };
export type AssignGroup = { id: string; name: string };

export type AssignPreset = { courseId?: string; studentId?: string; groupId?: string };

function AssignHomeworkButtonInner({
  courses,
  students,
  groups,
  preset = {},
  label = "Assign homework",
}: {
  courses: AssignableCourse[];
  students: AssignPerson[];
  groups: AssignGroup[];
  preset?: AssignPreset;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={SECONDARY_BUTTON}>
        <ClipboardList className="size-4" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <AssignHomeworkDialog
          courses={courses}
          students={students}
          groups={groups}
          preset={preset}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AssignHomeworkDialog({
  courses,
  students,
  groups,
  preset,
  onClose,
}: {
  courses: AssignableCourse[];
  students: AssignPerson[];
  groups: AssignGroup[];
  preset: AssignPreset;
  onClose: () => void;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(preset.courseId ?? courses[0]?.id ?? "");
  const [lessonId, setLessonId] = useState(WHOLE_COURSE);
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [pickedStudents, setPickedStudents] = useState<Set<string>>(new Set(preset.studentId ? [preset.studentId] : []));
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set(preset.groupId ? [preset.groupId] : []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const course = courses.find((c) => c.id === courseId) ?? null;
  const noun = lessonId === WHOLE_COURSE ? "course" : "lesson";
  const nothingToPick = students.length === 0 && groups.length === 0;
  const targets = pickedStudents.size + pickedGroups.size;

  const toggle = (set: Set<string>, id: string, write: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  };

  async function assign() {
    setSaving(true);
    setError(null);
    try {
      await postJson("/api/studio/homework", {
        action: "assign",
        courseId,
        lessonId: lessonId === WHOLE_COURSE ? null : lessonId,
        dueOn: dueOn || null,
        note: note.trim() || null,
        studentIds: [...pickedStudents],
        groupIds: [...pickedGroups],
      });
      toast.success("Homework assigned.");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign homework</DialogTitle>
          <DialogDescription>
            A due date is information only: nothing locks, and a lesson done earlier counts as done.
          </DialogDescription>
        </DialogHeader>

        {courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            There is no published lesson to assign yet.
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {!preset.courseId && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">Course</span>
                <Select
                  value={courseId}
                  onValueChange={(v) => {
                    setCourseId(v);
                    setLessonId(WHOLE_COURSE);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Course">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                        {c.edited ? "" : " (catalogue)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">What</span>
              <Select value={lessonId} onValueChange={setLessonId}>
                <SelectTrigger className="w-full" aria-label="Lesson">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_COURSE}>The whole course</SelectItem>
                  {course?.lessons.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.ordinal}. {l.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You will read the answers to the {noun === "course" ? "course's lessons" : "chosen lesson"} for these students, and no others.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="homework-due" className="text-xs font-medium text-foreground">
                Due date (optional)
              </label>
              <input
                id="homework-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className={`${INPUT_CLASS} w-full sm:w-48`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="homework-note" className="text-xs font-medium text-foreground">
                Note (optional)
              </label>
              <textarea
                id="homework-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={HOMEWORK_NOTE_MAX}
                rows={3}
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">
                {note.length} / {HOMEWORK_NOTE_MAX}
              </p>
            </div>

            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs font-medium text-foreground">Who</legend>
              {nothingToPick ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  No one is linked to you yet. Students join through your link on the Learners page.
                </p>
              ) : (
                <div className="rounded-2xl border border-border px-4 py-2">
                  {groups.length > 0 && (
                    <>
                      <p className="pt-1 text-xs font-medium text-muted-foreground">Groups</p>
                      <ul>
                        {groups.map((g) => (
                          <li key={g.id}>
                            <label className="flex min-h-11 cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={pickedGroups.has(g.id)}
                                onChange={() => toggle(pickedGroups, g.id, setPickedGroups)}
                                className="size-4 accent-brand"
                              />
                              <span className="min-w-0 break-all text-sm text-foreground">{g.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="pb-1 text-xs text-muted-foreground">{GROUP_EXPORT_NOTE}</p>
                    </>
                  )}
                  {students.length > 0 && (
                    <>
                      <p className="pt-1 text-xs font-medium text-muted-foreground">Students</p>
                      <ul>
                        {students.map((s) => (
                          <li key={s.userId}>
                            <label className="flex min-h-11 cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={pickedStudents.has(s.userId)}
                                onChange={() => toggle(pickedStudents, s.userId, setPickedStudents)}
                                className="size-4 accent-brand"
                              />
                              <span className="min-w-0 break-all text-sm text-foreground">{s.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A group&apos;s homework also reaches students you add to it later.
              </p>
            </fieldset>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={assign}
            disabled={saving || courses.length === 0 || !courseId || targets === 0}
            className={PRIMARY_BUTTON}
          >
            {saving ? "Assigning…" : "Assign"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function AssignHomeworkButton(props: React.ComponentProps<typeof AssignHomeworkButtonInner>) {
  return (
    <WriteArea>
      <AssignHomeworkButtonInner {...props} />
    </WriteArea>
  );
}
