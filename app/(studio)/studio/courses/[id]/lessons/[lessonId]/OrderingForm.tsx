"use client";

import type { OrderingItem } from "@/lib/items";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { inputClass, labelClass, TextField } from "./BlockForm";
import { AddButton, ExplanationField, FallbackExplanationField, RemoveButton, RepeaterErrors, errorList, newId, withExplanation } from "./practiceFields";

export function OrderingForm({
  item,
  onChange,
  errors,
}: {
  item: OrderingItem;
  onChange: (next: OrderingItem) => void;
  errors?: BlockFieldErrors;
}) {
  const { payload } = item;

  function addElement() {
    const id = newId();
    onChange({ ...item, payload: { ...payload, elements: [...payload.elements, { id, text: "", explanationRef: id }] } });
  }

  function removeElement(i: number) {
    const el = payload.elements[i];
    onChange({
      ...item,
      payload: {
        ...payload,
        elements: payload.elements.filter((_, idx) => idx !== i),
        explanations: withExplanation(payload.explanations, el.id, ""),
      },
    });
  }

  function move(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= payload.elements.length) return;
    const next = [...payload.elements];
    [next[i], next[target]] = [next[target], next[i]];
    onChange({ ...item, payload: { ...payload, elements: next } });
  }

  return (
    <div className="space-y-3">
      <TextField label="Prompt" value={payload.prompt} onChange={(prompt) => onChange({ ...item, payload: { ...payload, prompt } })} errors={errors} path="payload.prompt" />
      <p className="text-xs text-muted-foreground -mt-1">Elements are authored in the CORRECT order — no separate answer key.</p>
      <div className="space-y-3">
        <label className={labelClass}>Elements, in correct order</label>
        {payload.elements.map((el, i) => (
          <div key={el.id} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-start gap-2">
              <div className="flex flex-col shrink-0 pt-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move element ${i + 1} up`} className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 text-muted-foreground hover:text-foreground">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === payload.elements.length - 1} aria-label={`Move element ${i + 1} down`} className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 text-muted-foreground hover:text-foreground">
                  ↓
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={el.text}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      payload: { ...payload, elements: payload.elements.map((e2, idx) => (idx === i ? { ...e2, text: e.target.value } : e2)) },
                    })
                  }
                  className={inputClass}
                />
                {errorList(errors, `payload.elements[${i}].text`)}
              </div>
              <RemoveButton label={`Remove element ${i + 1}`} disabled={payload.elements.length <= 2} onClick={() => removeElement(i)} />
            </div>
            <ExplanationField
              id={el.id}
              explanations={payload.explanations}
              onChange={(explanations) => onChange({ ...item, payload: { ...payload, explanations } })}
              errors={errors}
              errorPath="payload.explanations"
            />
          </div>
        ))}
        <AddButton label="Add element" onClick={addElement} />
        <RepeaterErrors errors={errors} path="payload.elements" />
      </div>
      <FallbackExplanationField
        value={payload.fallbackExplanation}
        onChange={(fallbackExplanation) => onChange({ ...item, payload: { ...payload, fallbackExplanation } })}
        errors={errors}
        count={payload.elements.length}
      />
    </div>
  );
}

// ── matching ────────────────────────────────────────────────────────────
