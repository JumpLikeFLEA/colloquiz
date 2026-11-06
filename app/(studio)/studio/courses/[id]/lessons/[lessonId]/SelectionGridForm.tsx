"use client";

import { Switch } from "@/app/components/ui/switch";
import type { SelectionGridItem } from "@/lib/items";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { inputClass, labelClass, TextField } from "./BlockForm";
import { AddButton, ExplanationField, FallbackExplanationField, RemoveButton, RepeaterErrors, errorList, newId, withExplanation } from "./practiceFields";

export function SelectionGridForm({
  item,
  onChange,
  errors,
}: {
  item: SelectionGridItem;
  onChange: (next: SelectionGridItem) => void;
  errors?: BlockFieldErrors;
}) {
  const { payload } = item;

  function addRow() {
    const id = newId();
    onChange({
      ...item,
      payload: { ...payload, rows: [...payload.rows, { id, statement: "", correct: true, explanationRef: id }] },
    });
  }

  function removeRow(i: number) {
    const row = payload.rows[i];
    onChange({
      ...item,
      payload: {
        ...payload,
        rows: payload.rows.filter((_, idx) => idx !== i),
        explanations: withExplanation(payload.explanations, row.id, ""),
      },
    });
  }

  return (
    <div className="space-y-3">
      <TextField label="Prompt" value={payload.prompt} onChange={(prompt) => onChange({ ...item, payload: { ...payload, prompt } })} errors={errors} path="payload.prompt" />
      <div className="space-y-3">
        <label className={labelClass}>Rows</label>
        {payload.rows.map((row, i) => (
          <div key={row.id} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <input
                  value={row.statement}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      payload: {
                        ...payload,
                        rows: payload.rows.map((r, idx) => (idx === i ? { ...r, statement: e.target.value } : r)),
                      },
                    })
                  }
                  placeholder="Statement"
                  className={inputClass}
                />
                {errorList(errors, `payload.rows[${i}].statement`)}
              </div>
              <RemoveButton label={`Remove row ${i + 1}`} disabled={payload.rows.length <= 1} onClick={() => removeRow(i)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch
                checked={row.correct}
                onCheckedChange={(correct) =>
                  onChange({ ...item, payload: { ...payload, rows: payload.rows.map((r, idx) => (idx === i ? { ...r, correct } : r)) } })
                }
              />
              Statement is true
            </label>
            <ExplanationField
              id={row.id}
              explanations={payload.explanations}
              onChange={(explanations) => onChange({ ...item, payload: { ...payload, explanations } })}
              errors={errors}
              errorPath="payload.explanations"
            />
          </div>
        ))}
        <AddButton label="Add row" onClick={addRow} />
        <RepeaterErrors errors={errors} path="payload.rows" />
      </div>
      <FallbackExplanationField
        value={payload.fallbackExplanation}
        onChange={(fallbackExplanation) => onChange({ ...item, payload: { ...payload, fallbackExplanation } })}
        errors={errors}
        count={payload.rows.length}
      />
    </div>
  );
}

// ── ordering ────────────────────────────────────────────────────────────
