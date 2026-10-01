import { expect, test } from "@playwright/test";
import { signIn } from "./session";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function rankedNames(page: import("@playwright/test").Page, role: "pm" | "spm") {
  await page.goto(`/?role=${role}`);
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  return rows.locator("td:nth-child(2) a").allTextContents();
}

test("both tabs list every scored candidate, each in its own order", async ({ page }) => {
  const pm = await rankedNames(page, "pm");
  const spm = await rankedNames(page, "spm");
  expect(pm.length).toBe(50);
  expect(spm.length).toBe(50);
  expect([...pm].sort()).toEqual([...spm].sort());
  expect(pm).not.toEqual(spm);
});

test("filters narrow the list without changing ranks", async ({ page }) => {
  await page.goto("/?role=pm");
  const firstRank = await page.locator("table tbody tr").first().locator("td").first().textContent();
  await page.goto("/?role=pm&tier=Shortlist&applied=pm");
  const tiers = await page.locator("table tbody tr td:nth-child(8) span").allTextContents();
  expect(tiers.length).toBeGreaterThan(0);
  expect(new Set(tiers)).toEqual(new Set(["Shortlist"]));
  expect(await page.locator("table tbody tr").first().locator("td").first().textContent()).toBe(firstRank);
});

test("tapping Kill evidence shows the quote behind it", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table").getByRole("button", { name: "Kill evidence" }).first().click();
  const popup = page.locator('[data-slot="popover-content"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Kill evidence");
  await expect(popup).toContainText("—");
});

test("the cohort panel links ties at the top to a filtered list", async ({ page }) => {
  await page.goto("/?role=pm");
  const tie = page.getByRole("link", { name: /tied at/ });
  if (await tie.count()) {
    await tie.click();
    await expect(page).toHaveURL(/top=1/);
    const totals = await page.locator("table tbody tr td:nth-child(8) div").allTextContents();
    expect(new Set(totals).size).toBe(1);
  }
});

test("a P3 = 2 candidate shows the 100+-people anchor and its quote", async ({ page }) => {
  await page.goto("/?role=pm");
  // Column 5 is P3 (after #, candidate, P1, P2).
  const row = page.locator("table tbody tr").filter({ has: page.locator("td:nth-child(5)", { hasText: /^2$/ }) }).first();
  await row.locator("td:nth-child(2) a").click();
  await expect(page.getByRole("heading", { name: /^Why \d+ for PM$/ })).toBeVisible();
  const p3 = page.locator("ol > li").filter({ hasText: "P3 Operating without structure" });
  await expect(p3).toContainText("2/5");
  await expect(p3).toContainText("Product role at a company of 100+ people with a PM above");
  await expect(p3.locator("ul li").first()).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no horizontal scroll, and a candidate shows sub-scores", async ({ page }) => {
    await page.goto("/?role=spm");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator("ul li a[href^='/candidates/']").first().click();
    await expect(page.locator("ol > li")).toHaveCount(5);
    const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(detailOverflow).toBeLessThanOrEqual(0);
  });
});
