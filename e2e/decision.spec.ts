import { expect, test } from "@playwright/test";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { decisions } from "../src/db/schema";
import { APPLIED_PM, hasData, NEEDS_DATA, signIn } from "./session";

// The AI recommends; the founder decides. These specs record decisions, so each one removes the
// ones it made and leaves the data as it found it.
const touched = new Set<string>();

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  test.skip(!(await hasData(page)), NEEDS_DATA);
});

test.afterAll(async () => {
  if (touched.size) await db.delete(decisions).where(inArray(decisions.candidateId, [...touched]));
});

const idOf = (url: string) => url.match(/candidates\/([0-9a-f-]{36})/)![1];

test("nobody is shortlisted until the founder decides, whatever the AI recommends", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const review = page.getByRole("region", { name: "Your review" });
  await expect(review).toContainText("0 of 50 decided");
  await expect(review.getByRole("link", { name: /^Not decided 50$/ })).toBeVisible();
  await expect(review.getByRole("link", { name: /^Shortlisted 0$/ })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toContainText("Not decided");
});

test("a candidate opens in the role they applied for, and the back link keeps the ranking", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: "Applied Senior PM" }).first().locator("td:nth-child(2) a").click();
  await expect(page.getByRole("heading", { name: /^Why \d+ for Senior PM$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "← PM ranking" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your decision" })).toContainText("Senior PM");
});

test("the AI recommendation sits beside the decision control", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: APPLIED_PM }).first().locator("td:nth-child(2) a").click();
  await expect(page.getByText("AI recommendation")).toBeVisible();
  const decision = page.getByRole("region", { name: "Your decision" });
  await expect(decision.getByRole("button", { name: /Shortlist/ })).toBeVisible();
  await expect(decision.getByRole("button", { name: /Put on hold/ })).toBeVisible();
  await expect(decision.getByRole("button", { name: /Decline/ })).toBeVisible();
});

test("a decision shows on the page and the dashboard, filters the ranking, and can be cleared", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: APPLIED_PM }).first().locator("td:nth-child(2) a").click();
  await page.waitForLoadState("networkidle");
  touched.add(idOf(page.url()));

  const decision = page.getByRole("region", { name: "Your decision" });
  await decision.getByLabel(/^Note/).fill("Referred by a former colleague");
  await decision.getByRole("button", { name: /Put on hold/ }).click();
  await expect(decision.getByRole("button", { name: /Put on hold/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("header").getByText("On hold")).toBeVisible();
  await expect(decision).toContainText("Decided ");

  await page.getByRole("link", { name: "← PM ranking" }).click();
  const review = page.getByRole("region", { name: "Your review" });
  await expect(review).toContainText("1 of 50 decided");
  await review.getByRole("link", { name: /^On hold 1$/ }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr").first()).toContainText("On hold");

  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel(/^Note/)).toHaveValue("Referred by a former colleague");
  await page.getByRole("button", { name: "Clear decision" }).click();
  await expect(page.locator("header").getByText("Not decided")).toBeVisible();
});

test("an email cannot be sent until the decision matches it", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?role=pm&tier=Strong&applied=pm");
  await page.locator("table tbody tr").first().locator("td:nth-child(2) a").click();
  await page.waitForLoadState("networkidle");
  touched.add(idOf(page.url()));
  // The brief and draft are generated the first time a role is opened.
  await expect(page.getByRole("heading", { name: /^Email · interview invite · for PM \(applied\)$/ })).toBeVisible({ timeout: 150_000 });

  const send = page.getByRole("button", { name: "Send to test inbox" });
  await expect(send).toBeDisabled();
  await expect(page.getByTestId("send-block")).toContainText("Decide first");

  await page.getByRole("region", { name: "Your decision" }).getByRole("button", { name: /Put on hold/ }).click();
  await expect(page.getByTestId("send-block")).toContainText("on hold");
  await expect(send).toBeDisabled();

  await page.getByRole("region", { name: "Your decision" }).getByRole("button", { name: /Decline/ }).click();
  await expect(page.getByTestId("send-block")).toContainText("Switch the draft to a rejection");
  await expect(send).toBeDisabled();

  await page.getByRole("region", { name: "Your decision" }).getByRole("button", { name: /Shortlist/ }).click();
  await expect(page.getByTestId("send-block")).toHaveCount(0);
  await expect(page.getByText("Differs from the AI recommendation")).toHaveCount(0);
});

test("the email can be written for the other role", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: APPLIED_PM }).first().locator("td:nth-child(2) a").click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^Written for the role they applied for\./)).toBeVisible({ timeout: 150_000 });
  await page.getByRole("link", { name: "Write it for Senior PM instead" }).click();
  await expect(page.getByRole("heading", { name: /^Why \d+ for Senior PM$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "← PM ranking" })).toBeVisible();
});
