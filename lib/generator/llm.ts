import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const GENERATOR_MODEL = process.env.ANTHROPIC_MODEL_GENERATOR ?? "claude-sonnet-4-6";
const CRITIC_MODEL = process.env.ANTHROPIC_MODEL_CRITIC ?? "claude-haiku-4-5-20251001";

const client = new Anthropic({ apiKey });

const MAX_RETRIES = 3;

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
}

async function callLLM({
  systemPrompt,
  userPrompt,
  modelId,
  maxTokens = 4096,
  temperature,
}: CallOptions): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        ...(temperature !== undefined && { temperature }),
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("LLM response contained no text block");
      }
      return textBlock.text;
    } catch (e) {
      lastErr = e;
      // Don't retry on auth/validation errors (status 400, 401, 403, 404)
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 429) throw e;
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM call failed after retries");
}

/**
 * Extract a JSON value from an LLM response. Tries fenced code blocks first
 * (```json ... ``` or ``` ... ```), then bare JSON.
 */
export function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) return JSON.parse(arr[0]);
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return JSON.parse(obj[0]);
  throw new Error("No JSON found in LLM response");
}

export async function callGenerator(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const text = await callLLM({ systemPrompt, userPrompt, modelId: GENERATOR_MODEL });
  return extractJSON(text);
}

export async function callCritic(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const text = await callLLM({ systemPrompt, userPrompt, modelId: CRITIC_MODEL });
  return extractJSON(text);
}

// Blind answer-solving (course verification, Layer 2). Uses the critic model at a
// non-zero temperature so k independent samples vary — self-consistency across the
// samples is what catches an arithmetic slip that a single deterministic pass would
// reproduce. Returns raw text (the caller extracts + parses per sample, tolerating
// a malformed one as an abstention rather than failing the batch).
const BLIND_SOLVER_TEMPERATURE = 0.8;
export async function callBlindSolver(systemPrompt: string, userPrompt: string): Promise<string> {
  return callLLM({
    systemPrompt,
    userPrompt,
    modelId: CRITIC_MODEL,
    temperature: BLIND_SOLVER_TEMPERATURE,
  });
}
