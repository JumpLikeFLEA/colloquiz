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
import {
  CALLOUT_VARIANTS,
  SELF_CHECK_RESPONSES,
  type CalloutVariant,
  type InlineContent,
  type SelfCheckResponse,
  type TheoryBlock,
} from "@/lib/lessons";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { InlineEditor } from "./InlineEditor";

// One field-group per theory block type — no raw JSON is ever shown to the
// author (AUTH-002 acceptance). Every block is a z.strictObject
// (theoryBlocks.ts), so each form here writes exactly the fields that
// type's schema declares, nothing more.

export const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none";
export const labelClass = "text-xs font-medium text-muted-foreground";

export function errorsFor(errors: BlockFieldErrors | undefined, path: string): string[] | undefined {
  return errors?.get(path);
}

export function TextField({
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
  const fieldErrors = errorsFor(errors, path);
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {fieldErrors?.map((m, i) => (
        <p key={i} className="text-xs text-destructive-text">
          {m}
        </p>
      ))}
    </div>
  );
}

function InlineField({
  label,
  value,
  onChange,
  errors,
  path,
  placeholder,
}: {
  label: string;
  value: InlineContent;
  onChange: (v: InlineContent) => void;
  errors?: BlockFieldErrors;
  path: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <InlineEditor value={value} onChange={onChange} fieldErrors={errorsFor(errors, path)} placeholder={placeholder} />
    </div>
  );
}

