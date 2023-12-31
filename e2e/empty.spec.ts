import { expect, test } from "@playwright/test";
import { hasData, signIn } from "./session";

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  test.skip(await hasData(page), "runs only on an empty database: npm run data:reset -- --yes");
});

test("an empty database explains what to do and offers the upload", async ({ page }) => {
  await page.goto("/?role=pm");
  await expect(page.getByRole("heading", { name: "No candidates yet" })).toBeVisible();
  const steps = page.getByRole("region", { name: "Get started" }).getByRole("listitem");
  await expect(steps).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Get started" }).getByRole("button", { name: "Upload CVs" })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
});

test("the upload dialog needs a role and a file before it can submit", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Get started" }).getByRole("button", { name: "Upload CVs" }).click();
  const submit = page.getByRole("button", { name: "Upload", exact: true });
  await expect(submit).toBeDisabled();

  const group = page.getByRole("radiogroup", { name: "Applied role" });
  await group.getByRole("radio", { name: /^Senior Product Manager/ }).click();
  await expect(group.getByRole("radio", { name: /^Senior Product Manager/ })).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio", { name: /^Product Manager/ })).toHaveAttribute("aria-checked", "false");
  await expect(submit).toBeDisabled();

  await page.locator("#files").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await expect(page.getByRole("list", { name: "Chosen files" })).toContainText("cv.pdf");
  await expect(submit).toBeEnabled();

  await page.getByRole("button", { name: "Remove cv.pdf" }).click();
  await expect(submit).toBeDisabled();
});

test("the as-of date cannot be in the future", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Get started" }).getByRole("button", { name: "Upload CVs" }).click();
  const max = await page.locator("#asOf").getAttribute("max");
  expect(max).toBe(new Date().toISOString().slice(0, 10));
});
