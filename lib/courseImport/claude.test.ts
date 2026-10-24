import { describe, expect, it } from "vitest";
import { buildMessages, courseImportModel, createImportClaude, DEFAULT_COURSE_IMPORT_MODEL } from "./claude";
import { ImportStepError } from "./errors";

type Seen = { url: string; method: string; headers: Headers; body: unknown };

function fakeFetch(res: (seen: Seen) => Response) {
  const requests: Seen[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const seen: Seen = {
      url: String(url),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : init.body,
    };
    requests.push(seen);
    return res(seen);
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

function sse(events: { event: string; data: unknown }[]): Response {
  const text = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A streamed answer in the API's event order, text split across two deltas. */
function stream(opts: { text?: string; stopReason?: string; usage?: Record<string, unknown> } = {}): Response {
  const text = opts.text ?? '{"lessons":[]}';
  const half = Math.floor(text.length / 2);
  return sse([
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 400, output_tokens: 1, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0, ...opts.usage },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, half) } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(half) } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: opts.stopReason ?? "end_turn", stop_sequence: null },
        usage: { output_tokens: 900 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ]);
}

const error = (status: number) =>
  new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "nope" } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const input = {
  system: "Drafting rules.",
  document: { kind: "text" as const, text: "Section A" },
  turns: [{ role: "user" as const, text: "Plan the course." }],
  maxTokens: 16_000,
};

describe("courseImportModel", () => {
  it("reads COURSE_IMPORT_MODEL, trimmed, and falls back to claude-opus-5-5", () => {
    expect(courseImportModel({ COURSE_IMPORT_MODEL: " claude-x " })).toBe("claude-x");
    expect(courseImportModel({})).toBe(DEFAULT_COURSE_IMPORT_MODEL);
    expect(courseImportModel({ COURSE_IMPORT_MODEL: "  " })).toBe("claude-opus-5-5");
  });
});

describe("buildMessages", () => {
  it("leads the first user turn with the cached document, then the text", () => {
    const m = buildMessages({ kind: "file", fileId: "file_1" }, [{ role: "user", text: "Go." }]);
    expect(m).toEqual([
      {
        role: "user",
        content: [
          { type: "document", source: { type: "file", file_id: "file_1" }, cache_control: { type: "ephemeral" } },
          { type: "text", text: "Go." },
        ],
      },
    ]);
  });

  it("sends a text source as a text/plain document and later turns as plain text", () => {
    const m = buildMessages({ kind: "text", text: "Section A" }, [
      { role: "user", text: "Go." },
      { role: "assistant", text: "Here." },
      { role: "user", text: "Fix it." },
    ]);
    expect((m[0].content as { source: unknown }[])[0].source).toEqual({ type: "text", media_type: "text/plain", data: "Section A" });
    expect(m[1]).toEqual({ role: "assistant", content: "Here." });
    expect(m[2]).toEqual({ role: "user", content: "Fix it." });
  });
});

