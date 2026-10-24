/**
 * What a course import accepts (CNT-018, docs/decisions/0203 Decision 2): PDF, DOCX, Markdown
 * and plain text, up to 32 MB. The same table is the bucket's allow-list (migration 103), so
 * a type added here needs the migration too. Pure: the client form and the routes import it.
 */

export const COURSE_IMPORT_FORMATS = ["pdf", "docx", "markdown", "text"] as const;
export type CourseImportFormat = (typeof COURSE_IMPORT_FORMATS)[number];

/** The private bucket an upload lands in (migration 103). */
export const IMPORT_BUCKET = "course-imports";

export const COURSE_IMPORT_MAX_BYTES = 32 * 1024 * 1024;

/** The converted text a model is shown, at most. About 200K tokens: a cost guard, not a model limit. */
export const COURSE_IMPORT_MAX_TEXT_CHARS = 800_000;

type FormatInfo = { label: string; extensions: readonly string[]; contentType: string };

export const COURSE_IMPORT_FORMAT_INFO: Record<CourseImportFormat, FormatInfo> = {
  pdf: { label: "PDF", extensions: [".pdf"], contentType: "application/pdf" },
  docx: {
    label: "DOCX",
    extensions: [".docx"],
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  markdown: { label: "Markdown", extensions: [".md", ".markdown"], contentType: "text/markdown" },
  text: { label: "Plain text", extensions: [".txt"], contentType: "text/plain" },
};

export function isCourseImportFormat(value: unknown): value is CourseImportFormat {
  return typeof value === "string" && (COURSE_IMPORT_FORMATS as readonly string[]).includes(value);
}

/** The format a file name's extension says it is, or null. Case-insensitive. */
export function formatFromFileName(fileName: string): CourseImportFormat | null {
  const lower = fileName.trim().toLowerCase();
  for (const format of COURSE_IMPORT_FORMATS) {
    if (COURSE_IMPORT_FORMAT_INFO[format].extensions.some((ext) => lower.endsWith(ext))) return format;
  }
  return null;
}

/** The comma-separated list for an <input accept>. */
export const COURSE_IMPORT_ACCEPT = COURSE_IMPORT_FORMATS.flatMap((f) => COURSE_IMPORT_FORMAT_INFO[f].extensions).join(",");

/** The sentence the upload form states before the picker opens. */
export const COURSE_IMPORT_LIMITS_TEXT = "PDF, DOCX, Markdown or plain text, up to 32 MB.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `<user id>/<random id>.<ext>`: the first segment is what the bucket's policy checks. */
export function importObjectName(userId: string, randomId: string, format: CourseImportFormat): string {
  return `${userId}/${randomId}${COURSE_IMPORT_FORMAT_INFO[format].extensions[0]}`;
}

/** True for a name this module could have made for this user; the create RPC checks the same on its side. */
export function isOwnImportObject(objectName: string, userId: string): boolean {
  const [folder, file, ...rest] = objectName.split("/");
  if (folder !== userId || !file || rest.length > 0) return false;
  const dot = file.lastIndexOf(".");
  return dot > 0 && UUID_RE.test(file.slice(0, dot)) && formatFromFileName(file) !== null;
}

export type UploadCheck = { ok: true; format: CourseImportFormat } | { ok: false; error: "unsupported_format" | "too_large" | "empty" };

/** Checked in the browser before an upload starts and again by the upload-url route. */
export function checkUpload(fileName: string, bytes: number): UploadCheck {
  const format = formatFromFileName(fileName);
  if (!format) return { ok: false, error: "unsupported_format" };
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: "empty" };
  if (bytes > COURSE_IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true, format };
}
