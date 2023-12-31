import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { db } from "../src/db/client";
import { candidates } from "../src/db/schema";
import { signIn } from "./session";

// The real thing, end to end, from the UI: upload a CV, watch it process, see it ranked.
// It makes one live AI call (about 30 seconds, a few cents), so it only runs on request:
//   E2E_LIVE=1 npm run e2e -- e2e/upload.spec.ts
const CV = path.join(homedir(), "ws/resumes/pm_01_priya_krishnan.pdf");
const NAME = `e2e-upload-${Date.now()}.pdf`;

test.skip(!process.env.E2E_LIVE, "set E2E_LIVE=1 to run: it makes a live AI call");

test.afterAll(async () => {
  await db.delete(candidates).where(like(candidates.fileName, "e2e-upload-%"));
});

test("upload a CV from the dialog, set its as-of date, and see it ranked", async ({ page, context }) => {
  test.setTimeout(180_000);
  await signIn(context);
  await page.goto("/?role=pm", { waitUntil: "networkidle" });

  const before = await page.locator("table tbody tr").count();
  const open = page.getByRole("button", { name: "Upload CVs" }).first();
  await open.click();

  await page.getByRole("radio", { name: /^Product Manager/ }).click();
  // Unique bytes, so it is a new candidate even if this CV was imported before.
  const bytes = Buffer.concat([readFileSync(CV), Buffer.from(`\n%${NAME}\n`)]);
  await page.locator("#files").setInputFiles({ name: NAME, mimeType: "application/pdf", buffer: bytes });
  await page.locator("#asOf").fill("2025-02-01");
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(page.getByRole("list", { name: "Upload results" })).toContainText(`${NAME}: uploaded, processing`);
  await page.getByRole("button", { name: "Done" }).click();

  // It joins the ranking when the pipeline finishes (the dashboard polls while anything is pending).
  await expect(async () => {
    await page.reload({ waitUntil: "networkidle" });
    expect(await page.locator("table tbody tr").count()).toBe(before + 1);
  }).toPass({ timeout: 150_000, intervals: [4000] });

  const [row] = await db.select().from(candidates).where(eq(candidates.fileName, NAME));
  expect(row.status).toBe("ready");
  expect(row.asOfDate).toBe("2025-02-01");

  await page.goto(`/candidates/${row.id}?role=pm`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("As-of date")).toHaveValue("2025-02-01");
  await expect(page.getByRole("heading", { name: /^Why \d+ for PM$/ })).toBeVisible();
});
