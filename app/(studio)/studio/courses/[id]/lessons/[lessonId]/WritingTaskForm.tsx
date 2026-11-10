"use client";

import { Switch } from "@/app/components/ui/switch";
import type { WritingTaskBlock } from "@/lib/lessons";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { InlineField } from "./BlockForm";

// WRITE-001 (docs/decisions/0225): the writing task's fields — the prompt and
// whether answers go to a teacher. Same field helpers as the voice task form.
export function WritingTaskForm({
  block,
  onChange,
  errors,
}: {
  block: WritingTaskBlock;
  onChange: (next: WritingTaskBlock) => void;
  errors?: BlockFieldErrors;
}) {
  return (
    <div className="space-y-3">
      <InlineField
        label="Prompt"
        value={block.prompt}
        onChange={(prompt) => onChange({ ...block, prompt })}
        errors={errors}
        path="prompt"
        multiline
        hint="Press Enter to start a new line."
      />
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={block.sendToTeacher}
            onCheckedChange={(sendToTeacher) => onChange({ ...block, sendToTeacher })}
          />
          Send answers to the teacher
        </label>
        <p className="text-xs text-muted-foreground">
          Cohort students&rsquo; answers go to the course&rsquo;s authors; a student linked to a teacher who edits
          the course or assigned the lesson sends to that teacher. Everyone else practises: their text stays on their
          device. Until sending is built, every learner practises.
        </p>
      </div>
    </div>
  );
}
