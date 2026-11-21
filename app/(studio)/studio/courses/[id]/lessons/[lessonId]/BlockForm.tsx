"use client";

import { useState, type ComponentProps } from "react";
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
  optionalInlineContent,
  type CalloutVariant,
  type InlineContent,
  type SelfCheckResponse,
  type TheoryBlock,
} from "@/lib/lessons";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { RichTextField } from "./RichTextField";
import { LessonAudioUploadButton } from "./LessonAudioUploadButton";

// One field-group per theory block type — no raw JSON is ever shown to the
// author (AUTH-002 acceptance). Every block is a z.strictObject
// (theoryBlocks.ts), so each form here writes exactly the fields that
// type's schema declares, nothing more.

export const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none";
export const labelClass = "text-xs font-medium text-muted-foreground";

/** A plain-text box that takes line breaks and grows with its text
 * (AUTH-025, docs/decisions/0233): practice prompts, options, statements,
 * ordering elements and matching text. `field-sizing: content` grows it
 * where supported; `rows` (one per line) is the fallback. */
export function GrowingTextarea({ className, value, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      value={value}
      rows={String(value ?? "").split("\n").length}
      className={`${inputClass} resize-none field-sizing-content ${className ?? ""}`}
    />
  );
}

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
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  errors?: BlockFieldErrors;
  path: string;
  placeholder?: string;
  /** A growing textarea that takes line breaks (a practice prompt, 0233). */
  multiline?: boolean;
}) {
  const fieldErrors = errorsFor(errors, path);
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      {multiline ? (
        <GrowingTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {fieldErrors?.map((m, i) => (
        <p key={i} className="text-xs text-destructive-text">
          {m}
        </p>
      ))}
    </div>
  );
}

export function InlineField({
  label,
  value,
  onChange,
  errors,
  path,
  placeholder,
  singleLine,
  hint,
}: {
  label: string;
  value: InlineContent;
  onChange: (v: InlineContent) => void;
  errors?: BlockFieldErrors;
  path: string;
  placeholder?: string;
  /** A heading's text: Enter does nothing (docs/decisions/0233). */
  singleLine?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <RichTextField
        value={value}
        onChange={onChange}
        fieldErrors={errorsFor(errors, path)}
        placeholder={placeholder}
        label={label}
        singleLine={singleLine}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Every theory type but `image`, whose form is ImageBlockForm.tsx
 * (docs/decisions/0218): BlockList picks it, so this file and that one don't
 * import each other. */
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
            singleLine
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
      return <ListForm block={block} onChange={onChange} errors={errors} />;

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
            onChange={(caption) => onChange({ ...block, caption: optionalInlineContent(caption) })}
            errors={errors}
            path="caption"
          />
        </div>
      );

    case "audio":
      return (
        <div className="space-y-3">
          <LessonAudioUploadButton onUploaded={(url) => onChange({ ...block, url })} />
          <TextField
            label="Audio URL"
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
            errors={errors}
            path="url"
            placeholder="https://… (or upload above)"
          />
          {block.url && (
            // A plain player, so the author hears the clip before saving.
            <audio controls preload="none" src={block.url} className="w-full" aria-label="Play this clip" />
          )}
          <InlineField
            label="Caption (optional)"
            value={block.caption ?? []}
            onChange={(caption) => onChange({ ...block, caption: optionalInlineContent(caption) })}
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
      return <TableForm block={block} onChange={onChange} errors={errors} />;

    default:
      return null;
  }
}

// Keys for list items, table columns and table rows (AUTH-026,
// docs/decisions/0234 Decision 6). They live in form state only and are never
// stored. An index key lets React hand a removed item's editor, undo history
// included, to the next item; a key that follows the item moves the right
// editor and drops the removed one. If the length changes from outside (a
// version restored), the keys are regenerated.
type RowKeys = { next: number; keys: number[] };
const freshKeys = (n: number, from: number): RowKeys => ({
  next: from + n,
  keys: Array.from({ length: n }, (_, i) => from + i),
});

function useRowKeys(length: number) {
  const [state, setState] = useState<RowKeys>(() => freshKeys(length, 0));
  let current = state;
  if (state.keys.length !== length) {
    current = freshKeys(length, state.next);
    setState(current);
  }
  return {
    keys: current.keys,
    add: () => setState((s) => ({ next: s.next + 1, keys: [...s.keys, s.next] })),
    remove: (i: number) => setState((s) => ({ next: s.next, keys: s.keys.filter((_, idx) => idx !== i) })),
  };
}

type TheoryOf<T extends TheoryBlock["type"]> = Extract<TheoryBlock, { type: T }>;

function ListForm({
  block,
  onChange,
  errors,
}: {
  block: TheoryOf<"list">;
  onChange: (next: TheoryBlock) => void;
  errors?: BlockFieldErrors;
}) {
  const { keys, add, remove } = useRowKeys(block.items.length);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Switch checked={block.ordered} onCheckedChange={(ordered) => onChange({ ...block, ordered })} />
        Ordered
      </label>
      <div className="space-y-2">
        <label className={labelClass}>Items</label>
        {block.items.map((item, i) => (
          <div key={keys[i]} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <RichTextField
                label={`Item ${i + 1}`}
                value={item}
                onChange={(next) =>
                  onChange({ ...block, items: block.items.map((it, idx) => (idx === i ? next : it)) })
                }
                fieldErrors={errorsFor(errors, `items[${i}]`)}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                    remove(i);
                    onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) });
                  }}
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
          onClick={() => {
                add();
                onChange({ ...block, items: [...block.items, [{ text: "" }]] });
              }}
          className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} />
          Add item
        </button>
      </div>
    </div>
  );
}

