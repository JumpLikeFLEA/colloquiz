"use client";

import { useId, useState } from "react";
import { CircleCheck } from "lucide-react";
import { buildAttachment } from "@/lib/askTeacher/snapshot";
import type { AskTeacherConfig } from "@/lib/askTeacher/options";
import { askTeacherCopy as copy, attachmentLabelsEn } from "@/lib/alliengll/askTeacherCopy";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { AttachmentCard } from "@/app/components/messages/AttachmentCard";
import { MessageComposer } from "@/app/components/messages/MessageComposer";
import { SUBMIT_BUTTON_CLASS } from "./practice/practiceClasses";

/**
 * TCH-006 (docs/decisions/0153) — the dialog behind "Ask the teacher": a FROZEN
 * copy of the exercise (and, once the student has checked it, their answer,
 * behind an "Include my answer" toggle), a picker when more than one teacher
 * qualifies, and the message box. The copy is taken when the dialog opens and
 * stored with the message, so a later lesson edit does not change what the
 * teacher sees.
 *
 * AskTeacher.tsx loads this module with `next/dynamic` on the first click, so
 * the composer, the Radix dialog and the snapshot code are not fetched until a
 * student actually asks. Whether the question is allowed, and that the snapshot
 * is genuine, is decided in SQL (081); nothing here is a gate. Sending does not
 * refresh the page: that would re-render the player with a new attemptId
 * (0086).
 */
export function AskTeacherDialog({
  config,
  document,
  blockId,
  response,
  onClose,
}: {
  config: AskTeacherConfig;
  /** The raw lesson document the page was served (what the database compares). */
  document: readonly unknown[];
  blockId: string;
  /** The checked response for this block, once there is one. */
  response?: unknown;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AskBody config={config} document={document} blockId={blockId} response={response} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function AskBody({
  config,
  document,
  blockId,
  response,
  onClose,
}: {
  config: AskTeacherConfig;
  document: readonly unknown[];
  blockId: string;
  response?: unknown;
  onClose: () => void;
}) {
  const radioName = useId();
  // Frozen when the dialog opens: the body mounts with it and unmounts on
  // close, so each opening takes the answer as it stands then.
  const [frozenResponse] = useState(response);
  const [includeAnswer, setIncludeAnswer] = useState(true);
  const [teacherId, setTeacherId] = useState(config.teachers[0].id);
  const [sent, setSent] = useState(false);

  const hasAnswer = frozenResponse !== undefined && frozenResponse !== null;
  const attachment = buildAttachment({
    course: config.course,
    lesson: config.lesson,
    versionId: config.versionId,
    document,
    blockId,
    response: frozenResponse,
    includeAnswer: hasAnswer && includeAnswer,
  });
  const teacher = config.teachers.find((t) => t.id === teacherId) ?? config.teachers[0];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      {sent ? (
        <div role="status" className="flex flex-col items-start gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <CircleCheck className="size-5 text-success" aria-hidden="true" />
            {copy.sentTitle}
          </p>
          <p className="text-sm text-muted-foreground">{copy.sentBody}</p>
          <div className="flex flex-wrap gap-3">
            <a href={`/my/messages/${teacher.id}`} target="_blank" rel="noopener" className={SUBMIT_BUTTON_CLASS}>
              {copy.openMessages}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent"
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : attachment === null ? (
        <p className="text-sm text-muted-foreground">{copy.cantBuild}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {config.teachers.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">{copy.to}</legend>
              {config.teachers.map((t) => (
                <label
                  key={t.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm text-foreground"
                >
                  <input
                    type="radio"
                    name={radioName}
                    value={t.id}
                    checked={t.id === teacherId}
                    onChange={() => setTeacherId(t.id)}
                    className="size-4 accent-brand"
                  />
                  <span className="min-w-0 break-words">{t.label}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{copy.to}: </span>
              <span className="font-medium break-words">{teacher.label}</span>
            </p>
          )}

          {/* A long exercise (eight True/False rows plus their answers) would
              push the message box off a phone's screen, so the copy scrolls
              inside its own box. */}
          <div
            role="region"
            tabIndex={0}
            aria-label={copy.previewLabel}
            className="max-h-60 overflow-y-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <AttachmentCard attachment={attachment} labels={attachmentLabelsEn} linked={false} />
          </div>

          {attachment.kind === "exercise" && (
            <div className="flex flex-col gap-1">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                <input
                  type="checkbox"
                  checked={hasAnswer && includeAnswer}
                  disabled={!hasAnswer}
                  onChange={(e) => setIncludeAnswer(e.target.checked)}
                  className="size-5 accent-brand"
                />
                {copy.includeAnswer}
              </label>
              {!hasAnswer && <p className="text-xs text-muted-foreground">{copy.answerNotChecked}</p>}
            </div>
          )}

          <MessageComposer
            teacherId={teacherId}
            studentId={config.studentId}
            labels={copy.composer}
            attachment={attachment}
            onSent={() => setSent(true)}
          />
        </div>
      )}
    </>
  );
}
