import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import type { Pii } from "@/lib/pii/detect";
import { assertNoPii } from "@/lib/pii/gate";

// The only module allowed to call the Gemini API (enforced by test/ai-gate.test.ts).
// Every request is checked by the leak gate before it leaves the process.

export const EVIDENCE_MODEL = "gemini-3.1-pro-preview";
export const DRAFT_MODEL = "gemini-3.8-flash";

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

// What the rest of the module works with, whatever the provider returns.
export type ProviderRequest = {
  model: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType;
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

export type ProviderResult = {
  stop_reason: "end_turn" | "refusal" | "max_tokens";
  parsed_output: unknown | null;
};

type Provider = (request: ProviderRequest) => Promise<ProviderResult>;

let client: GoogleGenAI | null = null;
let providerOverride: Provider | null = null;

// Tests swap the network call; production uses the real SDK client.
export function setParseForTests(provider: Provider | null) {
  providerOverride = provider;
}

const THINKING: Record<ProviderRequest["effort"], ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Gemini 3 models take a thinking level; earlier ones take a token budget (-1 lets the model decide).
function thinkingFor(model: string, effort: ProviderRequest["effort"]): GenerateContentConfig["thinkingConfig"] {
  return model.startsWith("gemini-3") ? { thinkingLevel: THINKING[effort] } : { thinkingBudget: -1 };
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 6_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(request: ProviderRequest): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiResponseError("is not configured: set GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey, httpOptions: { timeout: 10 * 60 * 1000 } });

  const config: GenerateContentConfig = {
    systemInstruction: request.system,
    responseMimeType: "application/json",
    responseJsonSchema: request.jsonSchema,
    maxOutputTokens: request.maxTokens,
    thinkingConfig: thinkingFor(request.model, request.effort),
  };

  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await client.models.generateContent({ model: request.model, contents: request.user, config });
      break;
    } catch (error) {
      const retryable = error instanceof ApiError && RETRY_STATUS.has(error.status);
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }

  if (response.promptFeedback?.blockReason) return { stop_reason: "refusal", parsed_output: null };
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") return { stop_reason: "max_tokens", parsed_output: null };
  if (finish && finish !== "STOP") return { stop_reason: "refusal", parsed_output: null };

  const text = response.text;
  if (!text) return { stop_reason: "end_turn", parsed_output: null };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { stop_reason: "end_turn", parsed_output: null };
  }
  const checked = request.schema.safeParse(json);
  return { stop_reason: "end_turn", parsed_output: checked.success ? checked.data : null };
}

export type GatedRequest<Schema extends z.ZodType> = {
  pii: Pii;
  model: string;
  system: string;
  user: string;
  schema: Schema;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
};

// The JSON Schema Gemini is asked to follow. `$schema` is dropped: the API does not take it.
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export async function parseGated<Schema extends z.ZodType>(
  request: GatedRequest<Schema>,
): Promise<z.infer<Schema>> {
  assertNoPii(`${request.system}\n${request.user}`, request.pii);

  const call = providerOverride ?? callGemini;
  const response = await call({
    model: request.model,
    system: request.system,
    user: request.user,
    jsonSchema: jsonSchemaFor(request.schema),
    schema: request.schema,
    effort: request.effort,
    maxTokens: request.maxTokens ?? 16000,
  });

  if (response.stop_reason === "refusal") throw new AiResponseError("was declined by the model");
  if (response.stop_reason === "max_tokens") throw new AiResponseError("hit the output limit");
  if (!response.parsed_output) throw new AiResponseError("returned output that did not match the schema");
  return response.parsed_output as z.infer<Schema>;
}
