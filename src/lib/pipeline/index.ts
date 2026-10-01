import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "@/db/client";
import { candidates } from "@/db/schema";
import { runPipeline, type PipelineStore, type Step } from "./runner";
import { pipelineSteps } from "./steps";

export const dbPipelineStore: PipelineStore = {
  async get(id) {
    const [row] = await db
      .select({ status: candidates.status, failedStep: candidates.failedStep })
      .from(candidates)
      .where(eq(candidates.id, id));
    if (!row) throw new Error("candidate not found");
    return { status: row.status, failedStep: row.failedStep ?? null };
  },
  async set(id, status, detail) {
    await db
      .update(candidates)
      .set({
        status,
        ...(detail?.failedStep !== undefined ? { failedStep: detail.failedStep } : {}),
        ...(detail?.reason !== undefined ? { statusReason: detail.reason } : {}),
      })
      .where(eq(candidates.id, id));
  },
};

// One limiter per process: at most three candidates in flight, so a bulk
// upload does not open dozens of AI requests at once.
const globalLimit = globalThis as unknown as { kargoLimit?: ReturnType<typeof pLimit> };
const limit = (globalLimit.kargoLimit ??= pLimit(3));

export function processCandidate(id: string) {
  return limit(() => runPipeline(id, dbPipelineStore, pipelineSteps));
}

// Re-run from a given step, e.g. after the founder corrects a name.
export async function reprocessFrom(id: string, step: Step) {
  await dbPipelineStore.set(id, "failed", { failedStep: step, reason: null });
  return processCandidate(id);
}
