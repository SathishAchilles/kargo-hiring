import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { candidates } from "../src/db/schema";
import { dbPipelineStore, processCandidate } from "../src/lib/pipeline";
import { STEPS, type Step } from "../src/lib/pipeline/runner";
import { exitAfterFlush } from "./exit";

// Re-runs every candidate from a step, e.g. after an evidence prompt change:
//   npm run reprocess -- evidence
const step = process.argv[2] as Step;

(async () => {
  if (!STEPS.includes(step)) throw new Error(`Step must be one of: ${STEPS.join(", ")}`);
  const rows = await db.select({ id: candidates.id, file: candidates.fileName }).from(candidates).where(eq(candidates.status, "ready"));
  for (const row of rows) await dbPipelineStore.set(row.id, "failed", { failedStep: step, reason: null });
  console.log(`Reprocessing ${rows.length} candidates from ${step}…`);
  await Promise.all(
    rows.map((row) =>
      processCandidate(row.id).then(
        (status) => console.log(`${status.padEnd(9)} ${row.file}`),
        (error) => console.log(`error     ${row.file}: ${error instanceof Error ? error.message : error}`),
      ),
    ),
  );
  await exitAfterFlush(0);
})().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await exitAfterFlush(1);
});
