import { describe, expect, it } from "vitest";
import { AnalysisStepError } from "./errors";
import { buildTranscriptRequest, createSttClient, type FetchLike } from "./assemblyai";

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function fakeFetch(responses: (Response | Error)[]): { fetchFn: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      headers: init.headers as Record<string, string>,
    });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as FetchLike;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("buildTranscriptRequest", () => {
  it("is exactly the measured settings, and nothing else", () => {
    expect(buildTranscriptRequest("https://x.example/a.webm")).toEqual({
      audio_url: "https://x.example/a.webm",
      speech_models: ["universal-3-5-pro"],
      disfluencies: true,
      language_code: "en",
      audio_end_at: 180000,
    });
  });
});

describe("createSttClient", () => {
  it("creates a job on the EU endpoint with the key and the request", async () => {
    const { fetchFn, calls } = fakeFetch([json({ id: "job-1", status: "queued" })]);
    const id = await createSttClient({ apiKey: "k", fetchFn }).create("https://x.example/a.webm");
    expect(id).toBe("job-1");
    expect(calls[0].url).toBe("https://api.eu.assemblyai.com/v2/transcript");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.authorization).toBe("k");
    expect(calls[0].body).toEqual(buildTranscriptRequest("https://x.example/a.webm"));
  });

  it("reads a job as processing, completed or error", async () => {
    const { fetchFn } = fakeFetch([
      json({ status: "processing" }),
      json({ status: "completed", text: "hello uh world", audio_duration: 61.2 }),
      json({ status: "error", error: "no spoken audio in <the learner's words>" }),
    ]);
    const stt = createSttClient({ apiKey: "k", fetchFn });
    expect(await stt.get("j")).toEqual({ status: "processing" });
    expect(await stt.get("j")).toEqual({ status: "completed", text: "hello uh world", audioSeconds: 61.2 });
    // The provider's error text is not carried: it could quote the speech.
    expect(await stt.get("j")).toEqual({ status: "error", error: "job_error" });
  });

  it("classifies an HTTP failure: 429 and 5xx are transient, 400 and 401 are not", async () => {
    const { fetchFn } = fakeFetch([json({}, 429), json({}, 503), json({}, 400), json({}, 401)]);
    const stt = createSttClient({ apiKey: "k", fetchFn });
    const outcomes: (boolean | string)[] = [];
    for (let i = 0; i < 4; i++) {
      try {
        await stt.create("u");
        outcomes.push("no error");
      } catch (e) {
        outcomes.push(e instanceof AnalysisStepError ? e.transient : "other");
      }
    }
    expect(outcomes).toEqual([true, true, false, false]);
  });

  it("a network failure is transient", async () => {
    const { fetchFn } = fakeFetch([new TypeError("fetch failed")]);
    await expect(createSttClient({ apiKey: "k", fetchFn }).get("j")).rejects.toMatchObject({
      transient: true,
      code: "stt_network",
    });
  });

  it("delete: DELETE, then a GET that shows the content gone, counts as deleted", async () => {
    const { fetchFn, calls } = fakeFetch([
      json({ status: "completed" }),
      json({ status: "completed", text: "Deleted by user.", words: null }),
    ]);
    expect(await createSttClient({ apiKey: "k", fetchFn }).delete("job-1")).toEqual({ deleted: true });
    expect(calls.map((c) => c.method)).toEqual(["DELETE", "GET"]);
  });

  it("delete: a 404 afterwards counts as deleted; surviving text does not", async () => {
    const gone = fakeFetch([json({}), json({}, 404)]);
    expect(await createSttClient({ apiKey: "k", fetchFn: gone.fetchFn }).delete("j")).toEqual({ deleted: true });
    const kept = fakeFetch([json({}), json({ status: "completed", text: "still here", words: [{}] })]);
    expect(await createSttClient({ apiKey: "k", fetchFn: kept.fetchFn }).delete("j")).toEqual({ deleted: false });
  });

  it("delete never throws: a failed DELETE and a network error are both 'not deleted'", async () => {
    const failed = fakeFetch([json({}, 500)]);
    expect(await createSttClient({ apiKey: "k", fetchFn: failed.fetchFn }).delete("j")).toEqual({ deleted: false });
    const down = fakeFetch([new TypeError("fetch failed")]);
    expect(await createSttClient({ apiKey: "k", fetchFn: down.fetchFn }).delete("j")).toEqual({ deleted: false });
  });
});
