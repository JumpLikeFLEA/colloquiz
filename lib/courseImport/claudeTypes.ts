/**
 * What the pipeline needs from the model, without the SDK (CNT-018): the pipeline is tested
 * with a fake of this, the real one is lib/courseImport/claude.ts.
 */

/** The author's file as the model sees it: a Files API upload (PDF) or text (everything else). */
export type ImportDocument = { kind: "file"; fileId: string } | { kind: "text"; text: string };

export type ImportTurn = { role: "user" | "assistant"; text: string };

/** Stored in course_imports.usage, one entry per model call. Tokens only; what they cost is a calculation. */
export type CallUsage = {
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  effort: "high";
  stopReason: string | null;
  /** The server-side fallback model answered instead of the one asked for. */
  fallbackRan: boolean;
  ms: number;
};

export type ImportAnswer = { text: string; model: string; usage: Omit<CallUsage, "step"> };

export type ImportClaude = {
  /** Uploads once; the id goes into every call of the job and is deleted at the end. */
  uploadFile(input: { bytes: Uint8Array; filename: string; mediaType: string }): Promise<string>;
  /** Never throws: false when the file could not be deleted (the daily sweep tries again). */
  deleteFile(fileId: string): Promise<boolean>;
  /**
   * One model call. `system` is identical across a job and the document comes first in the
   * first user turn, so the file is cached after the first call. `maxTokens` bounds the answer
   * including its thinking.
   */
  converse(input: { system: string; document: ImportDocument; turns: ImportTurn[]; maxTokens: number }): Promise<ImportAnswer>;
};
