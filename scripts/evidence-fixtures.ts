import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { extractEvidence } from "../src/lib/evidence/extract";
import { extractText } from "../src/lib/intake/extract";
import { detectPii } from "../src/lib/pii/detect";
import { redact } from "../src/lib/pii/redact";

// Records live evidence for a few CVs as test fixtures (costs a few API calls).
const files = process.argv.slice(2);

(async () => {
  for (const file of files) {
    const started = Date.now();
    const bytes = new Uint8Array(readFileSync(path.join(homedir(), "ws/resumes", file)));
    const { text } = await extractText(bytes, "pdf");
    const pii = detectPii(text, file);
    const redacted = redact(text, pii);
    const { record, dropped } = await extractEvidence(redacted, pii);
    const stem = file.replace(/\.pdf$/, "");
    writeFileSync(`test/fixtures/evidence/${stem}.json`, `${JSON.stringify({ file, dropped, redacted, record }, null, 1)}\n`);
    console.log(
      `${stem}: roles=${record.roles.length} shipped=${record.shipped.length} killed=${record.killed.length} integrations=${record.integrations.length} dropped=${dropped} ${Math.round((Date.now() - started) / 1000)}s`,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