function TableForm({
  block,
  onChange,
  errors,
}: {
  block: TheoryOf<"table">;
  onChange: (next: TheoryBlock) => void;
  errors?: BlockFieldErrors;
}) {
  const { keys: colKeys, add: addCol, remove: removeCol } = useRowKeys(block.header.length);
  const { keys: rowKeys, add: addRow, remove: removeRow } = useRowKeys(block.rows.length);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={block.collapsed === true}
            onCheckedChange={(on) => onChange({ ...block, collapsed: on ? true : undefined })}
          />
          Hidden until the learner opens it
        </label>
        <p className="text-xs text-muted-foreground">
          Learners see &ldquo;Show the text&rdquo; and open the table when they want, for an audio script
          they should hear before they read.
        </p>
      </div>
      <div className="space-y-2">
        <label className={labelClass}>Header</label>
        {block.header.map((cell, c) => (
          <div key={colKeys[c]} className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground pt-2 w-4 shrink-0">{c + 1}</span>
            <div className="flex-1 min-w-0">
              <RichTextField
                label={`Header ${c + 1}`}
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
              onClick={() => {
                  removeCol(c);
                  onChange({
                    ...block,
                    header: block.header.filter((_, idx) => idx !== c),
                    rows: block.rows.map((row) => row.filter((_, idx) => idx !== c)),
                  });
                }}
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
          onClick={() => {
              addCol();
              onChange({
                ...block,
                header: [...block.header, [{ text: "" }]],
                rows: block.rows.map((row) => [...row, [{ text: "" }]]),
              });
            }}
          className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} />
          Add column
        </button>
      </div>

      <div className="space-y-3">
        <label className={labelClass}>Rows</label>
        {block.rows.map((row, r) => (
          <div key={rowKeys[r]} className="rounded-lg border border-border p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Row {r + 1}</span>
              <button
                type="button"
                onClick={() => {
                      removeRow(r);
                      onChange({ ...block, rows: block.rows.filter((_, idx) => idx !== r) });
                    }}
                disabled={block.rows.length <= 1}
                aria-label={`Remove row ${r + 1}`}
                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            {row.map((cell, c) => (
                              <RichTextField
                  key={colKeys[c] ?? `extra-${c}`}
                label={`Row ${r + 1}, column ${c + 1}`}
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
          onClick={() => {
              addRow();
              onChange({ ...block, rows: [...block.rows, block.header.map(() => [{ text: "" }])] });
            }}
          className="cursor-pointer flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} />
          Add row
        </button>
      </div>

      <InlineField
        label="Caption (optional)"
        value={block.caption ?? []}
        onChange={(caption) => onChange({ ...block, caption: optionalInlineContent(caption) })}
        errors={errors}
        path="caption"
      />
    </div>
  );
}
