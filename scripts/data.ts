import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exitAfterFlush } from "./exit";

// Switch the local database between "clean" and "demo" without re-reading 50 CVs with the AI.
//   npm run data:status
//   npm run data:backup  [-- <name>]        saves every kargo_hiring row to backups/<name>.sql (default: demo)
//   npm run data:reset   -- --yes           empties every kargo_hiring table (the schema stays)
//   npm run data:restore [-- <name>] --yes  empties, then loads backups/<name>.sql
// Backups hold real CV data (names, contact details, the CV files), so backups/ is gitignored.

const CONTAINER = process.env.DB_CONTAINER ?? "supabase-db";
const BACKUPS = path.resolve("backups");
const TABLES = ["candidates", "candidate_pii", "cv_files", "cv_texts", "evidence", "scores", "flags", "drafts", "decisions"];

function psql(sql: string, input?: string): string {
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", sql], {
    encoding: "utf8",
    input,
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
}

function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const table of TABLES) out[table] = Number(psql(`select count(*) from kargo_hiring.${table}`));
  return out;
}

function status(label: string) {
  const c = counts();
  console.log(`${label}: ${TABLES.map((t) => `${t}=${c[t]}`).join("  ")}`);
  return c;
}

function backupPath(name: string) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("Backup names may only use letters, digits, - and _");
  return path.join(BACKUPS, `${name}.sql`);
}

function backup(name: string) {
  const before = counts();
  if (before.candidates === 0) throw new Error("Nothing to back up: there are no candidates.");
  mkdirSync(BACKUPS, { recursive: true });
  const dump = execFileSync(
    "docker",
    ["exec", CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "-n", "kargo_hiring", "--data-only"],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  const copies = (dump.match(/^COPY kargo_hiring\./gm) ?? []).length;
  if (copies < TABLES.length - 1) throw new Error(`The dump looks incomplete (${copies} of ${TABLES.length} tables).`);
  writeFileSync(backupPath(name), dump);
  const kb = Math.round(statSync(backupPath(name)).size / 1024);
  console.log(`Saved ${backupPath(name)} (${kb} KB) with ${before.candidates} candidates.`);
}

function reset() {
  psql(`truncate ${TABLES.map((t) => `kargo_hiring.${t}`).join(", ")} cascade`);
}

function restore(name: string) {
  const file = backupPath(name);
  if (!existsSync(file)) throw new Error(`No backup at ${file}. Run npm run data:backup first.`);
  // The Docker "postgres" role is not a superuser, so trigger-disabling statements are refused.
  // pg_dump already orders data-only tables by foreign key, so they are not needed.
  const sql = readFileSync(file, "utf8").replace(/^ALTER TABLE .* (?:DISABLE|ENABLE) TRIGGER ALL;\n/gm, "");
  reset();
  execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const yes = rest.includes("--yes");
  const name = rest.find((arg) => !arg.startsWith("--")) ?? "demo";
  switch (command) {
    case "status":
      status("now");
      break;
    case "backup":
      backup(name);
      break;
    case "reset":
      if (!yes) throw new Error("This empties every candidate. Re-run with: npm run data:reset -- --yes (back up first: npm run data:backup)");
      status("before");
      reset();
      status("after ");
      break;
    case "restore":
      if (!yes) throw new Error(`This replaces the current data with backups/${name}.sql. Re-run with: npm run data:restore -- ${name} --yes`);
      status("before");
      restore(name);
      status("after ");
      break;
    default:
      throw new Error("Usage: npm run data:status | data:backup [name] | data:reset -- --yes | data:restore [name] --yes");
  }
  await exitAfterFlush(0);
})().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await exitAfterFlush(1);
});
