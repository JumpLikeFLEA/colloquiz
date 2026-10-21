import { AnalysisStepError, isTransientStatus } from "./errors";
import { VOICE_ANALYSIS_MAX_SECONDS } from "./schema";

/**
 * AssemblyAI over fetch (VOICE-012, docs/decisions/0156 Decision 4, 0182). No SDK: three
 * endpoints, and a dependency would be the fourth thing to keep current.
 *
 * Settings are the ones VOICE-009 measured (0182): the EU endpoint, Universal-3.5 Pro
 * (it keeps false starts; Universal-2 deletes them), `disfluencies: true`, English, and
 * the first 180 s only (Decision 5).
 *
 * What the provider is sent is exactly `buildTranscriptRequest`: an audio URL and
 * settings. No webhook (0182 Decision 6), no learner id, name or email, nothing that
 * would still be at the provider after DELETE (0182 Decision 3). The URL is made by the
 * caller and carries no user id either (pipeline.ts, "staged copy").
 */

export const ASSEMBLYAI_BASE = "https://api.eu.assemblyai.com";
export const STT_MODEL = "universal-3-5-pro";

export type FetchLike = typeof fetch;

export function buildTranscriptRequest(audioUrl: string) {
  return {
    audio_url: audioUrl,
    speech_models: [STT_MODEL],
    disfluencies: true,
    language_code: "en",
    audio_end_at: VOICE_ANALYSIS_MAX_SECONDS * 1000,
  };
}

export type SttTranscript =
  | { status: "processing" }
  | { status: "completed"; text: string; audioSeconds: number | null }
  | { status: "error"; error: string };

type ApiTranscript = {
  id?: string;
  status?: string;
  error?: string | null;
  text?: string | null;
  audio_duration?: number | null;
};

export type SttClient = {
  /** Sends audio bytes to AssemblyAI's own storage. Only for a URL the provider cannot reach. */
  upload(bytes: Uint8Array): Promise<string>;
  /** Starts a job and returns its id. */
  create(audioUrl: string): Promise<string>;
  get(id: string): Promise<SttTranscript>;
  /** Deletes the transcript and checks it is gone (0182 Decision 3). Never throws. */
  delete(id: string): Promise<{ deleted: boolean }>;
};

export function createSttClient(options: { apiKey: string; fetchFn?: FetchLike; baseUrl?: string }): SttClient {
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.baseUrl ?? ASSEMBLYAI_BASE;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetchFn(`${base}${path}`, {
        ...init,
        headers: { authorization: options.apiKey, ...init.headers },
        cache: "no-store",
      });
    } catch {
      throw new AnalysisStepError("AssemblyAI request failed", "stt_network", true);
    }
  }

  async function ok(res: Response, what: string): Promise<Response> {
    if (res.ok) return res;
    // The body is not copied into the error: it can echo request fields.
    throw new AnalysisStepError(`AssemblyAI ${what}: HTTP ${res.status}`, `stt_${what}_${res.status}`, isTransientStatus(res.status));
  }

  return {
    async upload(bytes) {
      const res = await ok(
        await call("/v2/upload", {
          method: "POST",
          body: bytes as unknown as BodyInit,
          headers: { "content-type": "application/octet-stream" },
        }),
        "upload",
      );
      const body = (await res.json()) as { upload_url?: string };
      if (!body.upload_url) throw new AnalysisStepError("AssemblyAI upload gave no URL", "stt_upload_shape", false);
      return body.upload_url;
    },

    async create(audioUrl) {
      const res = await ok(
        await call("/v2/transcript", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildTranscriptRequest(audioUrl)),
        }),
        "create",
      );
      const body = (await res.json()) as ApiTranscript;
      if (!body.id) throw new AnalysisStepError("AssemblyAI create gave no id", "stt_create_shape", false);
      return body.id;
    },

    async get(id) {
      const res = await ok(await call(`/v2/transcript/${encodeURIComponent(id)}`), "get");
      const body = (await res.json()) as ApiTranscript;
      if (body.status === "completed") {
        return { status: "completed", text: body.text ?? "", audioSeconds: body.audio_duration ?? null };
      }
      if (body.status === "error") {
        return { status: "error", error: "job_error" };
      }
      return { status: "processing" };
    },

    async delete(id) {
      try {
        const del = await call(`/v2/transcript/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!del.ok && del.status !== 404) return { deleted: false };
        // 0182: the record stays and its content goes ("Deleted by user.", no words).
        const after = await call(`/v2/transcript/${encodeURIComponent(id)}`);
        if (after.status === 404) return { deleted: true };
        if (!after.ok) return { deleted: false };
        const body = (await after.json()) as ApiTranscript & { words?: unknown[] | null };
        return { deleted: body.text === "Deleted by user." && !body.words };
      } catch {
        return { deleted: false };
      }
    },
  };
}
