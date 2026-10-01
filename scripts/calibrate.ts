import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { candidates, flags, scores } from "../src/db/schema";
import type { RoleKey, SubScore } from "../src/lib/types";
import { exitAfterFlush } from "./exit";

// Compares the imported 50 with the manual rubric pass (rubric-scoring spec: Calibration).
type Manual = {
  candidates: Record<string, Record<RoleKey, Record<string, number>>>;
  expected_flags: Record<string, string[]>;
};

const manual: Manual = JSON.parse(readFileSync("calibration/manual-scores.json", "utf8"));
const stem = (file: string) => file.replace(/\.(pdf|docx)$/i, "");

(async () => {
  const rows = await db
    .select({ file: candidates.fileName, role: scores.role, total: scores.total, subScores: scores.subScores, id: candidates.id })
    .from(scores)
    .innerJoin(candidates, eq(candidates.id, scores.candidateId));
  const flagRows = await db
    .select({ file: candidates.fileName, type: flags.type })
    .from(flags)
    .innerJoin(candidates, eq(candidates.id, flags.candidateId));

  const total = (file: string, role: RoleKey) => rows.find((r) => stem(r.file) === file && r.role === role)?.total ?? NaN;
  const results: { name: string; pass: boolean; detail: string[] }[] = [];

  const band = (name: string, files: string[], test: (value: number) => boolean) => {
    const broken = files.filter((file) => !test(total(file, "pm"))).map((file) => `${file}: ${total(file, "pm")}`);
    results.push({ name, pass: broken.length === 0, detail: broken });
  };
  const pmFiles = (from: number, to: number) =>
    Object.keys(manual.candidates).filter((file) => {
      const match = file.match(/^pm_(\d+)_/);
      return match && Number(match[1]) >= from && Number(match[1]) <= to;
    });
  band("PM totals of pm_01–pm_05 are all ≥ 85", pmFiles(1, 5), (v) => v >= 85);
  band("PM totals of pm_06–pm_10 are between 55 and 90 (manual band 60–85, ±5)", pmFiles(6, 10), (v) => v >= 55 && v <= 90);
  band("PM totals of pm_11–pm_15 are all ≤ 55", pmFiles(11, 15), (v) => v <= 55);

  // Rank agreement with the manual pass (Kendall tau-b, which handles the many tied totals).
  const tauB = (xs: number[], ys: number[]) => {
    let concordant = 0;
    let discordant = 0;
    let tiesX = 0;
    let tiesY = 0;
    for (let i = 0; i < xs.length; i += 1) {
      for (let j = i + 1; j < xs.length; j += 1) {
        const dx = Math.sign(xs[i] - xs[j]);
        const dy = Math.sign(ys[i] - ys[j]);
        if (dx === 0 && dy === 0) continue;
        if (dx === 0) tiesX += 1;
        else if (dy === 0) tiesY += 1;
        else if (dx === dy) concordant += 1;
        else discordant += 1;
      }
    }
    const denom = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
    return denom === 0 ? 0 : (concordant - discordant) / denom;
  };
  for (const role of ["pm", "spm"] as RoleKey[]) {
    const files = Object.keys(manual.candidates).filter((file) => Number.isFinite(total(file, role)));
    const tau = tauB(files.map((f) => total(f, role)), files.map((f) => (manual.candidates[f][role] as unknown as { total: number }).total));
    results.push({ name: `Rank agreement (Kendall τ-b) with manual ${role === "pm" ? "PM" : "Senior PM"} totals ≥ 0.6 (τ = ${tau.toFixed(2)}, n = ${files.length})`, pass: tau >= 0.6, detail: [] });
  }

  const spmRanked = rows.filter((r) => r.role === "spm").sort((a, b) => b.total - a.total);
  const spmBroken = ["spm_16", "spm_17", "spm_18", "spm_19", "spm_20"]
    .map((prefix) => {
      const index = spmRanked.findIndex((r) => r.file.startsWith(prefix));
      return { file: spmRanked[index]?.file ?? prefix, total: spmRanked[index]?.total ?? NaN, rank: index + 1 };
    })
    .filter((entry) => !(entry.total >= 70 && entry.rank >= 1 && entry.rank <= 8))
    .map((entry) => `${stem(entry.file)}: total ${entry.total}, rank ${entry.rank}`);
  results.push({ name: "Every spm_16–spm_20 Senior PM total is ≥ 70 and ranks in the top 8", pass: spmBroken.length === 0, detail: spmBroken });

  let within = 0;
  let count = 0;
  const disagreements: string[] = [];
  for (const [file, byRole] of Object.entries(manual.candidates)) {
    for (const role of ["pm", "spm"] as RoleKey[]) {
      const actual = rows.find((r) => stem(r.file) === file && r.role === role);
      if (!actual) continue;
      for (const item of actual.subScores as SubScore[]) {
        const expected = byRole[role][item.criterion];
        count += 1;
        if (Math.abs(expected - item.score) <= 1) within += 1;
        else
          disagreements.push(
            `${file} ${item.criterion}: manual ${expected}, code ${item.score} — ${item.anchor}${item.quotes[0] ? ` — "${item.quotes[0].slice(0, 90)}"` : ""}`,
          );
      }
    }
  }
  const share = count ? within / count : 0;
  results.push({
    name: `≥ 80% of sub-scores within ±1 of the manual pass (${within}/${count} = ${(share * 100).toFixed(1)}%)`,
    pass: share >= 0.8,
    detail: [],
  });

  const missing: string[] = [];
  for (const [file, types] of Object.entries(manual.expected_flags)) {
    for (const type of types) {
      if (!flagRows.some((f) => stem(f.file) === file && f.type === type)) missing.push(`${file}: ${type}`);
    }
  }
  results.push({ name: "Every expected integrity flag is raised", pass: missing.length === 0, detail: missing });

  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}`);
    for (const line of result.detail) console.log(`        ${line}`);
  }
  if (disagreements.length) {
    console.log(`\nSub-score disagreements beyond ±1 (${disagreements.length}):`);
    for (const line of disagreements) console.log(`  ${line}`);
  }
  const extra = flagRows
    .filter((f) => !(manual.expected_flags[stem(f.file)] ?? []).includes(f.type))
    .map((f) => `${stem(f.file)}: ${f.type}`);
  if (extra.length) console.log(`\nFlags raised beyond the manual pass (${extra.length}):\n  ${extra.join("\n  ")}`);
  await exitAfterFlush(results.every((result) => result.pass) ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  await exitAfterFlush(1);
});
