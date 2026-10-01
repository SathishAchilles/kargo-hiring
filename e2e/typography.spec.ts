import { expect, test } from "@playwright/test";

test("the UI renders in Geist, not the browser's serif fallback", async ({ page }) => {
  await page.goto("/signin");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.toLowerCase()).toContain("geist");
  const heading = await page.getByRole("heading", { name: "Kargo Hiring" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(heading.toLowerCase()).toContain("geist");
});
