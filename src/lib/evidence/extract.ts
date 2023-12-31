import { createHash } from "node:crypto";
import { EVIDENCE_MODEL, parseGated } from "@/lib/ai/client";
import type { Pii } from "@/lib/pii/detect";
import { EVIDENCE_PROMPT_VERSION, EVIDENCE_SYSTEM } from "./prompt";
import { verifyEvidence, type Verified } from "./verify";
import { toEvidence, wireSchema } from "./wire";

export function evidenceInputHash(redactedText: string): string {
  return createHash("sha256").update(`${EVIDENCE_PROMPT_VERSION}\n${redactedText}`).digest("hex");
}

export async function extractEvidence(redactedText: string, pii: Pii): Promise<Verified> {
  const wire = await parseGated({
    pii,
    model: EVIDENCE_MODEL,
    system: EVIDENCE_SYSTEM,
    user: `CV text:\n\n${redactedText}`,
    schema: wireSchema,
    effort: "high",
    maxTokens: 32000,
  });
  return verifyEvidence(toEvidence(wire), redactedText);
}

export type EvidenceCache = {
  get(inputHash: string): Promise<Verified | null>;
  put(inputHash: string, value: Verified): Promise<void>;
};

// Same redacted text and prompt version → stored evidence, no AI call.
export async function evidenceWithCache(
  redactedText: string,
  pii: Pii,
  cache: EvidenceCache,
  extract: typeof extractEvidence = extractEvidence,
): Promise<Verified & { inputHash: string; cached: boolean }> {
  const inputHash = evidenceInputHash(redactedText);
  const hit = await cache.get(inputHash);
  if (hit) return { ...hit, inputHash, cached: true };
  const fresh = await extract(redactedText, pii);
  await cache.put(inputHash, fresh);
  return { ...fresh, inputHash, cached: false };
}
