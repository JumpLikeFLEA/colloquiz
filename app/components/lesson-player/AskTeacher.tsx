"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircleQuestion } from "lucide-react";
import type { AskTeacherConfig } from "@/lib/askTeacher/options";
import { askTeacherCopy } from "@/lib/alliengll/askTeacherCopy";

/**
 * TCH-006 (docs/decisions/0153) — the "Ask the teacher" link at the foot of an
 * exercise or voice-task card. Only a signed-in student with a teacher who
 * edits the course or assigned it ever renders one (the lesson page decides,
 * from ask_teacher_options, 081, and then renders LinkedLessonPageClient). The
 * dialog behind it is a separate chunk, fetched on the first click.
 */
const AskTeacherDialog = dynamic(() => import("./AskTeacherDialog").then((m) => m.AskTeacherDialog));

export function AskTeacher({
  config,
  document,
  blockId,
  response,
}: {
  config: AskTeacherConfig;
  document: readonly unknown[];
  blockId: string;
  response?: unknown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
      >
        <MessageCircleQuestion className="size-4" aria-hidden="true" />
        {askTeacherCopy.link}
      </button>
      {open && (
        <AskTeacherDialog
          config={config}
          document={document}
          blockId={blockId}
          response={response}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
