import { expect, test } from "@playwright/test";
import { hasData, NEEDS_DATA, signIn } from "./session";

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  test.skip(!(await hasData(page)), NEEDS_DATA);
});

test("hovering a name shows the radar chart with each criterion and its score", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const row = page.locator("table tbody tr").first();
  await row.locator("td:nth-child(2) a").hover();
  const preview = page.getByTestId("radar-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("img", { name: /^Sub-scores: P1 \d, P2 \d, P3 \d, P4 \d, P5 \d$/ })).toBeVisible();
  for (const id of ["P1", "P2", "P3", "P4", "P5"]) await expect(preview).toContainText(`${id} `);
  await expect(preview.getByText(/\d\/5/)).toHaveCount(5);
  await expect(preview).toContainText("Radar chart: each axis is one rubric criterion scored 0 to 5. The outer ring is 5.");
  await expect(preview).toContainText(/Total \d+/);

  await page.mouse.move(5, 5);
  await expect(preview).toHaveCount(0);
});

test("keyboard focus opens the preview and Escape closes it, without leaving the list", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").focus();
  await expect(page.getByTestId("radar-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("radar-preview")).toHaveCount(0);
  expect(page.url()).toContain("/?role=pm");
});

test("hovering the total opens the same preview, and the name still opens the page", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const row = page.locator("table tbody tr").first();
  await row.getByTestId("total").hover();
  await expect(page.getByTestId("radar-preview")).toBeVisible();
  await page.mouse.move(5, 5);
  await row.locator("td:nth-child(2) a").click();
  await expect(page).toHaveURL(/\/candidates\//);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("tapping the total opens the preview inside the screen", async ({ page }) => {
    await page.goto("/?role=pm", { waitUntil: "networkidle" });
    await page.locator("ul li").filter({ has: page.getByLabel("Sub-scores") }).first().getByTestId("total").tap();
    const preview = page.getByTestId("radar-preview");
    await expect(preview).toBeVisible();
    const box = (await preview.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
