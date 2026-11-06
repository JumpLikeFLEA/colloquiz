"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { MatchingElement } from "@/lib/items/matching";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { inputClass } from "./BlockForm";
import { LessonImageUploadButton, type UploadLessonImage } from "./LessonImageUploadButton";
import { RemoveButton, errorList } from "./practiceFields";

export function MatchingElementEditor({
  element,
  onChange,
  onRemove,
  canRemove,
  errors,
  errorPrefix,
  label,
  onUploadImage,
}: {
  element: MatchingElement;
  onChange: (next: MatchingElement) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors?: BlockFieldErrors;
  errorPrefix: string;
  label: string;
  onUploadImage: UploadLessonImage;
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
            <LessonImageUploadButton
              currentUrl={content.src || undefined}
              kind="matching"
              onUploaded={(src) => onChange({ ...element, content: { ...content, src } })}
              onUpload={onUploadImage}
            />
            <div>
              <input
                value={content.src}
                onChange={(e) => onChange({ ...element, content: { ...content, src: e.target.value } })}
                className={inputClass}
                placeholder="Image URL (or upload above)"
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
