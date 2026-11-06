"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { SlotsItem } from "@/lib/items";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { inputClass, labelClass, TextField } from "./BlockForm";
import { AddButton, ExplanationField, FallbackExplanationField, RemoveButton, RepeaterErrors, errorList, newId, withExplanation } from "./practiceFields";

export function SlotsForm({
  item,
  onChange,
  errors,
}: {
  item: SlotsItem;
  onChange: (next: SlotsItem) => void;
  errors?: BlockFieldErrors;
}) {
  const { payload } = item;

  function addGap() {
    const id = newId();
    onChange({ ...item, payload: { ...payload, gaps: [...payload.gaps, { id, acceptedAnswers: [""], explanationRef: id }] } });
  }

  function removeGap(i: number) {
    const gap = payload.gaps[i];
    onChange({
      ...item,
      payload: {
        ...payload,
        gaps: payload.gaps.filter((_, idx) => idx !== i),
        explanations: withExplanation(payload.explanations, gap.id, ""),
      },
    });
  }

  return (
    <div className="space-y-3">
      <TextField label="Prompt" value={payload.prompt} onChange={(prompt) => onChange({ ...item, payload: { ...payload, prompt } })} errors={errors} path="payload.prompt" />
      <p className="text-xs text-muted-foreground -mt-1">Write ___ (three underscores) in the prompt where each gap goes, in the same order as the gaps below.</p>
      <div className="space-y-1">
        <label className={labelClass}>Input affordance</label>
        <Select value={payload.input} onValueChange={(input) => onChange({ ...item, payload: { ...payload, input: input as "typed" | "drag" } })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="typed">Typed</SelectItem>
            <SelectItem value="drag">Drag</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3">
        <label className={labelClass}>Gaps</label>
        {payload.gaps.map((gap, i) => (
          <div key={gap.id} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Gap {i + 1}</span>
              <RemoveButton label={`Remove gap ${i + 1}`} disabled={payload.gaps.length <= 1} onClick={() => removeGap(i)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Accepted answers</label>
              {gap.acceptedAnswers.map((answer, ai) => (
                <div key={ai} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      value={answer}
                      onChange={(e) =>
                        onChange({
                          ...item,
                          payload: {
                            ...payload,
                            gaps: payload.gaps.map((g, idx) =>
                              idx === i
                                ? { ...g, acceptedAnswers: g.acceptedAnswers.map((a, aidx) => (aidx === ai ? e.target.value : a)) }
                                : g,
                            ),
                          },
                        })
                      }
                      className={inputClass}
                    />
                    {errorList(errors, `payload.gaps[${i}].acceptedAnswers[${ai}]`)}
                  </div>
                  <RemoveButton
                    label={`Remove accepted answer ${ai + 1} for gap ${i + 1}`}
                    disabled={gap.acceptedAnswers.length <= 1}
                    onClick={() =>
                      onChange({
                        ...item,
                        payload: {
                          ...payload,
                          gaps: payload.gaps.map((g, idx) => (idx === i ? { ...g, acceptedAnswers: g.acceptedAnswers.filter((_, aidx) => aidx !== ai) } : g)),
                        },
                      })
                    }
                  />
                </div>
              ))}
              <AddButton
                label="Add accepted answer"
                onClick={() =>
                  onChange({
                    ...item,
                    payload: { ...payload, gaps: payload.gaps.map((g, idx) => (idx === i ? { ...g, acceptedAnswers: [...g.acceptedAnswers, ""] } : g)) },
                  })
                }
              />
              <RepeaterErrors errors={errors} path={`payload.gaps[${i}].acceptedAnswers`} />
            </div>
            <ExplanationField
              id={gap.id}
              explanations={payload.explanations}
              onChange={(explanations) => onChange({ ...item, payload: { ...payload, explanations } })}
              errors={errors}
              errorPath="payload.explanations"
            />
          </div>
        ))}
        <AddButton label="Add gap" onClick={addGap} />
        <RepeaterErrors errors={errors} path="payload.gaps" />
      </div>
      <FallbackExplanationField
        value={payload.fallbackExplanation}
        onChange={(fallbackExplanation) => onChange({ ...item, payload: { ...payload, fallbackExplanation } })}
        errors={errors}
        count={payload.gaps.length}
      />
    </div>
  );
}

// ── dispatch ────────────────────────────────────────────────────────────
