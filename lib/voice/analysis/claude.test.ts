import { describe, expect, it } from "vitest";
import { createClaudeAnalyser, DEFAULT_VOICE_ANALYSIS_MODEL, voiceAnalysisModel } from "./claude";
import { AnalysisStepError } from "./errors";

const ANALYSIS = {
  summary: "You spoke clearly.",
  expressions_used: [],
  highlights: [{ quote: "I used to", kind: "strength", note: "Good chunk." }],
  errors: [],
  main_error: null,
  how_it_sounds: "Warm.",
  goal: "Try one new expression.",
};

function message(over: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(ANALYSIS) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 300, output_tokens: 700, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0 },
    ...over,
  };
}

function fakeFetch(res: () => Response) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({
      url,
      headers: new Headers(init.headers),
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    return res();
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const input = { kind: "first" as const, system: "You give feedback.", user: "<transcript>I used to</transcript>" };

describe("voiceAnalysisModel", () => {
  it("prefers the card's variable, then the one 0182 named, then the default", () => {
    expect(voiceAnalysisModel({ VOICE_ANALYSIS_MODEL: "a", ANTHROPIC_MODEL_VOICE: "b" })).toBe("a");
    expect(voiceAnalysisModel({ ANTHROPIC_MODEL_VOICE: " b " })).toBe("b");
    expect(voiceAnalysisModel({})).toBe(DEFAULT_VOICE_ANALYSIS_MODEL);
    expect(voiceAnalysisModel({ VOICE_ANALYSIS_MODEL: "  " })).toBe("claude-sonnet-5-5");
  });
});

describe("createClaudeAnalyser", () => {
  it("is lazy: building one needs no key and makes no request", () => {
    const { fetchFn, requests } = fakeFetch(() => ok(message()));
    createClaudeAnalyser({ fetchFn });
    expect(requests).toHaveLength(0);
  });

  it("sends the instruction as the cached system block and the transcript as the user message", async () => {
    const { fetchFn, requests } = fakeFetch(() => ok(message()));
    await createClaudeAnalyser({ apiKey: "k", model: "claude-sonnet-5-5", fetchFn }).analyse(input);
    const body = requests[0].body as {
      model: string;
      system: { text: string; cache_control: { type: string } }[];
      messages: { role: string; content: string }[];
      output_config: { effort: string; format: { type: string } };
      fallbacks: unknown;
    };
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.system).toEqual([{ type: "text", text: "You give feedback.", cache_control: { type: "ephemeral" } }]);
    expect(body.messages).toEqual([{ role: "user", content: "<transcript>I used to</transcript>" }]);
    expect(body.output_config.effort).toBe("high");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.fallbacks).toBe("default");
    expect(requests[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("carries no user id, name or email in the request it sends", async () => {
    const { fetchFn, requests } = fakeFetch(() => ok(message()));
    await createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input);
    const wire = JSON.stringify(requests[0].body);
    expect(wire).not.toMatch(/user_id|metadata/);
    expect(wire).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it("returns the parsed analysis, the model that answered and the token usage", async () => {
    const { fetchFn } = fakeFetch(() => ok(message({ model: "fallback-model" })));
    const out = await createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input);
    expect(out.raw.summary).toBe("You spoke clearly.");
    expect(out.model).toBe("fallback-model");
    expect(out.usage).toEqual({
      inputTokens: 300,
      outputTokens: 700,
      cacheWriteTokens: 2000,
      cacheReadTokens: 0,
      effort: "high",
      stopReason: "end_turn",
      fallbackRan: false,
    });
  });

  it("a refusal ends the job: not transient", async () => {
    const { fetchFn } = fakeFetch(() => ok(message({ stop_reason: "refusal", content: [] })));
    await expect(createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input)).rejects.toMatchObject({
      code: "llm_refusal",
      transient: false,
    });
  });

  it("a cut-off answer (max_tokens) ends the job: the SDK throws on the broken JSON, not transient", async () => {
    const { fetchFn } = fakeFetch(() =>
      ok(message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"summ' }] })),
    );
    await expect(createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input)).rejects.toMatchObject({
      code: "llm_unparsable",
      transient: false,
    });
  });

  it("a refusal that came with words ends the job the same way", async () => {
    const { fetchFn } = fakeFetch(() =>
      ok(message({ stop_reason: "refusal", content: [{ type: "text", text: "I cannot help with that." }] })),
    );
    await expect(createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input)).rejects.toMatchObject({
      code: "llm_unparsable",
      transient: false,
    });
  });

  it("an answer that does not match the schema ends the job", async () => {
    const { fetchFn } = fakeFetch(() => ok(message({ content: [{ type: "text", text: JSON.stringify({ summary: 1 }) }] })));
    await expect(createClaudeAnalyser({ apiKey: "k", fetchFn }).analyse(input)).rejects.toMatchObject({
      code: "llm_unparsable",
      transient: false,
    });
  });

  it("a 400 is not transient; a 503 and a dropped connection are", async () => {
    const run = (res: () => Response) =>
      createClaudeAnalyser({ apiKey: "k", fetchFn: fakeFetch(res).fetchFn }).analyse(input).catch((e: unknown) => e);
    const bad = (await run(() => ok({ type: "error", error: { type: "invalid_request_error", message: "no" } }, 400))) as AnalysisStepError;
    expect([bad.code, bad.transient]).toEqual(["llm_http_400", false]);
    const down = (await run(() => ok({ type: "error", error: { type: "api_error", message: "x" } }, 503))) as AnalysisStepError;
    expect([down.code, down.transient]).toEqual(["llm_http_503", true]);
    const dropped = (await createClaudeAnalyser({
      apiKey: "k",
      fetchFn: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    })
      .analyse(input)
      .catch((e: unknown) => e)) as AnalysisStepError;
    expect([dropped.code, dropped.transient]).toEqual(["llm_network", true]);
  });
});
