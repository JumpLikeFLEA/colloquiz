"use client";

import { Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Checkbox } from "@/app/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Textarea } from "@/app/components/ui/textarea";
import type {
  Item,
  MatchingItem,
  OrderingItem,
  SelectionGridItem,
  SelectionItem,
  SlotsItem,
} from "@/lib/items";
import type { MatchingContent, MatchingElement } from "@/lib/items/matching";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { errorsFor, inputClass, labelClass, TextField } from "./BlockForm";

// The practice half of the block editor (AUTH-003) — one form per item type,
// mirroring BlockForm.tsx's rule: no raw JSON is ever shown to the author,
// every field maps directly to one of that type's payload fields
// (lib/items/{selection,selectionGrid,ordering,matching,slots}.ts).
//
// explanationRef convention: every sub-part (row/element/pair/gap) form here
// keeps `explanationRef` locked to that sub-part's own `id` — the author
// never sees or edits the ref itself, only an "Explanation" field that reads
// and writes `payload.explanations[id]` directly. This is a UI simplification
// on top of the schema (which allows any ref/key pairing), not a schema
// change: it always produces valid data, and covers every case the form can
// itself create. Imported data whose explanationRef diverges from a sub-part
// id (not produced by this form, only possible via CNT-004 import) still
// round-trips: its ParseError renders as a "payload.explanations"/list-level
// error, the same place a coverage or unused-key error from this form's own
// editing would show.

function errorList(errors: BlockFieldErrors | undefined, path: string) {
  const messages = errorsFor(errors, path);
  if (!messages || messages.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {messages.map((m, i) => (
        <p key={i} className="text-xs text-destructive-text">
          {m}
        </p>
      ))}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  errors,
  path,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  errors?: BlockFieldErrors;
  path: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
      {errorList(errors, path)}
    </div>
  );
}

function explanationOf(explanations: Record<string, string>, id: string): string {
  return explanations[id] ?? "";
}

function withExplanation(
  explanations: Record<string, string>,
  id: string,
  text: string,
): Record<string, string> {
  const next = { ...explanations };
  if (text.trim() === "") delete next[id];
  else next[id] = text;
  return next;
}

function ExplanationField({
  id,
  explanations,
  onChange,
  errors,
  errorPath,
}: {
  id: string;
  explanations: Record<string, string>;
  onChange: (explanations: Record<string, string>) => void;
  errors?: BlockFieldErrors;
  errorPath: string;
}) {
  return (
    <TextAreaField
      label="Explanation (optional — falls back to the item's fallback below)"
      value={explanationOf(explanations, id)}
      onChange={(text) => onChange(withExplanation(explanations, id, text))}
      errors={errors}
      path={errorPath}
      placeholder="Shown to the learner when this part is wrong"
    />
  );
}

function FallbackExplanationField({
  value,
  onChange,
  errors,
  count,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  errors?: BlockFieldErrors;
  count: number;
}) {
  return (
    <div className="space-y-1 pt-2 border-t border-border">
      <p className="text-xs text-muted-foreground">
        {count} part{count === 1 ? "" : "s"} above: give each its own explanation, or set one fallback here to cover
        every part that has none.
      </p>
      <TextAreaField
        label="Fallback explanation (optional)"
        value={value ?? ""}
        onChange={(text) => onChange(text.trim() === "" ? undefined : text)}
        errors={errors}
        path="payload.fallbackExplanation"
      />
    </div>
  );
}

function RepeaterErrors({ errors, path }: { errors?: BlockFieldErrors; path: string }) {
  return errorList(errors, path);
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Plus size={12} />
      {label}
    </button>
  );
}

function RemoveButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 shrink-0 p-1.5 text-muted-foreground hover:text-destructive-text"
    >
      <X size={14} />
    </button>
  );
}

function newId(): string {
  return crypto.randomUUID();
}

// ── selection ──────────────────────────────────────────────────────────────

