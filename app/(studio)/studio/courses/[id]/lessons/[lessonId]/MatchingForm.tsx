"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { MatchingItem } from "@/lib/items";
import type { MatchingContent, MatchingElement } from "@/lib/items/matching";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { labelClass, TextField } from "./BlockForm";
import { type UploadLessonImage } from "./LessonImageUploadButton";
import { MatchingElementEditor } from "./MatchingElementEditor";
import { AddButton, ExplanationField, FallbackExplanationField, RemoveButton, RepeaterErrors, newId, withExplanation } from "./practiceFields";

const EMPTY_TEXT_CONTENT: MatchingContent = { kind: "text", text: "" };

export function MatchingForm({
  item,
  onChange,
  errors,
  onUploadImage,
}: {
  item: MatchingItem;
  onChange: (next: MatchingItem) => void;
  errors?: BlockFieldErrors;
  onUploadImage: UploadLessonImage;
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
      <div className="space-y-1">
        <label className={labelClass}>Show as</label>
        <Select
          value={payload.presentation}
          onValueChange={(presentation) =>
            onChange({ ...item, payload: { ...payload, presentation: presentation as "pairs" | "sort" } })
          }
        >
          <SelectTrigger className="w-48" aria-label="Show as">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pairs">Pairs</SelectItem>
            <SelectItem value="sort">Sort into groups</SelectItem>
          </SelectContent>
        </Select>
        {payload.presentation === "sort" && (
          <p className="text-xs text-muted-foreground">
            Left side: the statements to sort. Right side: the groups. Each pair puts a statement in its group.
          </p>
        )}
      </div>
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
              onUploadImage={onUploadImage}
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
              onUploadImage={onUploadImage}
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
