import { expect, test } from "@playwright/test";
import { signIn } from "./session";

test.beforeEach(async ({ context }) => {
  await signIn(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("the candidate header stays in view while the page scrolls", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  await expect(page.getByRole("heading", { name: /^Why \d+ for PM$/ })).toBeVisible();
  const name = page.locator("header h1");
  await page.mouse.wheel(0, 1500);
  await expect(name).toBeInViewport();
  const top = await name.evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(120);
});

test("integrity flags show as a banner with a copyable question", async ({ page }) => {
  await page.goto("/?role=pm&flag=duplicate");
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  const banner = page.getByRole("region", { name: "Integrity flags" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("flags never change scores");
  await expect(banner).toContainText("Same CV as");
  await page.waitForLoadState("networkidle");
  await banner.getByRole("button", { name: "Copy question" }).first().click();
  await expect(banner.getByRole("button", { name: "Copied" }).first()).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.length).toBeGreaterThan(20);
});

test("a candidate without flags says so instead of showing a banner", async ({ page }) => {
  await page.goto("/?role=pm");
  const clean = page.locator("table tbody tr").filter({ hasNotText: /Flags: \d/ }).first();
  await clean.locator("td:nth-child(2) a").click();
  await expect(page.getByText("No integrity flags.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Integrity flags" })).toHaveCount(0);
});

test("sub-scores show a bar, the weight and the rule that was met", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  const rows = page.locator("ol > li");
  await expect(rows).toHaveCount(5);
  await expect(rows.first().locator("[role=img]")).toHaveAttribute("aria-label", /^P1 Ground-level ops immersion: \d of 5$/);
  await expect(rows.first()).toContainText("weight 25%");
});

test("the email section states where the email will go", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  // The brief and draft are generated the first time a role is opened, so allow for that.
  await expect(page.getByRole("heading", { name: /^Email · / })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/^Test mode: this goes to .+, not to the candidate$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to test inbox" })).toBeVisible();
});
