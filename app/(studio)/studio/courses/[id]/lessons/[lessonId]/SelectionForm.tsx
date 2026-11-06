"use client";

import { Switch } from "@/app/components/ui/switch";
import { Checkbox } from "@/app/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import type { SelectionItem } from "@/lib/items";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { inputClass, labelClass, TextField } from "./BlockForm";
import { AddButton, ExplanationField, FallbackExplanationField, RemoveButton, RepeaterErrors, errorList, newId } from "./practiceFields";

export function SelectionForm({
  item,
  onChange,
  errors,
}: {
  item: SelectionItem;
  onChange: (next: SelectionItem) => void;
  errors?: BlockFieldErrors;
}) {
  const { payload } = item;

  function toggleCorrect(optionId: string) {
    if (payload.multi) {
      const next = payload.correctOptionIds.includes(optionId)
        ? payload.correctOptionIds.filter((id) => id !== optionId)
        : [...payload.correctOptionIds, optionId];
      onChange({ ...item, payload: { ...payload, correctOptionIds: next } });
    } else {
      onChange({ ...item, payload: { ...payload, correctOptionIds: [optionId] } });
    }
  }

  return (
    <div className="space-y-3">
      <TextField label="Prompt" value={payload.prompt} onChange={(prompt) => onChange({ ...item, payload: { ...payload, prompt } })} errors={errors} path="payload.prompt" />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Switch
          checked={payload.multi}
          onCheckedChange={(multi) =>
            onChange({
              ...item,
              payload: { ...payload, multi, correctOptionIds: multi ? payload.correctOptionIds : payload.correctOptionIds.slice(0, 1) },
            })
          }
        />
        Multiple correct answers (off = single choice / True-False)
      </label>
      <div className="space-y-2">
        <label className={labelClass}>Options</label>
        {payload.multi ? (
          payload.options.map((option, i) => (
            <div key={option.id} className="flex items-start gap-2">
              <Checkbox
                checked={payload.correctOptionIds.includes(option.id)}
                onCheckedChange={() => toggleCorrect(option.id)}
                className="mt-2"
                aria-label={`Option ${i + 1} correct`}
              />
              <div className="flex-1 min-w-0">
                <input
                  value={option.text}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      payload: {
                        ...payload,
                        options: payload.options.map((o, idx) => (idx === i ? { ...o, text: e.target.value } : o)),
                      },
                    })
                  }
                  className={inputClass}
                />
                {errorList(errors, `payload.options[${i}].text`)}
              </div>
              <RemoveButton
                label={`Remove option ${i + 1}`}
                disabled={payload.options.length <= 2}
                onClick={() =>
                  onChange({
                    ...item,
                    payload: {
                      ...payload,
                      options: payload.options.filter((_, idx) => idx !== i),
                      correctOptionIds: payload.correctOptionIds.filter((id) => id !== option.id),
                    },
                  })
                }
              />
            </div>
          ))
        ) : (
          <RadioGroup
            value={payload.correctOptionIds[0] ?? ""}
            onValueChange={(id) => onChange({ ...item, payload: { ...payload, correctOptionIds: [id] } })}
          >
            {payload.options.map((option, i) => (
              <div key={option.id} className="flex items-start gap-2">
                <RadioGroupItem value={option.id} className="mt-2" aria-label={`Option ${i + 1} correct`} />
                <div className="flex-1 min-w-0">
                  <input
                    value={option.text}
                    onChange={(e) =>
                      onChange({
                        ...item,
                        payload: {
                          ...payload,
                          options: payload.options.map((o, idx) => (idx === i ? { ...o, text: e.target.value } : o)),
                        },
                      })
                    }
                    className={inputClass}
                  />
                  {errorList(errors, `payload.options[${i}].text`)}
                </div>
                <RemoveButton
                  label={`Remove option ${i + 1}`}
                  disabled={payload.options.length <= 2}
                  onClick={() =>
                    onChange({
                      ...item,
                      payload: {
                        ...payload,
                        options: payload.options.filter((_, idx) => idx !== i),
                        correctOptionIds: payload.correctOptionIds.filter((id) => id !== option.id),
                      },
                    })
                  }
                />
              </div>
            ))}
          </RadioGroup>
        )}
        <AddButton
          label="Add option"
          onClick={() =>
            onChange({ ...item, payload: { ...payload, options: [...payload.options, { id: newId(), text: "" }] } })
          }
        />
        <RepeaterErrors errors={errors} path="payload.options" />
        <RepeaterErrors errors={errors} path="payload.correctOptionIds" />
      </div>
      <ExplanationField
        id={payload.explanationRef}
        explanations={payload.explanations}
        onChange={(explanations) => onChange({ ...item, payload: { ...payload, explanations } })}
        errors={errors}
        errorPath="payload.explanations"
      />
      <FallbackExplanationField
        value={payload.fallbackExplanation}
        onChange={(fallbackExplanation) => onChange({ ...item, payload: { ...payload, fallbackExplanation } })}
        errors={errors}
        count={1}
      />
    </div>
  );
}

// ── selection_grid ───────────────────────────────────────────────────────
