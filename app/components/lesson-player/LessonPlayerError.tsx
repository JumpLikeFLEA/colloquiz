import { AlertTriangle } from "lucide-react";
import type { LessonParseError } from "@/lib/lessons";

/**
 * PLAY-001 acceptance: "An invalid document renders a visible author-facing
 * error, not a crash." Shown to whoever is previewing/authoring the lesson
 * (AUTH-005 wraps this player for that purpose) — every `LessonParseError`
 * already names its block (lib/lessons/parseLessonDocument.ts), so this is a
 * flat list, not a stack trace.
 */
export function LessonPlayerError({ errors }: { errors: readonly LessonParseError[] }) {
  return (
    <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 space-y-2">
      <div className="flex items-center gap-2 text-destructive-text">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <p className="text-sm font-medium">This lesson document has errors and cannot be played.</p>
      </div>
      <ul className="text-sm text-destructive-text list-disc pl-5 space-y-1">
        {errors.map((error, index) => (
          <li key={index}>
            {error.field ? <span className="font-medium">{error.field}: </span> : null}
            {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
