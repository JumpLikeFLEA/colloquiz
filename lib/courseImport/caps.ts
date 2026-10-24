// Reading a refused import (CNT-018, docs/decisions/0203 Decision 6). The caps live in a BEFORE
// INSERT trigger on course_imports (migration 103); course_import_create inserts into it, so a cap
// trips as a Postgres error with SQLSTATE PT429 that PostgREST turns into HTTP 429. DETAIL says
// which cap, HINT carries the time a place frees up. Matched on the code, never the message
// (the 026/038 rule), the shape of lib/voice/analysisCaps.ts.

export type ImportCapKind = "daily_cap" | "monthly_cap";

export type ImportCap = {
  kind: ImportCapKind;
  /** ISO 8601 UTC time a place frees up; null when the hint is unreadable. */
  retryAt: string | null;
};

type PostgrestErrorLike = { code?: string | null; details?: string | null; hint?: string | null };

export function parseImportCap(error: PostgrestErrorLike | null | undefined): ImportCap | null {
  if (!error || error.code !== "PT429") return null;
  if (error.details !== "daily_cap" && error.details !== "monthly_cap") return null;
  const hint = error.hint ?? "";
  const retryAt = Number.isNaN(Date.parse(hint)) ? null : new Date(hint).toISOString();
  return { kind: error.details, retryAt };
}

/** The sentence the form shows for a cap. `formatTime` renders the retry instant in the viewer's zone. */
export function capMessage(cap: ImportCap, formatTime: (iso: string) => string): string {
  const limit = cap.kind === "daily_cap" ? "3 imports in 24 hours" : "10 imports in 30 days";
  return cap.retryAt
    ? `You have reached the limit of ${limit}. You can import again from ${formatTime(cap.retryAt)}.`
    : `You have reached the limit of ${limit}. Try again later.`;
}

/** What course_import_create answers, as a status and a message for the form. */
export const CREATE_ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "You don't have access to course import." },
  seat_lapsed: { status: 403, message: "Your author seat has ended, so you can't import a course." },
  invalid_title: { status: 400, message: "Enter a title of up to 200 characters." },
  invalid_slug: { status: 400, message: "The slug may use lowercase letters, digits and single hyphens." },
  invalid_level: { status: 400, message: "Choose a level." },
  invalid_format: { status: 400, message: "Upload a PDF, DOCX, Markdown or plain text file." },
  file_missing: { status: 400, message: "The uploaded file was not found. Upload it again." },
  slug_taken: { status: 409, message: "That slug is already used. Choose another." },
};
