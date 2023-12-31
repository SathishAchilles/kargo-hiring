import { eq, or } from "drizzle-orm";
import { db } from "../src/db/client";
import { candidates } from "../src/db/schema";
import { dbPipelineStore } from "../src/lib/pipeline";
import { runPipeline } from "../src/lib/pipeline/runner";
import { pipelineSteps } from "../src/lib/pipeline/steps";
import { exitAfterFlush } from "./exit";

// Runs (or resumes) the pipeline for one candidate by id or file name.
const key = process.argv[2];

(async () => {
  if (!key) throw new Error("Usage: npm run process -- <candidate id | file name>");
  const byId = /^[0-9a-f-]{36}$/i.test(key);
  const [row] = await db
    .select()
    .from(candidates)
    .where(byId ? or(eq(candidates.id, key), eq(candidates.fileName, key)) : eq(candidates.fileName, key));
  if (!row) throw new Error(`No candidate ${key}`);
  console.log(`before: ${row.status}${row.failedStep ? ` (failed at ${row.failedStep})` : ""}`);
  const started = Date.now();
  const result = await runPipeline(row.id, dbPipelineStore, pipelineSteps);
  const [after] = await db.select().from(candidates).where(eq(candidates.id, row.id));
  console.log(`after:  ${result}${after.statusReason ? ` — ${after.statusReason}` : ""} (${Math.round((Date.now() - started) / 1000)}s)`);
  await exitAfterFlush(result === "failed" ? 1 : 0);
})().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await exitAfterFlush(1);
});
