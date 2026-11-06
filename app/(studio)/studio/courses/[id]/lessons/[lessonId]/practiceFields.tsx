"use client";

import { Plus, X } from "lucide-react";
import { Textarea } from "@/app/components/ui/textarea";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { errorsFor, labelClass } from "./BlockForm";

export function errorList(errors: BlockFieldErrors | undefined, path: string) {
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

export function withExplanation(
  explanations: Record<string, string>,
  id: string,
  text: string,
): Record<string, string> {
  const next = { ...explanations };
  if (text.trim() === "") delete next[id];
  else next[id] = text;
  return next;
}

export function ExplanationField({
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

export function FallbackExplanationField({
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

export function RepeaterErrors({ errors, path }: { errors?: BlockFieldErrors; path: string }) {
  return errorList(errors, path);
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
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

export function RemoveButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
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

export function newId(): string {
  return crypto.randomUUID();
}

// ── selection ──────────────────────────────────────────────────────────────
