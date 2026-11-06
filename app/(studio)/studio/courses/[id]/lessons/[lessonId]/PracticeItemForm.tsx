"use client";

import type { Item } from "@/lib/items";
import type { BlockFieldErrors } from "@/lib/lessonEditorErrors";
import { type UploadLessonImage } from "./LessonImageUploadButton";
import { MatchingForm } from "./MatchingForm";
import { OrderingForm } from "./OrderingForm";
import { SelectionForm } from "./SelectionForm";
import { SelectionGridForm } from "./SelectionGridForm";
import { SlotsForm } from "./SlotsForm";

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

export function PracticeItemForm({
  item,
  onChange,
  errors,
  onUploadImage,
}: {
  item: Item;
  onChange: (next: Item) => void;
  errors?: BlockFieldErrors;
  onUploadImage: UploadLessonImage;
}) {
  switch (item.type) {
    case "selection":
      return <SelectionForm item={item} onChange={onChange} errors={errors} />;
    case "selection_grid":
      return <SelectionGridForm item={item} onChange={onChange} errors={errors} />;
    case "ordering":
      return <OrderingForm item={item} onChange={onChange} errors={errors} />;
    case "matching":
      return <MatchingForm item={item} onChange={onChange} errors={errors} onUploadImage={onUploadImage} />;
    case "slots":
      return <SlotsForm item={item} onChange={onChange} errors={errors} />;
  }
}