describe("createImportClaude", () => {
  it("is lazy: building one needs no key and makes no request", () => {
    const { fetchFn, requests } = fakeFetch(() => stream());
    createImportClaude({ fetchFn });
    expect(requests).toHaveLength(0);
  });

  it("streams, asks for the model, effort high, the fallback and both betas, and joins the text deltas", async () => {
    const { fetchFn, requests } = fakeFetch(() => stream({ text: '{"lessons":[{"slug":"a"}]}' }));
    const out = await createImportClaude({ apiKey: "k", model: "claude-opus-5-5", fetchFn }).converse(input);

    expect(out.text).toBe('{"lessons":[{"slug":"a"}]}');
    expect(out.model).toBe("claude-opus-5-5");
    expect(requests).toHaveLength(1);
    const body = requests[0].body as {
      model: string;
      stream: boolean;
      max_tokens: number;
      system: { text: string; cache_control: { type: string } }[];
      output_config: { effort: string };
      fallbacks: unknown;
    };
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(16_000);
    expect(body.system).toEqual([{ type: "text", text: "Drafting rules.", cache_control: { type: "ephemeral" } }]);
    expect(body.output_config.effort).toBe("high");
    expect(body.fallbacks).toBe("default");
    const betas = requests[0].headers.get("anthropic-beta") ?? "";
    expect(betas).toContain("files-api-2025-04-14");
    expect(betas).toContain("server-side-fallback-2026-07-01");
  });

  it("reports tokens, cache use and the stop reason", async () => {
    const { fetchFn } = fakeFetch(() => stream());
    const out = await createImportClaude({ apiKey: "k", fetchFn }).converse(input);
    expect(out.usage).toMatchObject({
      inputTokens: 400,
      outputTokens: 900,
      cacheWriteTokens: 3000,
      cacheReadTokens: 0,
      effort: "high",
      stopReason: "end_turn",
      fallbackRan: false,
    });
  });

  it("a refusal fails the job, without reading the text", async () => {
    const { fetchFn } = fakeFetch(() => stream({ text: "I cannot", stopReason: "refusal" }));
    const err = await createImportClaude({ apiKey: "k", fetchFn }).converse(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportStepError);
    expect(err).toMatchObject({ code: "llm_refusal", transient: false });
    // It was paid for: its usage travels to the ledger (0207 Decision 4).
    expect(err).toMatchObject({
      spent: { model: "claude-opus-5-5", tokens: { inputTokens: 400, outputTokens: 900, cacheWriteTokens: 3000, cacheReadTokens: 0 } },
    });
  });

  it("a cut-off answer fails the job", async () => {
    const { fetchFn } = fakeFetch(() => stream({ text: '{"lessons":[', stopReason: "max_tokens" }));
    const err = await createImportClaude({ apiKey: "k", fetchFn }).converse(input).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "llm_max_tokens", transient: false });
  });

  it("a 400 is final; a 500 is transient", async () => {
    const bad = await createImportClaude({ apiKey: "k", fetchFn: fakeFetch(() => error(400)).fetchFn })
      .converse(input)
      .catch((e: unknown) => e);
    expect(bad).toMatchObject({ code: "llm_http_400", transient: false });

    const down = await createImportClaude({ apiKey: "k", fetchFn: fakeFetch(() => error(500)).fetchFn })
      .converse(input)
      .catch((e: unknown) => e);
    expect(down).toMatchObject({ code: "llm_http_500", transient: true });
  });

  it("a 404 on a call that references the uploaded file means the file expired", async () => {
    const { fetchFn } = fakeFetch(() => error(404));
    const err = await createImportClaude({ apiKey: "k", fetchFn })
      .converse({ ...input, document: { kind: "file", fileId: "file_1" } })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "file_expired", transient: false });
  });

  it("a connection that never answers is transient", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await createImportClaude({ apiKey: "k", fetchFn }).converse(input).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "llm_network", transient: true });
  });
});

describe("files", () => {
  it("uploads once and returns the id", async () => {
    const { fetchFn, requests } = fakeFetch(
      () =>
        new Response(JSON.stringify({ id: "file_abc", type: "file", filename: "source.pdf", size_bytes: 3, mime_type: "application/pdf", created_at: "2026-10-24T00:00:00Z", downloadable: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const id = await createImportClaude({ apiKey: "k", fetchFn }).uploadFile({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "source.pdf",
      mediaType: "application/pdf",
    });
    expect(id).toBe("file_abc");
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/v1/files");
    expect(requests[0].headers.get("anthropic-beta")).toContain("files-api-2025-04-14");
  });

  it("an upload that fails is classified, not thrown raw", async () => {
    const { fetchFn } = fakeFetch(() => error(413));
    const err = await createImportClaude({ apiKey: "k", fetchFn })
      .uploadFile({ bytes: new Uint8Array([1]), filename: "source.pdf", mediaType: "application/pdf" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "llm_http_413", transient: false });
  });

  it("deletes by id; a file that is already gone counts as deleted; any other failure says false", async () => {
    const deleted = fakeFetch(() => new Response(JSON.stringify({ id: "file_abc", type: "file_deleted" }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await createImportClaude({ apiKey: "k", fetchFn: deleted.fetchFn }).deleteFile("file_abc")).toBe(true);
    expect(deleted.requests[0].method).toBe("DELETE");
    expect(deleted.requests[0].url).toContain("/v1/files/file_abc");

    expect(await createImportClaude({ apiKey: "k", fetchFn: fakeFetch(() => error(404)).fetchFn }).deleteFile("file_abc")).toBe(true);
    expect(await createImportClaude({ apiKey: "k", fetchFn: fakeFetch(() => error(400)).fetchFn }).deleteFile("file_abc")).toBe(false);
  });
});
