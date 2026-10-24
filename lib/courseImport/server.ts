import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createImportClaude } from "./claude";
import type { ImportClaude } from "./claudeTypes";
import { IMPORT_BUCKET } from "./formats";
import { parseCourseImportMode } from "./mode";
import {
  runCourseImport,
  type ClaimResult,
  type CommitResult,
  type ImportFiles,
  type ImportRow,
  type ImportStore,
  type PipelineDeps,
  type PipelineOutcome,
} from "./pipeline";
import { promptBody, promptFileName, type ImportPromptName } from "./request";

/**
 * The real dependencies of pipeline.ts (CNT-018, docs/decisions/0203): the service-role client
 * for the state machine and Storage, and Claude over its own client. Server only: it holds the
 * service role and the Anthropic key.
 */

const PROMPT_DIR = join(process.cwd(), "prompts", "course-import");
const promptCache = new Map<ImportPromptName, string>();

/** Read from the repo's prompts/ folder, which next.config's outputFileTracingIncludes ships with the routes. */
export async function readPrompt(name: ImportPromptName): Promise<string> {
  const cached = promptCache.get(name);
  if (cached) return cached;
  const text = promptBody(await readFile(join(PROMPT_DIR, promptFileName(name)), "utf8"));
  promptCache.set(name, text);
  return text;
}

function rpcFailed(name: string, error: { message: string }): never {
  throw new Error(`${name}: ${error.message}`);
}

export function createImportStore(admin: SupabaseClient): ImportStore {
  return {
    async claim(id, leaseSeconds): Promise<ClaimResult> {
      const { data, error } = await admin.rpc("course_import_claim", { p_id: id, p_lease_seconds: leaseSeconds });
      if (error) rpcFailed("course_import_claim", error);
      const r = data as { claimed: boolean; status?: string; row?: ImportRow };
      return r.claimed && r.row ? { claimed: true, row: r.row } : { claimed: false, status: r.status ?? "missing" };
    },

    async advance(id, status, patch, leaseSeconds) {
      const { data, error } = await admin.rpc("course_import_advance", {
        p_id: id,
        p_status: status,
        p_patch: patch,
        p_lease_seconds: leaseSeconds,
      });
      if (error) rpcFailed("course_import_advance", error);
      return data === true;
    },

    async release(id) {
      const { error } = await admin.rpc("course_import_release", { p_id: id });
      if (error) rpcFailed("course_import_release", error);
    },

    async fail(id, code) {
      const { data, error } = await admin.rpc("course_import_fail", { p_id: id, p_failure: code });
      if (error) rpcFailed("course_import_fail", error);
      return data === true;
    },

    async commit(id, course): Promise<CommitResult> {
      const { data, error } = await admin.rpc("course_import_commit", { p_id: id, p_course: course });
      if (error) rpcFailed("course_import_commit", error);
      const r = data as { ok: boolean; error?: string; course_id?: string };
      return r.ok && r.course_id ? { ok: true, courseId: r.course_id } : { ok: false, error: r.error ?? "invalid_course" };
    },

    async cleaned(id) {
      const { error } = await admin.rpc("course_import_cleaned", { p_ids: [id] });
      if (error) rpcFailed("course_import_cleaned", error);
    },
  };
}

export function createImportFiles(admin: SupabaseClient): ImportFiles {
  return {
    async read(objectName) {
      const { data, error } = await admin.storage.from(IMPORT_BUCKET).download(objectName);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(objectName) {
      try {
        const { error } = await admin.storage.from(IMPORT_BUCKET).remove([objectName]);
        if (error) console.error("course import: object not removed:", error.message);
        return !error;
      } catch (e) {
        console.error("course import: object not removed:", e);
        return false;
      }
    },
  };
}

export function claudeFromEnv(env: Record<string, string | undefined> = process.env): ImportClaude {
  return createImportClaude({ apiKey: env.ANTHROPIC_API_KEY?.trim() });
}

/** Builds the real pipeline. In `on`, a missing key is a loud configuration error, not a silent failure. */
export function createPipelineDeps(env: Record<string, string | undefined> = process.env): PipelineDeps {
  const mode = parseCourseImportMode(env.COURSE_IMPORT_MODE);
  if (mode === "on" && !env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("COURSE_IMPORT_MODE is on but ANTHROPIC_API_KEY is not set");
  }
  const admin = createAdminClient();
  return {
    mode,
    store: createImportStore(admin),
    files: createImportFiles(admin),
    claude: claudeFromEnv(env),
    prompt: readPrompt,
    now: () => Date.now(),
  };
}

/**
 * What the routes call from `after()`: never throws, and says what happened in the log. The log
 * is only a convenience (runtime logs drop lines written after the response); the row is the
 * record.
 */
export async function runImportById(id: string): Promise<PipelineOutcome | null> {
  try {
    const outcome = await runCourseImport(id, createPipelineDeps());
    if (outcome.kind === "failed" || outcome.kind === "retry") {
      console.error(`course import ${id}: ${outcome.kind} ${outcome.code}`);
    }
    return outcome;
  } catch (e) {
    console.error(`course import ${id}:`, e);
    return null;
  }
}