export function BlockForm({
  block,
  onChange,
  errors,
}: {
  block: TheoryBlock;
  onChange: (next: TheoryBlock) => void;
  errors?: BlockFieldErrors;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className={labelClass}>Level</label>
            <Select
              value={String(block.level)}
              onValueChange={(v) => onChange({ ...block, level: v === "2" ? 2 : 1 })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Section</SelectItem>
                <SelectItem value="2">Subheading</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <InlineField
            label="Text"
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
            errors={errors}
            path="text"
          />
        </div>
      );

    case "prose":
      return (
        <InlineField
          label="Text"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          errors={errors}
          path="text"
        />
      );

    case "example":
      return (
        <div className="space-y-3">
          <TextField
            label="Label (optional)"
            value={block.label ?? ""}
            onChange={(label) => onChange({ ...block, label: label || undefined })}
            errors={errors}
            path="label"
            placeholder="Example"
          />
          <InlineField
            label="Text"
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
            errors={errors}
            path="text"
          />
        </div>
      );

    case "callout":
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className={labelClass}>Variant</label>
            <Select value={block.variant} onValueChange={(v) => onChange({ ...block, variant: v as CalloutVariant })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALLOUT_VARIANTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <InlineField
            label="Text"
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
            errors={errors}
            path="text"
          />
        </div>
      );

    case "list":
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={block.ordered} onCheckedChange={(ordered) => onChange({ ...block, ordered })} />
            Ordered
          </label>
          <div className="space-y-2">
            <label className={labelClass}>Items</label>
            {block.items.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <InlineEditor
                    value={item}
                    onChange={(next) =>
                      onChange({ ...block, items: block.items.map((it, idx) => (idx === i ? next : it)) })
                    }
                    fieldErrors={errorsFor(errors, `items[${i}]`)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) })}
                  disabled={block.items.length <= 1}
                  aria-label={`Remove item ${i + 1}`}
                  className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...block, items: [...block.items, [{ text: "" }]] })}
              className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus size={12} />
              Add item
            </button>
          </div>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <TextField
            label="Image URL"
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
            errors={errors}
            path="url"
            placeholder="https://…"
          />
          <p className="text-xs text-muted-foreground -mt-2">
            Pasted URL for now — direct upload lands with AUTH-004.
          </p>
          <TextField
            label="Alt text"
            value={block.alt}
            onChange={(alt) => onChange({ ...block, alt })}
            errors={errors}
            path="alt"
            placeholder="Describes the image for a screen reader"
          />
          <InlineField
            label="Caption (optional)"
            value={block.caption ?? []}
            onChange={(caption) => onChange({ ...block, caption: caption.length > 0 ? caption : undefined })}
            errors={errors}
            path="caption"
          />
        </div>
      );

    case "video":
      return (
        <div className="space-y-3">
          <TextField
            label="YouTube video id"
            value={block.youtubeId}
            onChange={(youtubeId) => onChange({ ...block, youtubeId })}
            errors={errors}
            path="youtubeId"
            placeholder="11-character id, not a URL"
          />
          <InlineField
            label="Caption (optional)"
            value={block.caption ?? []}
            onChange={(caption) => onChange({ ...block, caption: caption.length > 0 ? caption : undefined })}
            errors={errors}
            path="caption"
          />
        </div>
      );

    case "self_check":
      return (
        <div className="space-y-3">
          <InlineField
            label="Prompt"
            value={block.prompt}
            onChange={(prompt) => onChange({ ...block, prompt })}
            errors={errors}
            path="prompt"
          />
          <div className="space-y-1">
            <label className={labelClass}>Response</label>
            <Select
              value={block.response}
              onValueChange={(v) => onChange({ ...block, response: v as SelfCheckResponse })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELF_CHECK_RESPONSES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <InlineField
            label="Model answer"
            value={block.modelAnswer}
            onChange={(modelAnswer) => onChange({ ...block, modelAnswer })}
            errors={errors}
            path="modelAnswer"
          />
          <div className="space-y-2">
            <label className={labelClass}>Checklist (optional)</label>
            {(block.checklist ?? []).map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={line}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      checklist: (block.checklist ?? []).map((l, idx) => (idx === i ? e.target.value : l)),
                    })
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = (block.checklist ?? []).filter((_, idx) => idx !== i);
                    onChange({ ...block, checklist: next.length > 0 ? next : undefined });
                  }}
                  aria-label={`Remove checklist line ${i + 1}`}
                  className="cursor-pointer shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...block, checklist: [...(block.checklist ?? []), ""] })}
              className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus size={12} />
              Add line
            </button>
          </div>
        </div>
      );

    case "table":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className={labelClass}>Header</label>
            {block.header.map((cell, c) => (
              <div key={c} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground pt-2 w-4 shrink-0">{c + 1}</span>
                <div className="flex-1 min-w-0">
                  <InlineEditor
                    value={cell}
                    onChange={(next) =>
                      onChange({
                        ...block,
                        header: block.header.map((h, idx) => (idx === c ? next : h)),
                      })
                    }
                    fieldErrors={errorsFor(errors, `header[${c}]`)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...block,
                      header: block.header.filter((_, idx) => idx !== c),
                      rows: block.rows.map((row) => row.filter((_, idx) => idx !== c)),
                    })
                  }
                  disabled={block.header.length <= 1}
                  aria-label={`Remove column ${c + 1}`}
                  className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...block,
                  header: [...block.header, [{ text: "" }]],
                  rows: block.rows.map((row) => [...row, [{ text: "" }]]),
                })
              }
              className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus size={12} />
              Add column
            </button>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>Rows</label>
            {block.rows.map((row, r) => (
              <div key={r} className="rounded-lg border border-border p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Row {r + 1}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...block, rows: block.rows.filter((_, idx) => idx !== r) })}
                    disabled={block.rows.length <= 1}
                    aria-label={`Remove row ${r + 1}`}
                    className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>
                {row.map((cell, c) => (
                  <InlineEditor
                    key={c}
                    value={cell}
                    onChange={(next) =>
                      onChange({
                        ...block,
                        rows: block.rows.map((rw, ri) => (ri === r ? rw.map((cl, ci) => (ci === c ? next : cl)) : rw)),
                      })
                    }
                  />
                ))}
                {errorsFor(errors, `rows[${r}]`)?.map((m, i) => (
                  <p key={i} className="text-xs text-destructive-text">
                    {m}
                  </p>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({ ...block, rows: [...block.rows, block.header.map(() => [{ text: "" }])] })
              }
              className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus size={12} />
              Add row
            </button>
          </div>

          <InlineField
            label="Caption (optional)"
            value={block.caption ?? []}
            onChange={(caption) => onChange({ ...block, caption: caption.length > 0 ? caption : undefined })}
            errors={errors}
            path="caption"
          />
        </div>
      );

    default:
      return null;
  }
}
