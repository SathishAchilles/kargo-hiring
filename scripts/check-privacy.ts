import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { candidatePii, candidates, cvTexts } from "../src/db/schema";
import { assertNoPii } from "../src/lib/pii/gate";
import { exitAfterFlush } from "./exit";

// Re-checks every stored redacted CV against that candidate's personal details,
// i.e. exactly what the leak gate enforces before each AI request.
(async () => {
  const rows = await db
    .select({ file: candidates.fileName, text: cvTexts.redactedText, pii: candidatePii })
    .from(candidates)
    .innerJoin(cvTexts, eq(cvTexts.candidateId, candidates.id))
    .innerJoin(candidatePii, eq(candidatePii.candidateId, candidates.id));
  const leaks: string[] = [];
  for (const row of rows) {
    try {
      assertNoPii(row.text ?? "", row.pii);
    } catch (error) {
      leaks.push(`${row.file}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`${rows.length} redacted CVs checked, ${leaks.length} with personal details`);
  for (const leak of leaks) console.log(`  ${leak}`);
  await exitAfterFlush(leaks.length ? 1 : 0);
})();
