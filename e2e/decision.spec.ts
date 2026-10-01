import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { decisions, drafts } from "../src/db/schema";
import { APPLIED_PM, hasData, NEEDS_DATA, signIn } from "./session";

// The AI recommends; the founder decides. These specs record decisions, so each one removes the
// ones it made and leaves the data as it found it.
const touched = new Set<string>();

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  test.skip(!(await hasData(page)), NEEDS_DATA);
});

// After every test, so one test's decision never shows up as the next test's starting state.
test.afterEach(async () => {
  if (touched.size) await db.delete(decisions).where(inArray(decisions.candidateId, [...touched]));
  touched.clear();
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
  await expect(decision.getByRole("button", { name: /On hold/ })).toBeVisible();
  await expect(decision.getByRole("button", { name: /Decline/ })).toBeVisible();
});

test("a decision shows on the page and the dashboard, filters the ranking, and can be cleared", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: APPLIED_PM }).first().locator("td:nth-child(2) a").click();
  await page.waitForLoadState("networkidle");
  touched.add(idOf(page.url()));

  const decision = page.getByRole("region", { name: "Your decision" });
  await decision.getByLabel(/^Note/).fill("Referred by a former colleague");
  await decision.getByRole("button", { name: /On hold/ }).click();
  await expect(decision.getByRole("button", { name: /On hold/ })).toHaveAttribute("aria-pressed", "true");
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

  await page.getByRole("region", { name: "Your decision" }).getByRole("button", { name: /On hold/ }).click();
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

// ---- deciding from the list ----

const hrefId = async (row: import("@playwright/test").Locator) =>
  idOf((await row.locator("td:nth-child(2) a").getAttribute("href"))!);

test("the decision panel says where the candidate stands and what each choice does", async ({ page }) => {
  await page.goto("/?role=pm");
  await page.locator("table tbody tr").filter({ hasText: APPLIED_PM }).first().locator("td:nth-child(2) a").click();
  const panel = page.getByRole("region", { name: "Your decision" });
  await expect(panel.getByRole("status")).toHaveText("Not decided. No email will be sent until you decide and click Send.");
  await expect(panel.getByRole("button", { name: /Shortlist/ })).toContainText("Creates an interview invite. Nothing is sent until you click Send.");
  await expect(panel.getByRole("button", { name: /On hold/ })).toContainText("No email. Decide later.");
  await expect(panel.getByRole("button", { name: /Decline/ })).toContainText("Creates a respectful rejection.");
  await page.waitForLoadState("networkidle");
  touched.add(idOf(page.url()));
  await panel.getByRole("button", { name: /Shortlist/ }).click();
  await expect(panel.getByRole("status")).toContainText("You shortlisted this candidate on ");
  await expect(panel.getByRole("button", { name: /Shortlist/ })).toHaveAttribute("aria-pressed", "true");
});

test("shortlisting from the list updates the row and the funnel and keeps the view", async ({ page }) => {
  await page.goto("/?role=pm&sort=total&dir=desc", { waitUntil: "networkidle" });
  const rows = page.locator("table tbody tr");
  const before = await rows.locator("td:nth-child(2) a").allTextContents();
  const row = rows.nth(2);
  touched.add(await hrefId(row));
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByText("Shortlisted")).toBeVisible();
  await expect(row.getByRole("button", { name: "Shortlist" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Your review" })).toContainText("1 of 50 decided");
  expect(page.url()).toContain("sort=total");
  expect(await rows.locator("td:nth-child(2) a").allTextContents()).toEqual(before);
});

test("deciding from the list sends no email", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const row = page.locator("table tbody tr").nth(1);
  const id = await hrefId(row);
  touched.add(id);
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByText("Shortlisted")).toBeVisible();
  const sent = await db.select().from(drafts).where(and(eq(drafts.candidateId, id), eq(drafts.status, "sent")));
  expect(sent).toHaveLength(0);
  await expect(row.locator("td").last()).not.toHaveText("Sent");
});

test("Undo restores the previous state, and the active button toggles off", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const row = page.locator("table tbody tr").nth(3);
  touched.add(await hrefId(row));

  await row.getByRole("button", { name: "Decline" }).click();
  await expect(row.getByText("Declined")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row.getByText("Not decided")).toBeVisible();

  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByText("Shortlisted")).toBeVisible();
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByText("Not decided")).toBeVisible();
});

test("a failed save puts the row back and says so", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const row = page.locator("table tbody tr").nth(4);
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue(),
  );
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toBeVisible();
  await expect(row.getByText("Not decided")).toBeVisible();
  await expect(row.getByRole("button", { name: "Shortlist" })).toHaveAttribute("aria-pressed", "false");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("cards have labelled decision buttons that are easy to tap", async ({ page }) => {
    await page.goto("/?role=pm", { waitUntil: "networkidle" });
    const card = page.locator("ul li").filter({ has: page.getByLabel("Sub-scores") }).first();
    for (const name of ["Shortlist", "On hold", "Decline"]) {
      const button = card.getByRole("button", { name });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    }
    touched.add(idOf((await card.locator("a[href^='/candidates/']").first().getAttribute("href"))!));
    await card.getByRole("button", { name: "On hold" }).click();
    await expect(card.getByText("On hold").first()).toBeVisible();
  });
});