function SelectionForm({
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

function SelectionGridForm({
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

function OrderingForm({
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

function MatchingElementEditor({
  element,
  onChange,
  onRemove,
  canRemove,
  errors,
  errorPrefix,
  label,
}: {
  element: MatchingElement;
  onChange: (next: MatchingElement) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors?: BlockFieldErrors;
  errorPrefix: string;
  label: string;
}) {
  const content = element.content;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-2">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Select
            value={content.kind}
            onValueChange={(kind) =>
              onChange({
                ...element,
                content:
                  kind === "text"
                    ? { kind: "text", text: content.kind === "text" ? content.text : "" }
                    : { kind: "image", src: "", alt: "" },
              })
            }
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="image">Image</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {content.kind === "text" ? (
          <div>
            <input
              value={content.text}
              onChange={(e) => onChange({ ...element, content: { kind: "text", text: e.target.value } })}
              className={inputClass}
              placeholder="Text"
            />
            {errorList(errors, `${errorPrefix}.content.text`)}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div>
              <input
                value={content.src}
                onChange={(e) => onChange({ ...element, content: { ...content, src: e.target.value } })}
                className={inputClass}
                placeholder="Image URL"
              />
              {errorList(errors, `${errorPrefix}.content.src`)}
            </div>
            <div>
              <input
                value={content.alt}
                onChange={(e) => onChange({ ...element, content: { ...content, alt: e.target.value } })}
                className={inputClass}
                placeholder="Alt text"
              />
              {errorList(errors, `${errorPrefix}.content.alt`)}
            </div>
          </div>
        )}
      </div>
      <RemoveButton label={`Remove ${label.toLowerCase()}`} disabled={!canRemove} onClick={onRemove} />
    </div>
  );
}

const EMPTY_TEXT_CONTENT: MatchingContent = { kind: "text", text: "" };

function MatchingForm({
  item,
  onChange,
  errors,
}: {
  item: MatchingItem;
  onChange: (next: MatchingItem) => void;
  errors?: BlockFieldErrors;
}) {
  const { payload } = item;

  function elementLabel(el: MatchingElement): string {
    return el.content.kind === "text" ? el.content.text || "(empty)" : el.content.alt || "(image)";
  }

  function removeSideElement(side: "left" | "right", i: number) {
    const removedId = payload[side][i].id;
    onChange({
      ...item,
      payload: {
        ...payload,
        [side]: payload[side].filter((_, idx) => idx !== i),
        pairs: payload.pairs.filter((p) => p[side] !== removedId),
      },
    });
  }

  function addPair() {
    const id = newId();
    const left = payload.left[0]?.id ?? "";
    const right = payload.right[0]?.id ?? "";
    onChange({ ...item, payload: { ...payload, pairs: [...payload.pairs, { id, left, right, explanationRef: id }] } });
  }

  function removePair(i: number) {
    const pair = payload.pairs[i];
    onChange({
      ...item,
      payload: {
        ...payload,
        pairs: payload.pairs.filter((_, idx) => idx !== i),
        explanations: withExplanation(payload.explanations, pair.id, ""),
      },
    });
  }

  return (
    <div className="space-y-3">
      <TextField label="Prompt" value={payload.prompt} onChange={(prompt) => onChange({ ...item, payload: { ...payload, prompt } })} errors={errors} path="payload.prompt" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className={labelClass}>Left side</label>
          {payload.left.map((el, i) => (
            <MatchingElementEditor
              key={el.id}
              label="Left"
              element={el}
              canRemove={payload.left.length > 1}
              onChange={(next) => onChange({ ...item, payload: { ...payload, left: payload.left.map((e2, idx) => (idx === i ? next : e2)) } })}
              onRemove={() => removeSideElement("left", i)}
              errors={errors}
              errorPrefix={`payload.left[${i}]`}
            />
          ))}
          <AddButton label="Add left element" onClick={() => onChange({ ...item, payload: { ...payload, left: [...payload.left, { id: newId(), content: EMPTY_TEXT_CONTENT }] } })} />
          <RepeaterErrors errors={errors} path="payload.left" />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Right side</label>
          {payload.right.map((el, i) => (
            <MatchingElementEditor
              key={el.id}
              label="Right"
              element={el}
              canRemove={payload.right.length > 1}
              onChange={(next) => onChange({ ...item, payload: { ...payload, right: payload.right.map((e2, idx) => (idx === i ? next : e2)) } })}
              onRemove={() => removeSideElement("right", i)}
              errors={errors}
              errorPrefix={`payload.right[${i}]`}
            />
          ))}
          <AddButton label="Add right element" onClick={() => onChange({ ...item, payload: { ...payload, right: [...payload.right, { id: newId(), content: EMPTY_TEXT_CONTENT }] } })} />
          <RepeaterErrors errors={errors} path="payload.right" />
        </div>
      </div>
      <div className="space-y-3">
        <label className={labelClass}>Correct pairs (unpaired elements are legal distractors)</label>
        {payload.pairs.map((pair, i) => (
          <div key={pair.id} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Select value={pair.left} onValueChange={(left) => onChange({ ...item, payload: { ...payload, pairs: payload.pairs.map((p, idx) => (idx === i ? { ...p, left } : p)) } })}>
                <SelectTrigger className="flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {payload.left.map((el) => (
                    <SelectItem key={el.id} value={el.id}>
                      {elementLabel(el)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs shrink-0">↔</span>
              <Select value={pair.right} onValueChange={(right) => onChange({ ...item, payload: { ...payload, pairs: payload.pairs.map((p, idx) => (idx === i ? { ...p, right } : p)) } })}>
                <SelectTrigger className="flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {payload.right.map((el) => (
                    <SelectItem key={el.id} value={el.id}>
                      {elementLabel(el)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RemoveButton label={`Remove pair ${i + 1}`} disabled={payload.pairs.length <= 1} onClick={() => removePair(i)} />
            </div>
            <ExplanationField
              id={pair.id}
              explanations={payload.explanations}
              onChange={(explanations) => onChange({ ...item, payload: { ...payload, explanations } })}
              errors={errors}
              errorPath="payload.explanations"
            />
          </div>
        ))}
        <AddButton label="Add pair" onClick={addPair} />
        <RepeaterErrors errors={errors} path="payload.pairs" />
      </div>
      <FallbackExplanationField
        value={payload.fallbackExplanation}
        onChange={(fallbackExplanation) => onChange({ ...item, payload: { ...payload, fallbackExplanation } })}
        errors={errors}
        count={payload.pairs.length}
      />
    </div>
  );
}

// ── slots ───────────────────────────────────────────────────────────────

function SlotsForm({
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

export function PracticeItemForm({
  item,
  onChange,
  errors,
}: {
  item: Item;
  onChange: (next: Item) => void;
  errors?: BlockFieldErrors;
}) {
  switch (item.type) {
    case "selection":
      return <SelectionForm item={item} onChange={onChange} errors={errors} />;
    case "selection_grid":
      return <SelectionGridForm item={item} onChange={onChange} errors={errors} />;
    case "ordering":
      return <OrderingForm item={item} onChange={onChange} errors={errors} />;
    case "matching":
      return <MatchingForm item={item} onChange={onChange} errors={errors} />;
    case "slots":
      return <SlotsForm item={item} onChange={onChange} errors={errors} />;
  }
}
