import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Pii } from "@/lib/pii/detect";
import { assertNoPii } from "@/lib/pii/gate";

// The only module allowed to call the Anthropic API (enforced by test/ai-gate.test.ts).
// Every request is checked by the leak gate before it leaves the process.

export const EVIDENCE_MODEL = "claude-opus-5-5";
export const DRAFT_MODEL = "claude-sonnet-5";

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

type Parse = Anthropic["messages"]["parse"];

let client: Anthropic | null = null;
let parseOverride: Parse | null = null;

// Tests swap the network call; production uses the real SDK client.
export function setParseForTests(parse: Parse | null) {
  parseOverride = parse;
}

function parseFn(): Parse {
  if (parseOverride) return parseOverride;
  client ??= new Anthropic({ maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client.messages.parse.bind(client.messages) as Parse;
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

export async function parseGated<Schema extends z.ZodType>(
  request: GatedRequest<Schema>,
): Promise<z.infer<Schema>> {
  assertNoPii(`${request.system}\n${request.user}`, request.pii);

  const response = await parseFn()({
    model: request.model,
    max_tokens: request.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
    system: request.system,
    messages: [{ role: "user", content: request.user }],
  });

  if (response.stop_reason === "refusal") throw new AiResponseError("was declined by the model");
  if (response.stop_reason === "max_tokens") throw new AiResponseError("hit the output limit");
  if (!response.parsed_output) throw new AiResponseError("returned output that did not match the schema");
  return response.parsed_output as z.infer<Schema>;
}
