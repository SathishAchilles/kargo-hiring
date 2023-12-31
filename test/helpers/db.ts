import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { db } from "@/db/client";
import { candidates, cvTexts, evidence } from "@/db/schema";
import { createCandidate } from "@/lib/candidates/service";
import { EVIDENCE_PROMPT_VERSION } from "@/lib/evidence/prompt";
import type { Evidence } from "@/lib/evidence/schema";
import { dbPipelineStore } from "@/lib/pipeline";
import { runPipeline } from "@/lib/pipeline/runner";
import { pipelineSteps } from "@/lib/pipeline/steps";
import { role } from "./evidence";
import { RESUME_DIR } from "./resumes";

export const created: string[] = [];

export async function cleanup() {
  for (const id of created.splice(0)) await db.delete(candidates).where(eq(candidates.id, id));
}

// A unique copy of a real CV (trailing bytes change the hash, not the text).
export function uniqueCv(file: string) {
  const bytes = readFileSync(`${RESUME_DIR}/${file}`);
  return new Uint8Array(Buffer.concat([bytes, Buffer.from(`\n%test-${Date.now()}-${Math.random()}\n`)]));
}

export const sampleEvidence = (): Evidence => ({
  roles: [role({ start: "2022-08", end: "present", soleOrFirstPm: true, quote: "Product Manager" })],
  education: [],
  shipped: [{ what: "exception alerts", outcome: "-34% exceptions", iterated: true, roleIndex: 0, quote: "alerts" }],
  killed: [],
  discovery: [],
  integrations: [],
  platforms: [],
  decisions: [],
  statedFigures: [],
  location: { text: "Mumbai", quote: "Mumbai" },
});

// A scored candidate built from a real CV with pre-seeded evidence (no AI call).
export async function scoredCandidate(asOfDate: string, record: Evidence = sampleEvidence()) {
  const { id } = await createCandidate({
    bytes: uniqueCv("pm_01_priya_krishnan.pdf"),
    fileName: "pm_01_priya_krishnan.pdf",
    fileMime: "application/pdf",
    appliedRole: "pm",
    asOfDate,
  });
  created.push(id);
  await pipelineSteps.extracting(id);
  await pipelineSteps.preparing(id);
  const [text] = await db.select().from(cvTexts).where(eq(cvTexts.candidateId, id));
  await db.insert(evidence).values({
    candidateId: id,
    record,
    promptVersion: EVIDENCE_PROMPT_VERSION,
    inputHash: `test-${id}-${text.redactionVersion}`,
  });
  await dbPipelineStore.set(id, "failed", { failedStep: "scoring", reason: null });
  expect(await runPipeline(id, dbPipelineStore, pipelineSteps)).toBe("ready");
  return id;
}
