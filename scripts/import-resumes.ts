import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createCandidate } from "../src/lib/candidates/service";
import { processCandidate } from "../src/lib/pipeline";
import type { RoleKey } from "../src/lib/types";
import { exitAfterFlush } from "./exit";

// One-time import of the CV set in ~/ws/resumes (cv-intake spec: Import).
// pm_* → PM and spm_* → Senior PM, both dated 2025-02-01 because their "Present"
// is written as of early 2025; every other file → PM, dated today.
const DIR = process.env.RESUME_DIR ?? path.join(homedir(), "ws/resumes");
const FIXTURE_AS_OF = "2025-02-01";
const today = new Date().toISOString().slice(0, 10);

function rules(file: string): { appliedRole: RoleKey; asOfDate: string } {
  if (file.startsWith("spm_")) return { appliedRole: "spm", asOfDate: FIXTURE_AS_OF };
  if (file.startsWith("pm_")) return { appliedRole: "pm", asOfDate: FIXTURE_AS_OF };
  return { appliedRole: "pm", asOfDate: today };
}

(async () => {
  const files = readdirSync(DIR).filter((file) => /\.(pdf|docx)$/i.test(file)).sort();
  let createdCount = 0;
  const jobs = [];
  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(path.join(DIR, file)));
    const { id, created } = await createCandidate({
      bytes,
      fileName: file,
      fileMime: file.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ...rules(file),
    });
    if (created) createdCount += 1;
    // Also resumes candidates left failed or unfinished by an earlier run.
    jobs.push(
      processCandidate(id).then(
        (status) => console.log(`${status.padEnd(9)} ${file}`),
        (error) => console.log(`error     ${file}: ${error instanceof Error ? error.message : error}`),
      ),
    );
  }
  console.log(`${files.length} files, ${createdCount} new candidates; processing…`);
  await Promise.all(jobs);
  await exitAfterFlush(0);
})().catch(async (error) => {
  console.error(error);
  await exitAfterFlush(1);
});
